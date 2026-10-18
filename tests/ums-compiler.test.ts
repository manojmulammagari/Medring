// tests/ums-compiler.test.ts
// Setup:
//   npm i -D vitest vite-tsconfig-paths
//   vitest.config.ts:
//     import { defineConfig } from 'vitest/config';
//     import tsconfigPaths from 'vite-tsconfig-paths';
//     export default defineConfig({ plugins: [tsconfigPaths()], test: { environment: 'node' } });
//   package.json: "test": "vitest run"

import { describe, expect, it } from 'vitest';
import { CLINICAL_FIXTURES, getFixture } from '@/data/clinical-fixtures';
import {
    buildRingCells,
    compileDocument,
    countWords,
    doseGeometry,
    extractIndication,
    fleschKincaidGrade,
    locateSpan,
    normalize,
    parseDosePattern,
    parseMealRule,
    parseQuantity,
    readFrequency,
    trackFor,
    type CompilerOptions,
} from '@/lib/ums-compiler';
import { ParseLabelError, extractDocument, parseJsonLoose, sanitizeModelOutput, sniffImageMime } from '@/lib/gemini-extract';
import type { CompiledMedication, ExtractedDocument, ExtractedLine, Legibility, RawFields } from '@/types/ums';

/* ───────────── helpers ───────────── */

const F = (p: Partial<RawFields>): RawFields => ({
    drugName: null,
    strength: null,
    dose: null,
    frequency: null,
    timing: null,
    route: null,
    duration: null,
    instructions: null,
    ...p,
});
const ORDER: ReadonlyArray<keyof RawFields> = ['drugName', 'strength', 'dose', 'frequency', 'timing', 'route', 'duration', 'instructions'];

/** Builds a line whose verbatim is its fields joined by " | " (fields are substrings by construction). */
function mk(p: Partial<RawFields>, legibility: Legibility = 'CLEAR', id = 'L1'): ExtractedLine {
    const fields = F(p);
    const verbatim = ORDER.map((k) => fields[k])
        .filter((v): v is string => !!v)
        .join(' | ');
    return { id, verbatim, legibility, fields };
}
const docOf = (lines: ExtractedLine[], rawText?: string): ExtractedDocument => ({
    documentId: 'test',
    kind: 'OTHER',
    isValidMedicationDocument: true,
    rawText: rawText ?? lines.map((l) => l.verbatim).join('\n'),
    lines,
});
function sched(doc: ExtractedDocument, opts?: Partial<CompilerOptions>) {
    const r = compileDocument(doc, opts);
    if (r.status !== 'OK') throw new Error(`expected OK, got ${r.reason}`);
    return r.schedule;
}
const one = (p: Partial<RawFields>, opts?: Partial<CompilerOptions>, legibility?: Legibility): CompiledMedication =>
    sched(docOf([mk(p, legibility)]), opts).medications[0] as CompiledMedication;
const codes = (m: CompiledMedication) => m.halts.map((h) => h.code);

/* ───────────── text utilities ───────────── */

describe('normalize', () => {
    it('expands fractions, unifies dashes, strips abbreviation dots, lowercases', () => {
        expect(normalize('1½ TABLETS')).toBe('1 1/2 tablets');
        expect(normalize('½')).toBe('1/2');
        expect(normalize('Q.I.D.')).toBe('qid');
        expect(normalize('a–b')).toBe('a-b');
        expect(normalize('  Take   1  TAB ')).toBe('take 1 tab');
    });
});

describe('locateSpan', () => {
    it('returns exact offsets into the original text', () => {
        expect(locateSpan('abc 1 tab xyz', '1 tab')).toEqual({ start: 4, end: 9 });
    });
    it('is whitespace-insensitive across line breaks', () => {
        expect(locateSpan('TAKE 1\nTABLET', '1 TABLET')).toEqual({ start: 5, end: 13 });
    });
    it('respects alphanumeric boundaries', () => {
        expect(locateSpan('10 mg', '1 mg')).toBeNull();
    });
    it('respects from/to bounds', () => {
        expect(locateSpan('aa aa', 'aa', 1)).toEqual({ start: 3, end: 5 });
        expect(locateSpan('aa aa', 'aa', 0, 4)).toEqual({ start: 0, end: 2 });
        expect(locateSpan('aa aa', 'aa', 3, 4)).toBeNull();
    });
});

describe('countWords / fleschKincaidGrade', () => {
    it('counts only tokens with a letter or digit', () => {
        expect(countWords('Tab. Aspirin | 75 mg')).toBe(4);
        expect(countWords('')).toBe(0);
    });
    it('is 0 for empty text and ranks dense text above plain text', () => {
        const plain = fleschKincaidGrade('Take one tablet in the morning.');
        const dense = fleschKincaidGrade('Concomitant administration of anticoagulant medication necessitates meticulous monitoring.');
        expect(fleschKincaidGrade('')).toBe(0);
        expect(plain).toBeLessThan(5);
        expect(dense).toBeGreaterThan(12);
        expect(dense).toBeGreaterThan(plain);
    });
});

