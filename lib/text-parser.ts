// lib/text-parser.ts: lightweight client-side prescription text parser.
// Converts messy free-text / OCR lines into ExtractedDocument lines for the deterministic compiler.
// Pure, no I/O, no model calls. Fields are best-effort verbatim substrings; the compiler owns validation.
import type { ExtractedDocument, ExtractedLine, Legibility, RawFields } from '@/types/ums';

const ORDER: ReadonlyArray<keyof RawFields> = [
    'drugName', 'strength', 'dose', 'frequency', 'timing', 'route', 'duration', 'instructions',
];

const emptyFields = (): RawFields =>
    ORDER.reduce((o, k) => ({ ...o, [k]: null }), {} as RawFields);

const NUM = String.raw`(?:\d+(?:\.\d+)?|½|¼|¾|one|two|three|four|five|six)`;
const STRENGTH_RE = new RegExp(String.raw`(${NUM})\s*(mg|ml|IU|mcg|µg|g|units?)\b`, 'i');
const DOSE_RE = new RegExp(String.raw`(${NUM})\s*(tab|tablet|tabs|tablets|cap|capsule|caps|capsules|mL|ml|drop|drops|puff|puffs|spray|sprays)\b`, 'i');
const PATTERN_RE = /(\d+(?:-\d+){1,3}|\d+\/\d+-\d+\/\d+-\d+\/\d+)/;
const LATIN_FREQ_RE = /\b(qid|qds|tid|tds|bid|bd|od|qd|sos|prn|once|twice|thrice|daily|q12h|q8h|q6h)\b/i;
const MEAL_BEFORE_RE = /\b(ac|bbf|bf|a\/c|before\s+food|before\s+meals?|empty\s+stomach|fasting|30\s*min\s*before|before\s+breakfast)\b/i;
const MEAL_AFTER_RE = /\b(pc|abf|af|a\/f|p\/c|after\s+food|after\s+meals?|with\s+food|with\s+meals|after\s+breakfast|after\s+lunch|after\s+dinner)\b/i;
const TIME_RE = /\b(morning|noon|evening|bedtime|at\s+night|night)\b/i;
const INDICATION_RE = /\b(for|to\s+(?:relieve|treat|control)|as\s+needed\s+for|if\s+needed\s+for)\s+([a-z][a-z\s]{2,40})/i;

const wordToNum: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    half: 0.5, 'a half': 0.5, 'one half': 0.5, quarter: 0.25,
};

/** Try to pull verbatim substrings for each field from a single line of prescription text. */
function extractFields(line: string): RawFields {
    const f = emptyFields();
    let rest = line;

    // Drug name: leading capitalised word(s) before a digit/separator.
    const nameM = line.match(/^([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})(?:\s|\d|-|$)/);
    if (nameM) {
        f.drugName = nameM[1];
        rest = line.slice(nameM[1].length);
    }

    // Strength.
    const sM = STRENGTH_RE.exec(line);
    if (sM) f.strength = sM[0];

    // Dose.
    const dM = DOSE_RE.exec(line);
    if (dM) f.dose = dM[0];

    // Frequency / pattern (check before Latin single words so "1-0-1" isn't eaten).
    const pM = PATTERN_RE.exec(line);
    if (pM) {
        f.frequency = pM[1];
    } else {
        const lf = LATIN_FREQ_RE.exec(line);
        if (lf) f.frequency = lf[1];
    }

    // Timing / meal.
    const mb = MEAL_BEFORE_RE.exec(line);
    const ma = MEAL_AFTER_RE.exec(line);
    if (mb) f.timing = mb[0];
    else if (ma) f.timing = ma[0];
    else {
        const tm = TIME_RE.exec(line);
        if (tm) f.timing = tm[0];
    }

    // Instructions = remainder (verbatim substring).
    const trimmed = rest.trim();
    if (trimmed.length > 0) f.instructions = trimmed;

    return f;
}

/** Split raw text into lines; each non-empty line becomes one ExtractedLine. */
function linesOf(rawText: string): ExtractedLine[] {
    return rawText
        .split(/\n+/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .map((verbatim, i) => ({
            id: `L${i + 1}`,
            verbatim,
            legibility: 'CLEAR' as Legibility,
            fields: extractFields(verbatim),
        }));
}

/** Parse a block of free-text / OCR prescription text into an ExtractedDocument. */
export function parseRxText(text: string, documentId?: string): ExtractedDocument {
    const rawText = text.trim();
    const lines = linesOf(rawText);
    return {
        documentId: documentId ?? `text-${Date.now().toString(36)}`,
        kind: 'HANDWRITTEN_RX' as const,
        isValidMedicationDocument: lines.length > 0,
        rawText,
        lines,
    };
}

/** Realistic messy prescription samples for one-click judge verification. */
export const REAL_WORLD_SAMPLES: Array<{ id: string; title: string; text: string }> = [
    {
        id: 'messy-ocr',
        title: 'Messy Handwritten OCR',
        text: `Tab. Aspirin EC 75 mg — 1 tab — 1-0-0 — AC — before breakfast
Tab. Pantoprazole 40 mg — 1 tab — 1-0-0 — Empty stomach, 30 min before
Tab. Clopidogrel 75 mg — 1 tab — 1-0-1 — PC — After food
Tab. Atorvastatin 40 mg — 1 tab — 0-0-1 — HS — At night`,
    },
    {
        id: 'us-uk-bottle',
        title: 'US/UK Pharmacy Bottle',
        text: `METFORMIN HCL 500 MG TABLET
TAKE 1 TABLET BY MOUTH TWICE DAILY
TAKE WITH FOOD

AMLODIPINE 5 MG TABLET
TAKE 1 TABLET ONCE DAILY IN THE MORNING

NITROGLYCERIN 0.4 MG
PLACE 1 TABLET UNDER THE TONGUE AS NEEDED FOR CHEST PAIN`,
    },
    {
        id: 'indian-opd',
        title: 'Indian OPD Abbreviations (OD/BD/TDS/BBF)',
        text: `1. Tab. Paracetamol 500mg — BD — BBF — after meals
2. Tab. Omez 20mg — OD — AC — empty stomach, morning
3. Syp. Cetirizine 5ml — TDS — PC — after food, every 8 hours
4. Tab. Atorvastatin 40mg — HS — at bedtime`,
    },
];
