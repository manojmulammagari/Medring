// lib/ums-compiler.ts
// Deterministic UMS rule compiler. Pure functions only: no I/O, no randomness, no model calls.
// Principle: restate, never guess. Anything not stated, or stated inconsistently, becomes an AMBIGUITY_HALT.

import {
    RAW_FIELD_KEYS,
    UMS_SLOTS,
    type AmbiguityHalt,
    type CompiledMedication,
    type CompileResult,
    type DoseEvent,
    type DoseForm,
    type DoseGeometry,
    type ExtractedDocument,
    type ExtractedLine,
    type HaltCode,
    type HaltEvidence,
    type MealRule,
    type PrnInfo,
    type RawFieldKey,
    type RingCell,
    type RingTrack,
    type SlotProvenance,
    type SourceSpan,
    type Telemetry,
    type UmsSlot,
} from '@/types/ums';

/* ═══════════════════════════ Options & constants ═══════════════════════════ */

export interface CompilerOptions {
    /** 'UMS_STANDARD': bare once/twice/three/four-daily map to UMS slots. 'HALT': require an explicit time of day. */
    frequencyOnlyPolicy: 'UMS_STANDARD' | 'HALT';
    maxUnitsPerDose: number;
    maxVolumeMl: number;
}

export const DEFAULT_OPTIONS: CompilerOptions = {
    frequencyOnlyPolicy: 'UMS_STANDARD',
    maxUnitsPerDose: 6,
    maxVolumeMl: 30,
};

/** UMS convention for bare frequencies (verify against the published standard before citing). */
const UMS_FREQUENCY_MAP: Record<1 | 2 | 3 | 4, readonly UmsSlot[]> = {
    1: ['MORNING'],
    2: ['MORNING', 'EVENING'],
    3: ['MORNING', 'NOON', 'EVENING'],
    4: ['MORNING', 'NOON', 'EVENING', 'BEDTIME'],
};

/** Indian "M-A-N" shorthand: Morning-Afternoon-Night. Convention: Night → BEDTIME. */
const PATTERN_SLOTS_3: readonly UmsSlot[] = ['MORNING', 'NOON', 'BEDTIME'];
const PATTERN_SLOTS_4: readonly UmsSlot[] = ['MORNING', 'NOON', 'EVENING', 'BEDTIME'];