/* ───────────── quantity & geometry ───────────── */

describe('parseQuantity', () => {
    it('parses amounts with units', () => {
        expect(parseQuantity('1 tab')).toMatchObject({ value: 1, form: 'TABLET' });
        expect(parseQuantity('½ tablet')).toMatchObject({ value: 0.5, form: 'TABLET' });
        expect(parseQuantity('1½ tablets')).toMatchObject({ value: 1.5, form: 'TABLET' });
        expect(parseQuantity('1 1/2 tablets')).toMatchObject({ value: 1.5 });
        expect(parseQuantity('0.5 tab')).toMatchObject({ value: 0.5 });
        expect(parseQuantity('two tablets')).toMatchObject({ value: 2 });
        expect(parseQuantity('one-half tablet')).toMatchObject({ value: 0.5 });
        expect(parseQuantity('5 mL')).toMatchObject({ value: 5, form: 'LIQUID_ML' });
        expect(parseQuantity('1 capsule')).toMatchObject({ value: 1, form: 'CAPSULE' });
    });
    it('accepts a bare number with no form, and never treats a strength as a quantity', () => {
        expect(parseQuantity('1')).toMatchObject({ value: 1, form: null });
        expect(parseQuantity('500 mg')).toBeNull();
        expect(parseQuantity('0.4 mg')).toBeNull();
        expect(parseQuantity('')).toBeNull();
    });
});

describe('doseGeometry', () => {
    it('maps fractional and whole units to glyph labels', () => {
        expect(doseGeometry(0.5, 'TABLET')).toEqual({ kind: 'UNITS', whole: 0, partial: 0.5, label: '½' });
        expect(doseGeometry(0.25, 'TABLET')).toMatchObject({ label: '¼' });
        expect(doseGeometry(1, 'TABLET')).toMatchObject({ whole: 1, partial: 0, label: '1×' });
        expect(doseGeometry(1.5, 'TABLET')).toMatchObject({ whole: 1, partial: 0.5, label: '1½×' });
        expect(doseGeometry(2, 'CAPSULE')).toMatchObject({ label: '2×' });
    });
    it('uses a volume geometry for liquids', () => {
        expect(doseGeometry(5, 'LIQUID_ML')).toEqual({ kind: 'VOLUME', ml: 5, label: '5 mL' });
    });
});

/* ───────────── frequency parsing ───────────── */

describe('parseDosePattern', () => {
    it('parses 3- and 4-part patterns, including fractions', () => {
        expect(parseDosePattern('1-0-1')).toEqual({ kind: 'OK', raw: '1-0-1', positions: [1, 0, 1] });
        expect(parseDosePattern('Freq 1-1-1-1 AC')).toMatchObject({ kind: 'OK', positions: [1, 1, 1, 1] });
        expect(parseDosePattern('½-0-½')).toMatchObject({ kind: 'OK', positions: [0.5, 0, 0.5] });
    });
    it('rejects ranges and all-zero patterns, and ignores look-alikes', () => {
        expect(parseDosePattern('1-2 tablets')).toMatchObject({ kind: 'UNSUPPORTED' });
        expect(parseDosePattern('0-0-0')).toMatchObject({ kind: 'UNSUPPORTED' });
        expect(parseDosePattern('12-10-2026')).toEqual({ kind: 'NONE' });
        expect(parseDosePattern('5-10 mg')).toEqual({ kind: 'NONE' });
        expect(parseDosePattern('twice daily')).toEqual({ kind: 'NONE' });
    });
});

describe('readFrequency', () => {
    it('reads once/BID/TID/QID in words and abbreviations', () => {
        expect(readFrequency('twice daily').counts).toEqual([2]);
        expect(readFrequency('twice a day').counts).toEqual([2]);
        expect(readFrequency('bid').counts).toEqual([2]);
        expect(readFrequency('three times a day').counts).toEqual([3]);
        expect(readFrequency('q.i.d.').counts).toEqual([4]);
        expect(readFrequency('daily').counts).toEqual([1]);
        expect(readFrequency('od')).toMatchObject({ counts: [1], hasOd: true });
    });
    it('reads intervals, PRN, time words, and combined signals', () => {
        expect(readFrequency('every 8 hours')).toMatchObject({ intervalHours: 8, counts: [] });
        expect(readFrequency('q8h').intervalHours).toBe(8);
        expect(readFrequency('as needed for pain').prn).toBe(true);
        expect(readFrequency('SOS').prn).toBe(true);
        expect(readFrequency('once daily at bedtime')).toMatchObject({ counts: [1], timeSlots: ['BEDTIME'] });
        expect(readFrequency('1-0-1 twice daily')).toMatchObject({ pattern: { kind: 'OK' }, counts: [2] });
    });
});

