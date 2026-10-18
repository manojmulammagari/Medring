// data/clinical-fixtures.ts
// DEMO DATA: fictional patients and prescriptions modelled on common label/discharge conventions.
// Not medical advice. Every field is built from the same strings as its verbatim line, so the
// verbatim-substring contract holds by construction; spans are resolved by the compiler.

import type { ExtractedDocument, ExtractedLine, RawFields } from '@/types/ums';

const fields = (p: Partial<RawFields>): RawFields => ({
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

export interface ClinicalFixture {
    id: 'preset-1' | 'preset-2' | 'preset-3';
    shortLabel: string;
    title: string;
    description: string;
    document: ExtractedDocument;
    /** Key order matters: scripts/smoke-fixtures.ts compares with JSON.stringify. */
    expected: { scheduledMeds: number; doseEvents: number; prnMeds: number; haltedMeds: number };
}

/* ───────────── Fixture 1: post-cardiac discharge table (1-0-1 shorthand, AC/PC/HS, fasting rules) ───────────── */

const row = (
    no: number,
    id: string,
    label: string,
    name: string,
    strength: string,
    dose: string,
    freq: string,
    timing: string,
    duration: string,
): ExtractedLine => ({
    id,
    verbatim: `${no} | ${label} | ${dose} | ${freq} | ${timing} | ${duration}`,
    legibility: 'CLEAR',
    fields: fields({ drugName: name, strength, dose, frequency: freq, timing, duration }),
});

const F1_LINES: ExtractedLine[] = [
    row(1, 'f1-aspirin', 'Tab. Aspirin EC 75 mg', 'Aspirin EC', '75 mg', '1 tab', '1-0-0', 'AC', 'Lifelong'),
    row(2, 'f1-pantoprazole', 'Tab. Pantoprazole 40 mg', 'Pantoprazole', '40 mg', '1 tab', '1-0-0', 'Empty stomach, 30 min before breakfast', '4 weeks'),
    row(3, 'f1-clopidogrel', 'Tab. Clopidogrel 75 mg', 'Clopidogrel', '75 mg', '1 tab', '1-0-0', 'After food', '12 months'),
    row(4, 'f1-metoprolol', 'Tab. Metoprolol Succinate 25 mg', 'Metoprolol Succinate', '25 mg', '1 tab', '1-0-1', 'PC', '3 months'),
    row(5, 'f1-atorvastatin', 'Tab. Atorvastatin 40 mg', 'Atorvastatin', '40 mg', '1 tab', '0-0-1', 'HS', 'Lifelong'),
    row(6, 'f1-ramipril', 'Tab. Ramipril 2.5 mg', 'Ramipril', '2.5 mg', '1 tab', '0-0-1', 'After dinner', '3 months'),
];

const F1_RAW = [
    'DISCHARGE SUMMARY: MEDICATIONS ON DISCHARGE (DEMO, fictional patient)',
    'Patient: R. Kumar, 62 M    MRN: DEMO-20417',
    'Diagnosis: Acute MI (STEMI), s/p PCI    Discharged: 12 Oct 2026',
    'No. | Drug | Dose | Freq | Timing | Duration',
    ...F1_LINES.map((l) => l.verbatim),
    'Follow-up: Cardiology OPD in 2 weeks. Do not stop aspirin or clopidogrel unless your cardiologist says so.',
].join('\n');

/* ───────────── Fixture 2: low-literacy elder list (½ tablet split dose, twice daily, PRN nitroglycerin) ───────────── */

const F2_LINES: ExtractedLine[] = [
    {
        id: 'f2-warfarin',
        verbatim: '1. WARFARIN 5 mg — take ½ tablet at bedtime',
        legibility: 'CLEAR',
        fields: fields({ drugName: 'WARFARIN', strength: '5 mg', dose: '½ tablet', frequency: 'at bedtime' }),
    },
    {
        id: 'f2-amlodipine',
        verbatim: '2. AMLODIPINE 5 mg — take 1 tablet every morning',
        legibility: 'CLEAR',
        fields: fields({ drugName: 'AMLODIPINE', strength: '5 mg', dose: '1 tablet', frequency: 'every morning' }),
    },
    {
        id: 'f2-metformin',
        verbatim: '3. METFORMIN 500 mg — take 1 tablet twice daily with food',
        legibility: 'CLEAR',
        fields: fields({ drugName: 'METFORMIN', strength: '500 mg', dose: '1 tablet', frequency: 'twice daily', timing: 'with food' }),
    },
    {
        id: 'f2-nitroglycerin',
        verbatim:
            '4. NITROGLYCERIN 0.4 mg — place 1 tablet under the tongue as needed for chest pain. May repeat every 5 minutes, up to 3 tablets in 15 minutes. Call emergency services if pain is not relieved 5 minutes after the first dose.',
        legibility: 'CLEAR',
        fields: fields({
            drugName: 'NITROGLYCERIN',
            strength: '0.4 mg',
            dose: '1 tablet under the tongue',
            frequency: 'as needed for chest pain',
            instructions:
                'May repeat every 5 minutes, up to 3 tablets in 15 minutes. Call emergency services if pain is not relieved 5 minutes after the first dose.',
        }),
    },
];

const F2_RAW = [
    'COMMUNITY CLINIC: MY MEDICINE LIST (DEMO, fictional patient)',
    'Mrs. S. Rao, age 74    Printed: 12 Oct 2026',
    ...F2_LINES.map((l) => l.verbatim),
    'Ask the clinic or pharmacy if anything here is unclear.',
].join('\n');

/* ───────────── Fixture 3: torn bottle (trips AMBIGUITY_HALT) + one clear bottle (still scheduled) ───────────── */

const F3_TORN_VERBATIM = ['LISINOPRIL 10 MG TABLET', 'TAKE 1 TABLET BY MOUTH TWICE DA', 'TAKE ON AN EMPT'].join('\n');
const F3_CLEAR_VERBATIM = ['NATUREWELL VITAMIN D3 1000 IU CAPSULE', 'TAKE 1 CAPSULE BY MOUTH EVERY MORNING'].join('\n');

const F3_LINES: ExtractedLine[] = [
    {
        id: 'f3-lisinopril-torn',
        verbatim: F3_TORN_VERBATIM,
        legibility: 'PARTIAL',
        fields: fields({
            drugName: 'LISINOPRIL',
            strength: '10 MG',
            dose: '1 TABLET',
            frequency: 'TWICE DA',
            timing: 'TAKE ON AN EMPT',
        }),
    },
    {
        id: 'f3-vitamin-d',
        verbatim: F3_CLEAR_VERBATIM,
        legibility: 'CLEAR',
        fields: fields({ drugName: 'VITAMIN D3', strength: '1000 IU', dose: '1 CAPSULE', frequency: 'EVERY MORNING' }),
    },
];

const F3_RAW = [
    'GREENFIELD PHARMACY  Rx 7730418',
    'J. TAYLOR  QTY 60  DR. A. MENON',
    F3_TORN_VERBATIM,
    '',
    F3_CLEAR_VERBATIM,
].join('\n');

/* ───────────── Export ───────────── */

export const CLINICAL_FIXTURES: readonly ClinicalFixture[] = [
    {
        id: 'preset-1',
        shortLabel: '6-med discharge',
        title: 'Post-cardiac discharge: 6 medicines with timing and food rules',
        description:
            'Hospital discharge table with 1-0-1 shorthand, AC/PC/HS and fasting rules. Four medicines land in the morning and split across the two meal tracks without overlap.',
        document: { documentId: 'fixture-preset-1', kind: 'DISCHARGE_TABLE', isValidMedicationDocument: true, rawText: F1_RAW, lines: F1_LINES },
        expected: { scheduledMeds: 6, doseEvents: 7, prnMeds: 0, haltedMeds: 0 },
    },
    {
        id: 'preset-2',
        shortLabel: 'Elder regimen',
        title: 'Low-literacy elder list: ½ tablet warfarin and PRN nitroglycerin',
        description:
            'Plain-language pharmacy list with a split dose, a twice-daily medicine and an as-needed medicine that stays in the center hub, never on a clock hour.',
        document: { documentId: 'fixture-preset-2', kind: 'MEDICATION_LIST', isValidMedicationDocument: true, rawText: F2_RAW, lines: F2_LINES },
        expected: { scheduledMeds: 3, doseEvents: 4, prnMeds: 1, haltedMeds: 0 },
    },
    {
        id: 'preset-3',
        shortLabel: 'Torn label',
        title: 'Torn bottle label: the guardrail refuses to guess',
        description:
            'The lisinopril label is cut off mid-word. The compiler halts that medicine with a ready-to-copy pharmacist question while the clear vitamin D bottle still schedules normally.',
        document: { documentId: 'fixture-preset-3', kind: 'BOTTLE_LABEL', isValidMedicationDocument: true, rawText: F3_RAW, lines: F3_LINES },
        expected: { scheduledMeds: 1, doseEvents: 1, prnMeds: 0, haltedMeds: 1 },
    },
];

export const DEFAULT_FIXTURE_ID = 'preset-1' as const;

export const getFixture = (id: string): ClinicalFixture | undefined => CLINICAL_FIXTURES.find((f) => f.id === id);