const FRACTION_GLYPH = { 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' } as const;

/* ═══════════════════════════ Regex library ═══════════════════════════ */

const AMOUNT = String.raw`(?:\d+\s+\d+/\d+|\d+/\d+|\d*\.\d+|\d+|one[- ]half|a half|half|quarter|one|two|three|four|five|six)`;
const UNITS = String.raw`(tablets?|tabs?|capsules?|caps?|mls?|drops?|gtts?|puffs?|sprays?)`;
const QTY_UNIT_RE = new RegExp(String.raw`(?<![\w./-])(${AMOUNT})\s*${UNITS}\b`, 'i');
const QTY_BARE_RE = new RegExp(String.raw`^(${AMOUNT})$`, 'i');

const NUM = String.raw`(?:\d+(?:\.\d+)?|\d+/\d+)`;
const PATTERN_RE = new RegExp(String.raw`(?<![\w./-])(${NUM}(?:-${NUM}){1,3})(?![\d/-])`);

const DAY = String.raw`(?:a\s+|per\s+)?(?:day|daily)`;
/** Ordered high → low so "twice daily" is consumed before the bare "daily" rule runs. */
const COUNT_RULES: ReadonlyArray<readonly [RegExp, 1 | 2 | 3 | 4]> = [
    [new RegExp(String.raw`\b(?:qid|qds|(?:four|4)\s*(?:times|x)\s*${DAY})\b`, 'i'), 4],
    [new RegExp(String.raw`\b(?:tid|tds|thrice\s*${DAY}|(?:three|3)\s*(?:times|x)\s*${DAY})\b`, 'i'), 3],
    [new RegExp(String.raw`\b(?:bid|bd|twice\s*${DAY}|(?:two|2)\s*(?:times|x)\s*${DAY})\b`, 'i'), 2],
    [
        new RegExp(String.raw`\b(?:od|qd|once\s*${DAY}|(?:one|1)\s*(?:time|x)\s*${DAY}|daily|every\s+day|each\s+day)\b`, 'i'),
        1,
    ],
];

const INTERVAL_RE = /\b(?:every\s+(\d{1,2})\s*(?:hours?|hrs?|h)|q\s?(\d{1,2})\s?h(?:rs?)?)\b/i;

const TIME_WORD_RE: Record<UmsSlot, RegExp> = {
    MORNING: /\b(?:morning|mane|qam)\b/i,
    NOON: /\b(?:noon|midday|afternoon|lunch\s?time)\b/i,
    EVENING: /\b(?:evening|qpm)\b/i,
    BEDTIME: /\b(?:bed\s?time|before\s+bed|qhs|hs|at\s+night|every\s+night|nightly|night|nocte)\b/i,
};

const PRN_RE = /\b(?:prn|sos|as needed|as required|when needed|when required|if needed|if required|(?:at|on)\s+(?:the\s+)?(?:first sign|onset)\s+of)\b/i;
const PRN_STRIP_RE = /\b(?:p\.?r\.?n\.?|s\.?o\.?s\.?|as needed|as required|when needed|when required|if needed|if required)(?![A-Za-z])\.?/gi;
const INDICATION_RE =
    /\b(?:for|to relieve|to treat|to control|(?:at|on)\s+(?:the\s+)?(?:first sign|onset|start)\s+of|during|upon)\s+([A-Za-z][A-Za-z '’ ]{2,60})/i;

const MEAL_BEFORE_RE = /\b(?:before\s+(?:food|meals?|eating|breakfast|lunch|dinner|supper)|(?:on\s+an?\s+)?empty\s+stomach|fasting|30\s*min\s*before)\b/i;
const MEAL_AFTER_RE = /\bafter\s+(?:food|meals?|eating|breakfast|lunch|dinner|supper)\b/i;
const MEAL_WITH_RE = /\b(?:with\s+(?:food|meals?|a\s+meal|milk|breakfast|lunch|dinner|supper|a\s+snack)|during\s+meals?)\b/i;
/** Shorthand is matched only in frequency/timing fields ("AF" in free text can mean atrial fibrillation). */
const SHORT_BEFORE_RE = /(?:^|[\s;,])(?:ac|bf|b\/f|a\/c|bbf)(?=$|[\s;,.])/i;
const SHORT_AFTER_RE = /(?:^|[\s;,])(?:pc|af|a\/f|p\/c|abf)(?=$|[\s;,.])/i;

/* ═══════════════════════════ Text utilities ═══════════════════════════ */

const isText = (s: string | null | undefined): s is string => typeof s === 'string' && s.trim().length > 0;
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Lowercases, expands vulgar fractions, unifies dashes, strips dots from abbreviations (q.i.d. → qid). For matching only. */
export function normalize(s: string): string {
    let t = s
        .replace(/(\d)\s*([½¼¾])/g, '$1 $2')
        .replace(/½/g, '1/2')
        .replace(/¼/g, '1/4')
        .replace(/¾/g, '3/4')
        .replace(/[\u2010-\u2015\u2212]/g, '-')
        .toLowerCase();
    t = t.replace(/\b([a-z])\.([a-z])\.([a-z])\.?/g, '$1$2$3').replace(/\b([a-z])\.([a-z])\.?/g, '$1$2');
    return t.replace(/\s+/g, ' ').trim();
}

/**
 * Finds `fragment` in `raw` within [from, to), whitespace-insensitive, alphanumeric-boundary aware.
 * Returns exact offsets into the ORIGINAL text.
 */
export function locateSpan(raw: string, fragment: string, from = 0, to = raw.length): SourceSpan | null {
    const frag = fragment.trim();
    if (!frag) return null;
    const body = frag.split(/\s+/).map(escapeRegExp).join('\\s+');
    const lead = /^[A-Za-z0-9]/.test(frag) ? '(?<![A-Za-z0-9])' : '';
    const tail = /[A-Za-z0-9]$/.test(frag) ? '(?![A-Za-z0-9])' : '';
    const re = new RegExp(`${lead}${body}${tail}`, 'g');
    re.lastIndex = Math.max(0, from);
    const m = re.exec(raw);
    if (!m) return null;
    const end = m.index + m[0].length;
    return end <= to ? { start: m.index, end } : null;
}

const WORD_AMOUNTS: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    half: 0.5, 'a half': 0.5, 'one half': 0.5, 'one-half': 0.5, quarter: 0.25,
};

function parseAmount(token: string): number | null {
    const t = token.trim().toLowerCase();
    let m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t);
    if (m) {
        const d = Number(m[3]);
        return d ? Number(m[1]) + Number(m[2]) / d : null;
    }
    m = /^(\d+)\/(\d+)$/.exec(t);
    if (m) {
        const d = Number(m[2]);
        return d ? Number(m[1]) / d : null;
    }
    if (/^(?:\d+\.?\d*|\.\d+)$/.test(t)) return Number(t);
    return WORD_AMOUNTS[t] ?? null;
}

const trimNumber = (n: number): string => (Number.isInteger(n) ? String(n) : String(+n.toFixed(2)));

/* ═══════════════════════════ Quantity & geometry ═══════════════════════════ */

export interface ParsedQuantity {
    value: number;
    /** Null when the amount was a bare number with no unit. */
    form: DoseForm | null;
    matched: string;
}

function unitToForm(u: string): DoseForm {
    const x = u.toLowerCase();
    if (x.startsWith('tab')) return 'TABLET';
    if (x.startsWith('cap')) return 'CAPSULE';
    if (x === 'ml' || x === 'mls') return 'LIQUID_ML';
    if (x.startsWith('drop') || x.startsWith('gtt')) return 'DROP';
    if (x.startsWith('puff')) return 'PUFF';
    if (x.startsWith('spray')) return 'SPRAY';
    return 'UNIT';
}

/**
 * Parses "1 tab", "½ tablet", "1 1/2 tablets", "0.5 tab", "5 mL", or a bare "1".
 * Strengths ("500 mg") are deliberately NOT quantities.
 */
export function parseQuantity(text: string): ParsedQuantity | null {
    const t = normalize(text);
    if (!t) return null;
    const m = QTY_UNIT_RE.exec(t);
    if (m) {
        const value = parseAmount(m[1] ?? '');
        if (value !== null) return { value, form: unitToForm(m[2] ?? ''), matched: m[0] };
    }
    const b = QTY_BARE_RE.exec(t);
    if (b) {
        const value = parseAmount(b[1] ?? '');
        if (value !== null) return { value, form: null, matched: b[0] };
    }
    return null;
}

function validateQuantity(q: number, form: DoseForm, opts: CompilerOptions): string | null {
    if (!Number.isFinite(q) || q <= 0) return 'amount is not a positive number';
    if (form === 'LIQUID_ML') {
        if (q > opts.maxVolumeMl) return `volume is above ${opts.maxVolumeMl} mL`;
        if (Math.abs(q * 10 - Math.round(q * 10)) > 1e-9) return 'volume is not a multiple of 0.1 mL';
        return null;
    }
    if (q > opts.maxUnitsPerDose) return `more than ${opts.maxUnitsPerDose} units in one dose`;
    if (Math.abs(q * 4 - Math.round(q * 4)) > 1e-9) return 'amount is not a multiple of a quarter unit';
    if (form !== 'TABLET' && form !== 'UNIT' && !Number.isInteger(q)) return `a ${form.toLowerCase()} cannot be split`;
    return null;
}

/** Fractional dose geometry: 0.5 → ½ scored half, 1 → 1×, 1.5 → 1½×, 2 → 2×. Liquids → volume label. */
export function doseGeometry(quantity: number, form: DoseForm): DoseGeometry {
    if (form === 'LIQUID_ML') return { kind: 'VOLUME', ml: quantity, label: `${trimNumber(quantity)} mL` };
    const whole = Math.floor(quantity + 1e-9);
    const partial = (Math.round((quantity - whole) * 4) / 4) as 0 | 0.25 | 0.5 | 0.75;
    const glyph = FRACTION_GLYPH[partial];
    const label = whole === 0 ? glyph : partial === 0 ? `${whole}×` : `${whole}${glyph}×`;
    return { kind: 'UNITS', whole, partial, label };
}

export const trackFor = (rule: MealRule): RingTrack => (rule === 'BEFORE_FOOD' ? 'INNER' : 'OUTER');

/* ═══════════════════════════ Frequency parsing ═══════════════════════════ */

export type PatternReading =
    | { kind: 'NONE' }
    | { kind: 'OK'; raw: string; positions: number[] }
    | { kind: 'UNSUPPORTED'; raw: string; reason: string };

/**
 * Parses "1-0-1", "1-1-1-1", "½-0-½", "0.5-0-0.5".
 * Non-pattern look-alikes (dates, "5-10 mg") are ignored; ranges ("1-2") and all-zero patterns are UNSUPPORTED.
 */
export function parseDosePattern(text: string): PatternReading {
    const t = normalize(text);
    const m = PATTERN_RE.exec(t);
    if (!m) return { kind: 'NONE' };
    const raw = m[1] ?? '';
    const parts = raw.split('-').map(parseAmount);
    if (parts.some((p) => p === null || p < 0 || p > 6 || Math.abs(p * 4 - Math.round(p * 4)) > 1e-9)) {
        return { kind: 'NONE' };
    }
    const positions = parts as number[];
    if (positions.length === 2) return { kind: 'UNSUPPORTED', raw, reason: 'range or two-part pattern' };
    if (positions.every((p) => p === 0)) return { kind: 'UNSUPPORTED', raw, reason: 'all positions are zero' };
    return { kind: 'OK', raw, positions };
}

export interface FrequencyReading {
    prn: boolean;
    pattern: PatternReading;
    /** Distinct once/twice/three/four-daily counts found (ascending). More than one entry = conflict. */
    counts: Array<1 | 2 | 3 | 4>;
    intervalHours: number | null;
    /** Explicit time-of-day words, in UMS order. */
    timeSlots: UmsSlot[];
    hasOd: boolean;
    eyeContext: boolean;
}

/** q12h → Morning + Bedtime; q8h → Morning + Noon + Bedtime (UMS convention for 12/8-hour intervals). */
const INTERVAL_SLOTS: Record<number, UmsSlot[]> = {
    12: ['MORNING', 'BEDTIME'],
    8: ['MORNING', 'NOON', 'BEDTIME'],
};

/** Reads frequency signals from free text: PRN, M-A-N pattern, once/BID/TID/QID, "every N hours", time words. */
export function readFrequency(text: string): FrequencyReading {
    const t = normalize(text);
    const pattern = parseDosePattern(t);
    let work = pattern.kind === 'NONE' ? t : t.replace(pattern.raw, ' ');

    let intervalHours: number | null = null;
    const im = INTERVAL_RE.exec(work);
    if (im) {
        intervalHours = Number(im[1] ?? im[2]);
        work = work.replace(INTERVAL_RE, ' ');
    }

    // Map 12-hourly / 8-hourly intervals to UMS slots so they never hit the strict-interval halt.
    const intervalSlots: UmsSlot[] = intervalHours !== null && INTERVAL_SLOTS[intervalHours] ? INTERVAL_SLOTS[intervalHours]! : [];
    if (intervalSlots.length > 0) intervalHours = null;

    const counts: Array<1 | 2 | 3 | 4> = [];
    for (const [re, n] of COUNT_RULES) {
        if (re.test(work)) {
            counts.push(n);
            work = work.replace(new RegExp(re.source, 'gi'), ' ');
        }
    }
    counts.sort((a, b) => a - b);

    const wordSlots = UMS_SLOTS.filter((slot) => TIME_WORD_RE[slot].test(work));
    const timeSlots = [...new Set([...wordSlots, ...intervalSlots])];

    return {
        prn: PRN_RE.test(t),
        pattern,
        counts,
        intervalHours,
        timeSlots,
        hasOd: /\bod\b/.test(t),
        eyeContext: /\b(?:eye|eyes|ocular|ophthalmic|right)\b/.test(t),
    };
}

/** Returns the verbatim-derived indication phrase ("for chest pain") or null. Runs on ORIGINAL text. */
export function extractIndication(text: string): string | null {
    const cleaned = text.replace(PRN_STRIP_RE, ' ');
    const m = INDICATION_RE.exec(cleaned);
    if (!m) return null;
    const phrase = oneLine(m[0]);
    return phrase.length > 0 ? phrase : null;
}

/**
 * Meal constraint. Natural-language phrases are scanned over `natural`; AC/PC/AF/BF shorthand only over `shorthand`.
 * BEFORE vs (WITH|AFTER) = conflict. WITH + AFTER collapse to WITH_FOOD (same OUTER track).
 */
export function parseMealRule(natural: string, shorthand = ''): { rule: MealRule; conflict: boolean } {
    const n = normalize(natural);
    const s = normalize(shorthand);
    const before = MEAL_BEFORE_RE.test(n) || SHORT_BEFORE_RE.test(s);
    const after = MEAL_AFTER_RE.test(n) || SHORT_AFTER_RE.test(s);
    const withFood = MEAL_WITH_RE.test(n);
    if (before && (after || withFood)) return { rule: 'NONE_STATED', conflict: true };
    if (before) return { rule: 'BEFORE_FOOD', conflict: false };
    if (withFood) return { rule: 'WITH_FOOD', conflict: false };
    if (after) return { rule: 'AFTER_FOOD', conflict: false };
    return { rule: 'NONE_STATED', conflict: false };
}

/* ═══════════════════════════ Readability & cognitive-load metrics ═══════════════════════════ */

const SENTENCE_ABBREV_RE = /\b(tab|cap|syp|inj|susp|no|dr|mr|mrs|ms|qty|rx|mg|ml)\./gi;
const WORD_TOKEN_RE = /[\p{L}\p{N}]/u;

function tokenize(text: string): string[] {
    return text.split(/\s+/).filter((tok) => WORD_TOKEN_RE.test(tok));
}

export function countWords(text: string): number {
    return tokenize(text).length;
}

function countSentences(text: string): number {
    const parts = text
        .replace(SENTENCE_ABBREV_RE, '$1')
        .split(/(?<=[.!?])\s+|\n+/)
        .filter((p) => WORD_TOKEN_RE.test(p));
    return Math.max(1, parts.length);
}

/** English heuristic. Numerals count one syllable per digit (read-aloud approximation). */
function syllablesInToken(token: string): number {
    const letters = token.toLowerCase().replace(/[^a-z]/g, '');
    let s = token.replace(/\D/g, '').length;
    if (letters.length > 0) {
        if (letters.length <= 3) s += 1;
        else {
            const stripped = letters.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
            s += Math.max(1, stripped.match(/[aeiouy]{1,2}/g)?.length ?? 0);
        }
    }
    return Math.max(1, s);
}

/**
 * Flesch-Kincaid grade = 0.39·(words/sentences) + 11.8·(syllables/words) − 15.59.
 * Table rows count as sentences (newline-delimited). Floored at 0, one decimal. English text only.
 */
export function fleschKincaidGrade(text: string): number {
    const tokens = tokenize(text);
    if (tokens.length === 0) return 0;
    const syllables = tokens.reduce((n, tok) => n + syllablesInToken(tok), 0);
    const grade = 0.39 * (tokens.length / countSentences(text)) + 11.8 * (syllables / tokens.length) - 15.59;
    return Math.max(0, Math.round(grade * 10) / 10);
}

/* ═══════════════════════════ Halt copy ═══════════════════════════ */

interface CopyCtx {
    drug: string;
    quote: string;
    detail: string;
}
interface Copy {
    message: string;
    question: string;
}
const q = (s: string): string => `"${s}"`;

const HALT_COPY: Record<HaltCode, (c: CopyCtx) => Copy> = {
    LINE_NOT_IN_SOURCE: (c) => ({
        message: 'The scan returned text that is not in the original document, so nothing was scheduled.',
        question: `Could you read me the directions for ${c.drug} from the original label or sheet?`,
    }),
    EXTRACTION_NOT_VERBATIM: (c) => ({
        message: `The scanned "${c.detail}" text does not match the original, so this line was not scheduled.`,
        question: `Could you read me the ${c.detail} directions for ${c.drug} from the original?`,
    }),
    DRUG_NAME_MISSING: (c) => ({
        message: 'The medicine name could not be read.',
        question: `I cannot read the medicine name on this line: ${q(c.quote)}. Which medicine is it?`,
    }),
    ILLEGIBLE_OR_TRUNCATED: (c) => ({
        message: 'Part of this label is cut off or hard to read.',
        question: `Part of the label for ${c.drug} is cut off. Could you read me the full directions, including how often, what time of day, and whether to take it with food?`,
    }),
    FREQUENCY_MISSING: (c) => ({
        message: 'The label does not say how often to take this medicine.',
        question: `The label for ${c.drug} does not say how often to take it. How many times a day, and at what times?`,
    }),
    FREQUENCY_UNPARSEABLE: (c) => ({
        message: `The label says ${q(c.quote)}, which could not be read as a clear schedule.`,
        question: `The label for ${c.drug} says ${q(c.quote)}. How often should I take it, and at what times of day?`,
    }),
    FREQUENCY_NEEDS_TIME: (c) => ({
        message: `The label gives a number of doses but no time of day (${q(c.quote)}).`,
        question: `The label for ${c.drug} says ${q(c.quote)} without a time of day. At what times should I take it?`,
    }),
    FREQUENCY_CONFLICT: (c) => ({
        message: 'The label gives two different dose counts per day.',
        question: `The label for ${c.drug} seems to give different numbers of doses per day (${q(c.quote)}). How many times a day is correct?`,
    }),
    INTERVAL_REQUIRES_CLOCK_TIMES: (c) => ({
        message: `The label says ${q(c.detail)}. A four-slot day cannot show that spacing safely, so exact clock times are needed.`,
        question: `The label for ${c.drug} says ${q(c.detail)}. What exact clock times should I take it at, and does the spacing need to be strict?`,
    }),
    PATTERN_UNSUPPORTED: (c) => ({
        message: `The dose pattern ${q(c.quote)} is a range or incomplete, so it was not scheduled.`,
        question: `The label for ${c.drug} says ${q(c.quote)}. How much should I take, and when?`,
    }),
    SLOT_CONFLICT: (c) => ({
        message: 'The times of day on the label do not match the number of doses.',
        question: `The label for ${c.drug} gives times and a number of doses that do not match (${q(c.quote)}). When exactly should I take each dose?`,
    }),
    QUANTITY_MISSING: (c) => ({
        message: 'The label does not say how many tablets (or how much) to take each time. A strength like "500 mg" is not a count.',
        question: `How many tablets (or how much) of ${c.drug} should I take each time? The label only shows ${q(c.quote)}.`,
    }),
    QUANTITY_CONFLICT: (c) => ({
        message: 'The amount per dose differs between parts of the label.',
        question: `The label for ${c.drug} shows different amounts per dose (${q(c.quote)}). How much should I take each time?`,
    }),
    QUANTITY_UNSUPPORTED: (c) => ({
        message: `The amount per dose cannot be shown safely: ${c.detail}.`,
        question: `The label for ${c.drug} gives an amount I cannot show safely (${c.detail}). Please confirm how much to take each time.`,
    }),
    MEAL_RULE_CONFLICT: (c) => ({
        message: 'The label gives conflicting food instructions.',
        question: `The label for ${c.drug} gives conflicting food instructions (${q(c.quote)}). Should I take it before food, with food, or after food?`,
    }),
    PRN_MISSING_INDICATION: (c) => ({
        message: 'The label says "as needed" but not what it is needed for.',
        question: `The label for ${c.drug} says "as needed". What symptom is it for, and how often can I take it at most?`,
    }),
    SCHEDULE_PRN_MIXED: (c) => ({
        message: 'The label mixes a fixed schedule with "as needed".',
        question: `The label for ${c.drug} mixes a fixed schedule with "as needed" (${q(c.quote)}). Is it a daily medicine, an as-needed medicine, or both?`,
    }),
    ABBREVIATION_AMBIGUOUS: (c) => ({
        message: `The abbreviation "${c.detail}" can mean two different things here.`,
        question: `The label for ${c.drug} uses "${c.detail}". Does it mean once daily or right eye, and how should I use it?`,
    }),
};

function composeQuestion(drug: string, halts: readonly AmbiguityHalt[]): string | null {
    if (halts.length === 0) return null;
    if (halts.length === 1) return halts[0]?.pharmacistQuestion ?? null;
    return `Hello, I have questions about ${drug}:\n${halts.map((h, i) => `${i + 1}. ${h.pharmacistQuestion}`).join('\n')}`;
}

/* ═══════════════════════════ Plain-language restatement (English) ═══════════════════════════ */

const SLOT_PHRASE: Record<UmsSlot, string> = {
    MORNING: 'in the morning',
    NOON: 'at noon',
    EVENING: 'in the evening',
    BEDTIME: 'at bedtime',
};
const MEAL_PHRASE: Record<MealRule, string> = {
    BEFORE_FOOD: 'before food (empty stomach)',
    WITH_FOOD: 'with food',
    AFTER_FOOD: 'after food',
    NONE_STATED: '',
};
const FORM_NOUN: Record<Exclude<DoseForm, 'LIQUID_ML'>, string> = {
    TABLET: 'tablet',
    CAPSULE: 'capsule',
    DROP: 'drop',
    PUFF: 'puff',
    SPRAY: 'spray',
    UNIT: 'dose',
};

export function quantityPhrase(quantity: number, form: DoseForm): string {
    const g = doseGeometry(quantity, form);
    if (g.kind === 'VOLUME') return g.label;
    const num = g.whole === 0 ? FRACTION_GLYPH[g.partial] : g.partial === 0 ? String(g.whole) : `${g.whole}${FRACTION_GLYPH[g.partial]}`;
    return `${num} ${FORM_NOUN[form as Exclude<DoseForm, 'LIQUID_ML'>]}${quantity > 1 ? 's' : ''}`;
}

const joinAnd = (parts: readonly string[]): string =>
    parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

const displayName = (name: string, strength: string | null): string => [name, strength].filter(isText).join(' ');

/* ═══════════════════════════ Line compiler ═══════════════════════════ */

interface Plan {
    slot: UmsSlot;
    quantity: number | null;
    provenance: SlotProvenance;
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
    a.length === b.length && a.every((x) => b.includes(x));

function detectFormHint(text: string): DoseForm | null {
    if (/\b(?:syp|syrup|susp|suspension|solution|elixir)\b/i.test(text)) return 'LIQUID_ML';
    if (/\b(?:caps?|capsules?)\b/i.test(text)) return 'CAPSULE';
    if (/\b(?:tabs?|tablets?)\b/i.test(text)) return 'TABLET';
    return null;
}

function stripPattern(text: string, pattern: PatternReading): string {
    const t = normalize(text);
    return pattern.kind === 'NONE' ? t : t.replace(pattern.raw, ' ');
}

function compileLine(line: ExtractedLine, rawText: string, cursor: number, opts: CompilerOptions): CompiledMedication {
    const f = line.fields;

    // 1. Resolve spans (the compiler owns offsets).
    const lineSpan = locateSpan(rawText, line.verbatim, cursor) ?? locateSpan(rawText, line.verbatim, 0);
    const fieldSpans: Partial<Record<RawFieldKey, SourceSpan>> = {};
    if (lineSpan) {
        let c = lineSpan.start;
        for (const key of RAW_FIELD_KEYS) {
            const v = f[key];
            if (!isText(v)) continue;
            const s = locateSpan(rawText, v, c, lineSpan.end) ?? locateSpan(rawText, v, lineSpan.start, lineSpan.end);
            if (s) {
                fieldSpans[key] = s;
            }
        }
    }

    const drugName = (f.drugName ?? '').trim();
    const drugLabel = drugName || 'Unnamed medicine';
    const strength = isText(f.strength) ? f.strength.trim() : null;
    const duration = isText(f.duration) ? f.duration.trim() : null;
    const halts: AmbiguityHalt[] = [];

    const halt = (code: HaltCode, evidenceTexts: ReadonlyArray<string | null | undefined>, detail = ''): void => {
        const evidence: HaltEvidence[] = evidenceTexts.filter(isText).map((text) => ({
            text: text.trim(),
            span: lineSpan ? locateSpan(rawText, text, lineSpan.start, lineSpan.end) : null,
        }));
        const copy = HALT_COPY[code]({ drug: drugLabel, quote: evidence[0]?.text ?? oneLine(line.verbatim), detail });
        halts.push({
            type: 'AMBIGUITY_HALT',
            code,
            lineId: line.id,
            drugLabel,
            message: copy.message,
            pharmacistQuestion: copy.question,
            evidence,
        });
    };

    const base = { lineId: line.id, drugName: drugLabel, strength, duration, verbatim: line.verbatim, span: lineSpan, fieldSpans };
    const halted = (): CompiledMedication => ({
        ...base,
        form: null,
        status: 'HALTED',
        doses: [],
        prn: null,
        halts,
        pharmacistQuestion: composeQuestion(drugLabel, halts),
        plainLanguage: `${displayName(drugName, strength) || 'This medicine'}: ask your pharmacist. The label is unclear.`,
    });

    // 2. Extraction contract: line and every field must be verbatim.
    if (!lineSpan) {
        halt('LINE_NOT_IN_SOURCE', [line.verbatim]);
        return halted();
    }
    for (const key of RAW_FIELD_KEYS) {
        const v = f[key];
        if (isText(v) && !fieldSpans[key]) halt('EXTRACTION_NOT_VERBATIM', [v], key);
    }
    if (halts.length > 0) return halted();

    // 3. Completeness.
    if (!drugName) halt('DRUG_NAME_MISSING', [line.verbatim]);
    if (line.legibility !== 'CLEAR') halt('ILLEGIBLE_OR_TRUNCATED', [line.verbatim]);

    // 4. Read signals.
    const scanText = [f.dose, f.frequency, f.timing, f.instructions].filter(isText).join(' ; ');
    const shorthandText = [f.frequency, f.timing].filter(isText).join(' ; ');
    const reading = readFrequency(scanText);
    const p = reading.pattern;
    const freqEvidence = [f.frequency, f.timing, f.instructions];

    // Stated quantity: dose field first, else frequency/timing (never free-text instructions: "up to 3 tablets" is a limit).
    const stated =
        parseQuantity(f.dose ?? '') ??
        parseQuantity(stripPattern([f.frequency, f.timing].filter(isText).join(' ; '), p));
    const form: DoseForm = stated?.form ?? detectFormHint(line.verbatim) ?? 'UNIT';

    let plans: Plan[] = [];
    let indication: string | null = null;

    if (reading.prn) {
        // 5a. PRN branch: never forced onto a clock hour.
        if (p.kind !== 'NONE') halt('SCHEDULE_PRN_MIXED', freqEvidence);
        indication = extractIndication(scanText);
        if (!indication) halt('PRN_MISSING_INDICATION', [f.frequency, f.instructions]);
        if (!stated) halt('QUANTITY_MISSING', [f.dose, f.frequency]);
        else {
            const err = validateQuantity(stated.value, form, opts);
            if (err) halt('QUANTITY_UNSUPPORTED', [f.dose], err);
        }
    } else if (reading.intervalHours !== null) {
        // 5b. Strict intervals cannot be expressed on a 4-slot grid without distortion.
        halt('INTERVAL_REQUIRES_CLOCK_TIMES', freqEvidence, `every ${reading.intervalHours} hours`);
    } else if (p.kind === 'UNSUPPORTED') {
        halt('PATTERN_UNSUPPORTED', freqEvidence, p.reason);
    } else if (p.kind === 'OK') {
        // 5c. Explicit M-A-N pattern: positions carry per-slot quantities.
        const order = p.positions.length === 3 ? PATTERN_SLOTS_3 : PATTERN_SLOTS_4;
        const active = p.positions.flatMap((qty, i) => (qty > 0 ? [{ slot: order[i] as UmsSlot, qty }] : []));
        if (reading.counts.length > 1 || (reading.counts.length === 1 && reading.counts[0] !== active.length)) {
            halt('FREQUENCY_CONFLICT', freqEvidence);
        }
        if (reading.timeSlots.length > 0 && !sameSet(reading.timeSlots, active.map((a) => a.slot))) {
            halt('SLOT_CONFLICT', freqEvidence);
        }
        if (stated && active.some((a) => Math.abs(a.qty - stated.value) > 1e-9)) {
            halt('QUANTITY_CONFLICT', [f.dose, f.frequency]);
        }
        plans = active.map((a): Plan => ({ slot: a.slot, quantity: a.qty, provenance: 'PATTERN' }));
    } else {
        // 5d. Words: once/BID/TID/QID and/or explicit times of day.
        const S = reading.timeSlots;
        if (reading.counts.length > 1) {
            halt('FREQUENCY_CONFLICT', freqEvidence);
        } else if (reading.counts.length === 1) {
            const n = reading.counts[0] as 1 | 2 | 3 | 4;
            if (S.length === 0) {
                if (opts.frequencyOnlyPolicy === 'HALT') halt('FREQUENCY_NEEDS_TIME', freqEvidence);
                else plans = UMS_FREQUENCY_MAP[n].map((slot): Plan => ({ slot, quantity: null, provenance: 'UMS_FREQUENCY_MAP' }));
            } else if (S.length === n) {
                plans = S.map((slot): Plan => ({ slot, quantity: null, provenance: 'TIME_WORD' }));
            } else {
                halt('SLOT_CONFLICT', freqEvidence);
            }
        } else if (S.length > 0) {
            plans = S.map((slot): Plan => ({ slot, quantity: null, provenance: 'TIME_WORD' }));
        } else if (isText(f.frequency) || isText(f.timing) || isText(f.instructions)) {
            halt('FREQUENCY_UNPARSEABLE', freqEvidence);
        } else {
            halt('FREQUENCY_MISSING', [f.dose]);
        }

        if (plans.length > 0) {
            if (!stated) halt('QUANTITY_MISSING', [f.dose, f.frequency]);
            else plans = plans.map((pl): Plan => ({ ...pl, quantity: stated.value }));
        }
    }

    // 6. Quantity validation for every planned dose.
    for (const pl of plans) {
        if (pl.quantity === null) continue;
        const err = validateQuantity(pl.quantity, form, opts);
        if (err) {
            halt('QUANTITY_UNSUPPORTED', [f.dose, f.frequency], err);
            break;
        }
    }

    // 7. Cross-cutting checks.
    if (reading.hasOd && (reading.eyeContext || form === 'DROP')) halt('ABBREVIATION_AMBIGUOUS', freqEvidence, 'OD');
    const meal = parseMealRule(scanText, shorthandText);
    if (meal.conflict) halt('MEAL_RULE_CONFLICT', [f.timing, f.instructions, f.frequency]);
    if (!reading.prn && plans.length === 0 && halts.length === 0) halt('FREQUENCY_MISSING', [f.dose]);

    if (halts.length > 0) return halted();

    const name = displayName(drugName, strength);

    // 8a. PRN result.
    if (reading.prn) {
        if (!stated || !indication) return halted();
        const prn: PrnInfo = {
            quantity: stated.value,
            form,
            geometry: doseGeometry(stated.value, form),
            indication,
            directionsVerbatim: [f.frequency, f.timing, f.instructions].filter(isText).join(' '),
            mealRule: meal.rule,
        };
        return {
            ...base,
            form,
            status: 'PRN',
            doses: [],
            prn,
            halts: [],
            pharmacistQuestion: null,
            plainLanguage: `${name}: take ${quantityPhrase(stated.value, form)} only if needed, ${indication}.`,
        };
    }

    // 8b. Scheduled result.
    const doses: DoseEvent[] = plans.map((pl) => {
        const quantity = pl.quantity as number;
        return {
            slot: pl.slot,
            quantity,
            geometry: doseGeometry(quantity, form),
            mealRule: meal.rule,
            track: trackFor(meal.rule),
            provenance: pl.provenance,
        };
    });
    const clauses = doses.map((d) => `${quantityPhrase(d.quantity, form)} ${SLOT_PHRASE[d.slot]}`);
    const mealPhrase = MEAL_PHRASE[meal.rule];
    return {
        ...base,
        form,
        status: 'SCHEDULED',
        doses,
        prn: null,
        halts: [],
        pharmacistQuestion: null,
        plainLanguage: `${name}: take ${joinAnd(clauses)}${mealPhrase ? `, ${mealPhrase}` : ''}.`,
    };
}

/* ═══════════════════════════ Ring model & telemetry ═══════════════════════════ */

/** All 8 cells (4 quadrants × 2 tracks), always present, so the UI lays out arcs without collision logic. */
export function buildRingCells(meds: readonly CompiledMedication[]): RingCell[] {
    const cells: RingCell[] = [];
    for (const slot of UMS_SLOTS) {
        for (const track of ['INNER', 'OUTER'] as const) cells.push({ slot, track, items: [] });
    }
    for (const m of meds) {
        if (m.status !== 'SCHEDULED') continue;
        for (const d of m.doses) {
            cells
                .find((c) => c.slot === d.slot && c.track === d.track)
                ?.items.push({
                    lineId: m.lineId,
                    drugName: m.drugName,
                    strength: m.strength,
                    quantity: d.quantity,
                    geometry: d.geometry,
                    mealRule: d.mealRule,
                    form: m.form ?? 'UNIT',
                    provenance: d.provenance,
                });
        }
    }
    return cells;
}

const pct = (before: number, after: number): number => (before > 0 ? Math.round(((before - after) / before) * 100) : 0);

function computeTelemetry(doc: ExtractedDocument, meds: readonly CompiledMedication[]): Telemetry {
    const plainText = meds.map((m) => m.plainLanguage).join('\n');
    const wordsBefore = countWords(doc.rawText);
    const wordsAfterPlain = countWords(plainText);
    const wordsAfterRing = meds.reduce((n, m) => {
        const label = countWords([m.drugName, m.strength ?? ''].join(' ')) + 1;
        return n + label * (m.status === 'SCHEDULED' ? m.doses.length : 1);
    }, 0);

    const doseEvents = meds.reduce((n, m) => n + m.doses.length, 0);
    const prnMeds = meds.filter((m) => m.status === 'PRN').length;
    const haltedMeds = meds.filter((m) => m.status === 'HALTED').length;

    const groups = new Set<string>();
    for (const m of meds) for (const d of m.doses) groups.add(`${d.slot}|${d.track}`);

    const decisionPointsBefore = doc.lines.reduce(
        (n, l) =>
            n + [l.fields.dose, l.fields.frequency, l.fields.timing, l.fields.duration, l.fields.instructions].filter(isText).length,
        0,
    );

    return {
        wordsBefore,
        wordsAfterPlain,
        wordsAfterRing,
        reductionPlainPct: pct(wordsBefore, wordsAfterPlain),
        reductionRingPct: pct(wordsBefore, wordsAfterRing),
        fkGradeBefore: fleschKincaidGrade(doc.rawText),
        fkGradeAfter: fleschKincaidGrade(plainText),
        decisionPointsBefore,
        decisionPointsAfter: groups.size + prnMeds + haltedMeds,
        visualTokens: doseEvents + prnMeds + haltedMeds,
        fastingRules: meds.filter((m) => m.doses.some((d) => d.mealRule === 'BEFORE_FOOD') || m.prn?.mealRule === 'BEFORE_FOOD').length,
        ambiguitiesFlagged: haltedMeds,
    };
}

/* ═══════════════════════════ Public entry point ═══════════════════════════ */

export function compileDocument(doc: ExtractedDocument, options: Partial<CompilerOptions> = {}): CompileResult {
    const opts: CompilerOptions = { ...DEFAULT_OPTIONS, ...options };
    if (!doc.isValidMedicationDocument) return { status: 'INVALID_DOCUMENT', reason: 'NOT_A_MEDICATION_DOCUMENT' };
    if (doc.lines.length === 0 || !doc.rawText.trim()) return { status: 'INVALID_DOCUMENT', reason: 'NO_MEDICATION_LINES' };

    let cursor = 0;
    const medications: CompiledMedication[] = [];
    for (const line of doc.lines) {
        const med = compileLine(line, doc.rawText, cursor, opts);
        medications.push(med);
        if (med.span) cursor = med.span.end;
    }

    return {
        status: 'OK',
        schedule: {
            documentId: doc.documentId,
            kind: doc.kind,
            medications,
            halts: medications.flatMap((m) => m.halts),
            ringCells: buildRingCells(medications),
            telemetry: computeTelemetry(doc, medications),
        },
    };
}