describe('parseMealRule', () => {
    it('detects before / with / after food', () => {
        expect(parseMealRule('before food')).toEqual({ rule: 'BEFORE_FOOD', conflict: false });
        expect(parseMealRule('on an empty stomach')).toEqual({ rule: 'BEFORE_FOOD', conflict: false });
        expect(parseMealRule('fasting')).toEqual({ rule: 'BEFORE_FOOD', conflict: false });
        expect(parseMealRule('with food')).toEqual({ rule: 'WITH_FOOD', conflict: false });
        expect(parseMealRule('after dinner')).toEqual({ rule: 'AFTER_FOOD', conflict: false });
        expect(parseMealRule('nothing about food')).toEqual({ rule: 'NONE_STATED', conflict: false });
    });
    it('flags before-vs-with/after as a conflict', () => {
        expect(parseMealRule('before food, with food').conflict).toBe(true);
        expect(parseMealRule('before meals and after meals').conflict).toBe(true);
    });
    it('reads AC/PC shorthand only from the shorthand argument', () => {
        expect(parseMealRule('', 'AC').rule).toBe('BEFORE_FOOD');
        expect(parseMealRule('', 'PC').rule).toBe('AFTER_FOOD');
        expect(parseMealRule('for AF', '')).toEqual({ rule: 'NONE_STATED', conflict: false });
    });
});

describe('extractIndication', () => {
    it('extracts a verbatim-derived indication phrase', () => {
        expect(extractIndication('as needed for chest pain')).toBe('for chest pain');
        expect(extractIndication('PRN for pain; take with water')).toBe('for pain');
        expect(extractIndication('p.r.n. for nausea')).toBe('for nausea');
        expect(extractIndication('as needed to relieve headache')).toBe('to relieve headache');
        expect(extractIndication('at the first sign of chest pain')).toBe('at the first sign of chest pain');
    });
    it('returns null when no indication is stated', () => {
        expect(extractIndication('as needed')).toBeNull();
        expect(extractIndication('1 tablet ; as needed ; max 3 per day')).toBeNull();
    });
});

describe('trackFor', () => {
    it('puts only before-food on the inner ring', () => {
        expect(trackFor('BEFORE_FOOD')).toBe('INNER');
        expect(trackFor('WITH_FOOD')).toBe('OUTER');
        expect(trackFor('AFTER_FOOD')).toBe('OUTER');
        expect(trackFor('NONE_STATED')).toBe('OUTER');
    });
});

/* ───────────── compiler: scheduled results ───────────── */

describe('compileDocument: patterns', () => {
    it('compiles 1-0-1 PC into Morning + Bedtime, after food, outer ring', () => {
        const m = one({ drugName: 'Metoprolol', strength: '25 mg', dose: '1 tab', frequency: '1-0-1', timing: 'PC' });
        expect(m.status).toBe('SCHEDULED');
        expect(m.doses.map((d) => d.slot)).toEqual(['MORNING', 'BEDTIME']);
        expect(m.doses.every((d) => d.mealRule === 'AFTER_FOOD' && d.track === 'OUTER' && d.provenance === 'PATTERN' && d.quantity === 1)).toBe(true);
        expect(m.plainLanguage).toBe('Metoprolol 25 mg: take 1 tablet in the morning and 1 tablet at bedtime, after food.');
    });
    it('puts AC (before food) on the inner ring', () => {
        const m = one({ drugName: 'Aspirin EC', strength: '75 mg', dose: '1 tab', frequency: '1-0-0', timing: 'AC' });
        expect(m.doses).toHaveLength(1);
        expect(m.doses[0]).toMatchObject({ slot: 'MORNING', mealRule: 'BEFORE_FOOD', track: 'INNER' });
    });
    it('takes per-slot quantities from a fractional pattern when no dose is stated', () => {
        const m = one({ drugName: 'Warfarin', strength: '5 mg', frequency: '½-0-½' });
        expect(m.status).toBe('SCHEDULED');
        expect(m.doses.map((d) => d.slot)).toEqual(['MORNING', 'BEDTIME']);
        expect(m.doses.map((d) => d.quantity)).toEqual([0.5, 0.5]);
        expect(m.doses[0]?.geometry).toMatchObject({ label: '½' });
    });
    it('supports one and a half tablets', () => {
        const m = one({ drugName: 'Drug', dose: '1½ tablets', frequency: 'once daily' });
        expect(m.doses[0]).toMatchObject({ quantity: 1.5, geometry: { label: '1½×' } });
    });
    it('compiles liquids with a volume geometry', () => {
        const m = one({ drugName: 'Amoxicillin', strength: '250 mg/5 mL', dose: '5 mL', frequency: 'twice daily' });
        expect(m.form).toBe('LIQUID_ML');
        expect(m.doses[0]?.geometry).toEqual({ kind: 'VOLUME', ml: 5, label: '5 mL' });
    });
});

describe('compileDocument: words and UMS mapping', () => {
    it('maps bare frequencies by UMS convention and marks provenance', () => {
        const twice = one({ drugName: 'Metformin', strength: '500 mg', dose: '1 tablet', frequency: 'twice daily', timing: 'with food' });
        expect(twice.doses.map((d) => d.slot)).toEqual(['MORNING', 'EVENING']);
        expect(twice.doses.every((d) => d.provenance === 'UMS_FREQUENCY_MAP' && d.mealRule === 'WITH_FOOD' && d.track === 'OUTER')).toBe(true);
        expect(one({ drugName: 'D', dose: '1 tablet', frequency: 'once daily' }).doses.map((d) => d.slot)).toEqual(['MORNING']);
        expect(one({ drugName: 'D', dose: '1 tablet', frequency: 'three times daily' }).doses.map((d) => d.slot)).toEqual(['MORNING', 'NOON', 'EVENING']);
        expect(one({ drugName: 'D', dose: '1 tablet', frequency: 'four times daily' }).doses.map((d) => d.slot)).toEqual(['MORNING', 'NOON', 'EVENING', 'BEDTIME']);
    });
    it('prefers explicit times over the UMS map', () => {
        const a = one({ drugName: 'D', dose: '1 tablet', frequency: 'once daily', timing: 'at bedtime' });
        expect(a.doses.map((d) => [d.slot, d.provenance])).toEqual([['BEDTIME', 'TIME_WORD']]);
        const b = one({ drugName: 'D', dose: '1 tablet', frequency: 'twice daily', timing: 'morning and bedtime' });
        expect(b.doses.map((d) => [d.slot, d.provenance])).toEqual([['MORNING', 'TIME_WORD'], ['BEDTIME', 'TIME_WORD']]);
        const c = one({ drugName: 'D', dose: '1 tablet', frequency: 'every morning' });
        expect(c.doses.map((d) => [d.slot, d.provenance])).toEqual([['MORNING', 'TIME_WORD']]);
    });
    it('halts bare frequencies when the policy is HALT', () => {
        const m = one({ drugName: 'D', dose: '1 tablet', frequency: 'twice daily' }, { frequencyOnlyPolicy: 'HALT' });
        expect(codes(m)).toEqual(['FREQUENCY_NEEDS_TIME']);
    });
});

describe('compileDocument: PRN', () => {
    it('routes as-needed medicines to the PRN dock, never a clock slot', () => {
        const m = one({ drugName: 'Nitroglycerin', strength: '0.4 mg', dose: '1 tablet under the tongue', frequency: 'as needed for chest pain' });
        expect(m.status).toBe('PRN');
        expect(m.doses).toEqual([]);
        expect(m.prn).toMatchObject({ quantity: 1, indication: 'for chest pain', mealRule: 'NONE_STATED' });
        expect(m.plainLanguage).toBe('Nitroglycerin 0.4 mg: take 1 tablet only if needed, for chest pain.');
    });
});

/* ───────────── compiler: AMBIGUITY_HALT ───────────── */

describe('compileDocument: halts (restate, never guess)', () => {
    it('halts strict interval dosing and quotes it in the pharmacist question', () => {
        const m = one({ drugName: 'Amoxicillin', strength: '500 mg', dose: '1 capsule', frequency: 'every 8 hours' });
        expect(m.status).toBe('HALTED');
        expect(codes(m)).toEqual(['INTERVAL_REQUIRES_CLOCK_TIMES']);
        expect(m.doses).toEqual([]);
        expect(m.pharmacistQuestion).toContain('every 8 hours');
    });
    it('halts a strength with no tablet count', () => {
        expect(codes(one({ drugName: 'Metformin', dose: '500 mg', frequency: 'twice daily' }))).toEqual(['QUANTITY_MISSING']);
    });
    it('halts conflicting dose counts', () => {
        expect(codes(one({ drugName: 'D', dose: '1 tab', frequency: '1-0-1 once daily' }))).toEqual(['FREQUENCY_CONFLICT']);
    });
    it('halts a pattern that disagrees with the stated time of day', () => {
        expect(codes(one({ drugName: 'D', dose: '1 tab', frequency: '1-0-1', timing: 'at bedtime' }))).toEqual(['SLOT_CONFLICT']);
        expect(codes(one({ drugName: 'D', dose: '1 tab', frequency: 'twice daily', timing: 'in the morning' }))).toEqual(['SLOT_CONFLICT']);
    });
    it('halts conflicting amounts per dose', () => {
        expect(codes(one({ drugName: 'D', dose: '2 tablets', frequency: '1-0-1' }))).toEqual(['QUANTITY_CONFLICT']);
    });
    it('halts conflicting food rules', () => {
        expect(codes(one({ drugName: 'D', dose: '1 tab', frequency: '1-0-0', timing: 'before food, with food' }))).toEqual(['MEAL_RULE_CONFLICT']);
    });
    it('halts as-needed with no indication, and PRN mixed with a fixed pattern', () => {
        expect(codes(one({ drugName: 'D', dose: '1 tablet', frequency: 'as needed' }))).toEqual(['PRN_MISSING_INDICATION']);
        expect(codes(one({ drugName: 'D', dose: '1 tab', frequency: '1-0-1 as needed for pain' }))).toEqual(['SCHEDULE_PRN_MIXED']);
    });
    it('halts dose ranges, unparseable and missing frequencies', () => {
        expect(codes(one({ drugName: 'D', frequency: '1-2 tablets at bedtime' }))).toEqual(['PATTERN_UNSUPPORTED']);
        expect(codes(one({ drugName: 'D', dose: '1 tablet', frequency: 'TWICE DA' }))).toEqual(['FREQUENCY_UNPARSEABLE']);
        expect(codes(one({ drugName: 'D', dose: '1 tablet' }))).toEqual(['FREQUENCY_MISSING']);
    });
    it('halts unsupported quantities', () => {
        expect(codes(one({ drugName: 'D', dose: '½ capsule', frequency: 'once daily' }))).toEqual(['QUANTITY_UNSUPPORTED']);
        expect(codes(one({ drugName: 'D', dose: '8 tablets', frequency: 'once daily' }))).toEqual(['QUANTITY_UNSUPPORTED']);
    });
    it('halts the ambiguous OD abbreviation in an eye context', () => {
        expect(codes(one({ drugName: 'Timolol', strength: '0.5%', dose: '1 drop', frequency: 'OD right eye' }))).toEqual(['ABBREVIATION_AMBIGUOUS']);
    });
    it('halts missing drug names and non-CLEAR legibility', () => {
        expect(codes(one({ dose: '1 tablet', frequency: 'once daily' }))).toEqual(['DRUG_NAME_MISSING']);
        expect(codes(one({ drugName: 'D', dose: '1 tablet', frequency: 'once daily' }, undefined, 'PARTIAL'))).toEqual(['ILLEGIBLE_OR_TRUNCATED']);
    });
    it('enforces the verbatim contract', () => {
        const line: ExtractedLine = {
            id: 'x',
            verbatim: 'Aspirin 75 mg 1 tab 1-0-0',
            legibility: 'CLEAR',
            fields: F({ drugName: 'Aspirin', dose: '1 tab', frequency: '1-0-1' }),
        };
        const m = sched(docOf([line])).medications[0] as CompiledMedication;
        expect(codes(m)).toEqual(['EXTRACTION_NOT_VERBATIM']);
        expect(m.halts[0]?.evidence[0]).toEqual({ text: '1-0-1', span: null });

        const missing = sched(docOf([line], 'completely different text')).medications[0] as CompiledMedication;
        expect(codes(missing)).toEqual(['LINE_NOT_IN_SOURCE']);
    });
    it('returns INVALID_DOCUMENT for non-medication or empty input', () => {
        expect(compileDocument({ ...docOf([mk({ drugName: 'D', dose: '1 tab', frequency: '1-0-0' })]), isValidMedicationDocument: false })).toEqual({
            status: 'INVALID_DOCUMENT',
            reason: 'NOT_A_MEDICATION_DOCUMENT',
        });
        expect(compileDocument({ ...docOf([], 'some text'), lines: [] })).toEqual({ status: 'INVALID_DOCUMENT', reason: 'NO_MEDICATION_LINES' });
    });
    it('is deterministic', () => {
        const doc = getFixture('preset-1')!.document;
        expect(compileDocument(doc)).toEqual(compileDocument(doc));
    });
});

/* ───────────── fixtures (end to end) ───────────── */

describe('fixtures', () => {
    it.each(CLINICAL_FIXTURES.map((f) => [f.id, f] as const))('%s compiles to its expected counts', (_id, fx) => {
        const s = sched(fx.document);
        const m = s.medications;
        expect({
            scheduledMeds: m.filter((x) => x.status === 'SCHEDULED').length,
            doseEvents: m.reduce((n, x) => n + x.doses.length, 0),
            prnMeds: m.filter((x) => x.status === 'PRN').length,
            haltedMeds: m.filter((x) => x.status === 'HALTED').length,
        }).toEqual(fx.expected);
        expect(s.halts).toEqual(m.flatMap((x) => x.halts));
        expect(s.ringCells).toHaveLength(8);
    });

    it('every resolved span slices back to the original text', () => {
        for (const fx of CLINICAL_FIXTURES) {
            const s = sched(fx.document);
            for (const med of s.medications) {
                expect(med.span).not.toBeNull();
                const span = med.span!;
                expect(fx.document.rawText.slice(span.start, span.end)).toBe(med.verbatim);
            }
        }
    });

    it('preset-1: four morning doses split across both tracks without overlap', () => {
        const s = sched(getFixture('preset-1')!.document);
        const cell = (slot: string, track: string) => s.ringCells.find((c) => c.slot === slot && c.track === track)!.items.map((i) => i.drugName);
        expect(cell('MORNING', 'INNER')).toEqual(['Aspirin EC', 'Pantoprazole']);
        expect(cell('MORNING', 'OUTER')).toEqual(['Clopidogrel', 'Metoprolol Succinate']);
        expect(cell('BEDTIME', 'OUTER')).toEqual(['Metoprolol Succinate', 'Atorvastatin', 'Ramipril']);
        expect(s.medications.find((x) => x.lineId === 'f1-atorvastatin')!.doses[0]?.mealRule).toBe('NONE_STATED');
        expect(s.halts).toEqual([]);
        expect(s.telemetry).toMatchObject({
            fastingRules: 2,
            ambiguitiesFlagged: 0,
            visualTokens: 7,
            decisionPointsBefore: 24,
            decisionPointsAfter: 3,
        });
        expect(s.telemetry.wordsAfterRing).toBeLessThan(s.telemetry.wordsAfterPlain);
        expect(s.telemetry.wordsAfterPlain).toBeLessThan(s.telemetry.wordsBefore);
    });

    it('preset-2: split dose, UMS-mapped twice daily, PRN hub with verbatim emergency text', () => {
        const s = sched(getFixture('preset-2')!.document);
        const by = (id: string) => s.medications.find((x) => x.lineId === id)!;
        const warfarin = by('f2-warfarin');
        expect(warfarin.doses[0]).toMatchObject({ slot: 'BEDTIME', provenance: 'TIME_WORD', track: 'OUTER', mealRule: 'NONE_STATED' });
        expect(warfarin.doses[0]?.geometry).toMatchObject({ label: '½' });
        expect(warfarin.plainLanguage).toBe('WARFARIN 5 mg: take ½ tablet at bedtime.');
        expect(by('f2-metformin').doses.every((d) => d.provenance === 'UMS_FREQUENCY_MAP')).toBe(true);
        expect(by('f2-amlodipine').doses[0]).toMatchObject({ slot: 'MORNING', provenance: 'TIME_WORD' });
        const nitro = by('f2-nitroglycerin');
        expect(nitro.status).toBe('PRN');
        expect(nitro.prn?.indication).toBe('for chest pain');
        expect(nitro.prn?.directionsVerbatim).toContain('Call emergency services');
        expect(s.telemetry).toMatchObject({ visualTokens: 5, decisionPointsBefore: 10, decisionPointsAfter: 4, fastingRules: 0 });
    });

    it('preset-3: torn label halts with exact evidence spans while the clear bottle still schedules', () => {
        const fx = getFixture('preset-3')!;
        const s = sched(fx.document);
        const torn = s.medications.find((x) => x.lineId === 'f3-lisinopril-torn')!;
        expect(torn.status).toBe('HALTED');
        expect(codes(torn)).toEqual(expect.arrayContaining(['ILLEGIBLE_OR_TRUNCATED', 'FREQUENCY_UNPARSEABLE']));
        const unparseable = torn.halts.find((h) => h.code === 'FREQUENCY_UNPARSEABLE')!;
        const ev = unparseable.evidence[0]!;
        expect(ev.text).toBe('TWICE DA');
        expect(fx.document.rawText.slice(ev.span!.start, ev.span!.end)).toBe('TWICE DA');
        expect(torn.pharmacistQuestion).toContain('LISINOPRIL');

        const vit = s.medications.find((x) => x.lineId === 'f3-vitamin-d')!;
        expect(vit.status).toBe('SCHEDULED');
        expect(vit.form).toBe('CAPSULE');
        expect(vit.doses[0]).toMatchObject({ slot: 'MORNING', provenance: 'TIME_WORD' });
        expect(s.telemetry).toMatchObject({ ambiguitiesFlagged: 1, visualTokens: 2, decisionPointsBefore: 5, decisionPointsAfter: 2 });
    });

    it('buildRingCells always returns all 8 cells in slot order', () => {
        const cells = buildRingCells(sched(getFixture('preset-3')!.document).medications);
        expect(cells.map((c) => `${c.slot}/${c.track}`)).toEqual([
            'MORNING/INNER', 'MORNING/OUTER', 'NOON/INNER', 'NOON/OUTER', 'EVENING/INNER', 'EVENING/OUTER', 'BEDTIME/INNER', 'BEDTIME/OUTER',
        ]);
    });
});

/* ───────────── layer 1: sanitiser, sniffing, extraction ───────────── */

const modelJson = {
    is_valid_medication_document: true,
    document_kind: 'BOTTLE_LABEL',
    raw_text: 'METFORMIN HCL 500 MG TABLET\nTAKE 1 TABLET BY MOUTH TWICE DAILY\nTAKE WITH FOOD',
    lines: [
        {
            verbatim: 'METFORMIN HCL 500 MG TABLET\nTAKE 1 TABLET BY MOUTH TWICE DAILY\nTAKE WITH FOOD',
            legibility: 'CLEAR',
            is_ambiguous: false,
            drug_name: 'METFORMIN HCL',
            strength: '500 MG',
            dose: '1 TABLET',
            frequency: 'TWICE DAILY',
            timing: 'TAKE WITH FOOD',
            route: 'BY MOUTH',
            duration: null,
            instructions: null,
        },
    ],
};

describe('sanitizeModelOutput', () => {
    it('maps snake_case output into ExtractedDocument and compiles end to end', () => {
        const r = sanitizeModelOutput(modelJson, 'doc1');
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.document).toMatchObject({ documentId: 'doc1', kind: 'BOTTLE_LABEL', isValidMedicationDocument: true });
        expect(r.document.lines[0]).toMatchObject({ id: 'L1', legibility: 'CLEAR' });
        expect(r.document.lines[0]?.fields).toMatchObject({ drugName: 'METFORMIN HCL', strength: '500 MG', route: 'BY MOUTH', duration: null });
        const med = sched(r.document).medications[0] as CompiledMedication;
        expect(med.status).toBe('SCHEDULED');
        expect(med.doses.map((d) => [d.slot, d.mealRule])).toEqual([['MORNING', 'WITH_FOOD'], ['EVENING', 'WITH_FOOD']]);
    });
    it('never trusts CLEAR when the model reports ambiguity or an unknown legibility', () => {
        const base = modelJson.lines[0] as (typeof modelJson.lines)[number];
        const ambiguous = sanitizeModelOutput({ ...modelJson, lines: [{ ...base, is_ambiguous: true }] }, 'd');
        const unknown = sanitizeModelOutput({ ...modelJson, lines: [{ ...base, legibility: 'GREAT' }] }, 'd');
        expect(ambiguous.ok && ambiguous.document.lines[0]?.legibility).toBe('PARTIAL');
        expect(unknown.ok && unknown.document.lines[0]?.legibility).toBe('PARTIAL');
        if (ambiguous.ok) expect(codes(sched(ambiguous.document).medications[0] as CompiledMedication)).toContain('ILLEGIBLE_OR_TRUNCATED');
    });
    it('turns empty strings into null and strips invisible characters', () => {
        const base = modelJson.lines[0] as (typeof modelJson.lines)[number];
        const r = sanitizeModelOutput({ ...modelJson, raw_text: 'AB\u200BC\r\nD', lines: [{ ...base, verbatim: 'AB\u200BC', route: '   ', duration: '' }] }, 'd');
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.document.rawText).toBe('ABC\nD');
        expect(r.document.lines[0]?.verbatim).toBe('ABC');
        expect(r.document.lines[0]?.fields.route).toBeNull();
        expect(r.document.lines[0]?.fields.duration).toBeNull();
    });
    it('returns an empty invalid document for non-medication images', () => {
        const r = sanitizeModelOutput({ is_valid_medication_document: false, document_kind: 'OTHER', raw_text: '', lines: [{ verbatim: 'x' }] }, 'd');
        expect(r).toEqual({ ok: true, document: { documentId: 'd', kind: 'OTHER', isValidMedicationDocument: false, rawText: '', lines: [] } });
        if (r.ok) expect(compileDocument(r.document)).toEqual({ status: 'INVALID_DOCUMENT', reason: 'NOT_A_MEDICATION_DOCUMENT' });
    });
    it('treats a valid document with zero lines as not valid', () => {
        const r = sanitizeModelOutput({ ...modelJson, lines: [] }, 'd');
        expect(r.ok && r.document.isValidMedicationDocument).toBe(false);
    });
    it('rejects malformed output instead of repairing it', () => {
        expect(sanitizeModelOutput(null, 'd').ok).toBe(false);
        expect(sanitizeModelOutput([], 'd').ok).toBe(false);
        expect(sanitizeModelOutput({ ...modelJson, is_valid_medication_document: 'yes' }, 'd').ok).toBe(false);
        expect(sanitizeModelOutput({ ...modelJson, raw_text: '' }, 'd').ok).toBe(false);
        expect(sanitizeModelOutput({ ...modelJson, lines: 'nope' }, 'd').ok).toBe(false);
        expect(sanitizeModelOutput({ ...modelJson, lines: [{ ...(modelJson.lines[0] as object), verbatim: '' }] }, 'd').ok).toBe(false);
        expect(sanitizeModelOutput({ ...modelJson, lines: Array.from({ length: 41 }, () => modelJson.lines[0]) }, 'd').ok).toBe(false);
        expect(sanitizeModelOutput({ ...modelJson, raw_text: 'x'.repeat(20_001) }, 'd').ok).toBe(false);
    });
});

describe('parseJsonLoose', () => {
    it('parses plain, fenced, and embedded JSON; rejects garbage', () => {
        expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
        expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
        expect(parseJsonLoose('Here you go: {"a":1} thanks')).toEqual({ a: 1 });
        expect(parseJsonLoose('not json')).toBeNull();
        expect(parseJsonLoose('')).toBeNull();
    });
});

describe('sniffImageMime', () => {
    const pad = (bytes: number[]) => Uint8Array.from([...bytes, ...Array(Math.max(0, 12 - bytes.length)).fill(0)]);
    it('identifies supported formats by magic bytes', () => {
        expect(sniffImageMime(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
        expect(sniffImageMime(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
        expect(sniffImageMime(pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp');
        expect(sniffImageMime(pad([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]))).toBe('image/heic');
        expect(sniffImageMime(pad([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31]))).toBe('image/heif');
    });
    it('rejects everything else', () => {
        expect(sniffImageMime(new TextEncoder().encode('hello world!'))).toBeNull();
        expect(sniffImageMime(new Uint8Array(4))).toBeNull();
    });
});

describe('extractDocument', () => {
    const img = { mimeType: 'image/png', base64: 'AAAA' };

    it('fails fast with NO_API_KEY when nothing is configured', async () => {
        await expect(extractDocument(img, { apiKey: '' })).rejects.toMatchObject({ code: 'NO_API_KEY' });
    });
    it('retries once on unreadable output', async () => {
        let calls = 0;
        const generate = async () => (++calls === 1 ? 'not json at all' : JSON.stringify(modelJson));
        const doc = await extractDocument(img, { generate, model: 'm1', fallbackModel: null });
        expect(calls).toBe(2);
        expect(doc.isValidMedicationDocument).toBe(true);
    });
    it('gives up with BAD_MODEL_OUTPUT after two bad answers', async () => {
        let calls = 0;
        const generate = async () => {
            calls++;
            return '{"is_valid_medication_document": "maybe"}';
        };
        await expect(extractDocument(img, { generate, model: 'm1', fallbackModel: null })).rejects.toMatchObject({ code: 'BAD_MODEL_OUTPUT' });
        expect(calls).toBe(2);
    });
    it('falls back to the second model when the first is unavailable (404)', async () => {
        const seen: string[] = [];
        const generate = async (req: { model: string }) => {
            seen.push(req.model);
            if (req.model === 'm1') throw Object.assign(new Error('models/m1 is not found'), { status: 404 });
            return JSON.stringify(modelJson);
        };
        const doc = await extractDocument(img, { generate, model: 'm1', fallbackModel: 'm2' });
        expect(seen).toEqual(['m1', 'm2']);
        expect(doc.lines).toHaveLength(1);
    });
    it('does not fall back on rate limits', async () => {
        const seen: string[] = [];
        const generate = async (req: { model: string }): Promise<string> => {
            seen.push(req.model);
            throw Object.assign(new Error('quota exceeded'), { status: 429 });
        };
        await expect(extractDocument(img, { generate, model: 'm1', fallbackModel: 'm2' })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
        expect(seen).toEqual(['m1']);
    });
    it('maps key errors to NO_API_KEY and unknown errors to MODEL_ERROR', async () => {
        const keyErr = async (): Promise<string> => {
            throw Object.assign(new Error('API key not valid'), { status: 400 });
        };
        const boom = async (): Promise<string> => {
            throw new Error('socket hang up');
        };
        await expect(extractDocument(img, { generate: keyErr, model: 'm1', fallbackModel: null })).rejects.toMatchObject({ code: 'NO_API_KEY' });
        await expect(extractDocument(img, { generate: boom, model: 'm1', fallbackModel: null })).rejects.toMatchObject({ code: 'MODEL_ERROR' });
    });
    it('times out with MODEL_ERROR', async () => {
        const hang = () => new Promise<string>(() => { });
        const p = extractDocument(img, { generate: hang, model: 'm1', fallbackModel: null, timeoutMs: 25 });
        await expect(p).rejects.toBeInstanceOf(ParseLabelError);
        await expect(p).rejects.toMatchObject({ code: 'MODEL_ERROR' });
    });
});