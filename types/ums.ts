// types/ums.ts
// MedRing domain types. Layer contract: Vision (verbatim only) → Compiler (deterministic) → UI.

export const UMS_SLOTS = ['MORNING', 'NOON', 'EVENING', 'BEDTIME'] as const;
export type UmsSlot = (typeof UMS_SLOTS)[number];

/** Day-Ring display windows (24h). App design choice — NOT part of the UMS standard. */
export const SLOT_WINDOWS: Record<UmsSlot, { label: string; startHour: number; endHour: number }> = {
    MORNING: { label: 'Morning', startHour: 6, endHour: 11 },
    NOON: { label: 'Noon', startHour: 11, endHour: 16 },
    EVENING: { label: 'Evening', startHour: 16, endHour: 20 },
    BEDTIME: { label: 'Bedtime', startHour: 20, endHour: 24 },
};

export type MealRule = 'BEFORE_FOOD' | 'WITH_FOOD' | 'AFTER_FOOD' | 'NONE_STATED';
/**
 * INNER = empty stomach / before food. OUTER = with or after food.
 * NONE_STATED is drawn on OUTER with a dashed outline — a track is never guessed.
 */
export type RingTrack = 'INNER' | 'OUTER';

export type DoseForm = 'TABLET' | 'CAPSULE' | 'LIQUID_ML' | 'DROP' | 'PUFF' | 'SPRAY' | 'UNIT';
export type Legibility = 'CLEAR' | 'PARTIAL' | 'ILLEGIBLE';
export type DocumentKind = 'DISCHARGE_TABLE' | 'MEDICATION_LIST' | 'BOTTLE_LABEL' | 'HANDWRITTEN_RX' | 'OTHER';
export type SlotProvenance = 'PATTERN' | 'TIME_WORD' | 'UMS_FREQUENCY_MAP';

/** Half-open [start, end) UTF-16 offsets into ExtractedDocument.rawText. Computed by the compiler, never by the model. */
export interface SourceSpan {
    start: number;
    end: number;
}

/* ───────────── Layer 1 output (vision extraction) ───────────── */

export const RAW_FIELD_KEYS = [
    'drugName',
    'strength',
    'dose',
    'frequency',
    'timing',
    'route',
    'duration',
    'instructions',
] as const;
export type RawFieldKey = (typeof RAW_FIELD_KEYS)[number];

/** Every non-null value MUST be a verbatim substring of the line's `verbatim`. */
export type RawFields = Record<RawFieldKey, string | null>;

export interface ExtractedLine {
    id: string;
    /** One medication entry exactly as printed (a table row, or all lines of one bottle label). */
    verbatim: string;
    legibility: Legibility;
    fields: RawFields;
}

export interface ExtractedDocument {
    documentId: string;
    kind: DocumentKind;
    isValidMedicationDocument: boolean;
    /** Full transcription; the coordinate system for every SourceSpan. */
    rawText: string;
    lines: ExtractedLine[];
}

/* ───────────── Layer 2 output (deterministic compiler) ───────────── */

export type DoseGeometry =
    | { kind: 'UNITS'; whole: number; partial: 0 | 0.25 | 0.5 | 0.75; label: string }
    | { kind: 'VOLUME'; ml: number; label: string };

export type HaltCode =
    | 'LINE_NOT_IN_SOURCE'
    | 'EXTRACTION_NOT_VERBATIM'
    | 'DRUG_NAME_MISSING'
    | 'ILLEGIBLE_OR_TRUNCATED'
    | 'FREQUENCY_MISSING'
    | 'FREQUENCY_UNPARSEABLE'
    | 'FREQUENCY_NEEDS_TIME'
    | 'FREQUENCY_CONFLICT'
    | 'INTERVAL_REQUIRES_CLOCK_TIMES'
    | 'PATTERN_UNSUPPORTED'
    | 'SLOT_CONFLICT'
    | 'QUANTITY_MISSING'
    | 'QUANTITY_CONFLICT'
    | 'QUANTITY_UNSUPPORTED'
    | 'MEAL_RULE_CONFLICT'
    | 'PRN_MISSING_INDICATION'
    | 'SCHEDULE_PRN_MIXED'
    | 'ABBREVIATION_AMBIGUOUS';

export interface HaltEvidence {
    text: string;
    span: SourceSpan | null;
}

export interface AmbiguityHalt {
    type: 'AMBIGUITY_HALT';
    code: HaltCode;
    lineId: string;
    drugLabel: string;
    message: string;
    /** Pre-written, copy-ready question for the pharmacist. */
    pharmacistQuestion: string;
    evidence: HaltEvidence[];
}

export interface DoseEvent {
    slot: UmsSlot;
    quantity: number;
    geometry: DoseGeometry;
    mealRule: MealRule;
    track: RingTrack;
    provenance: SlotProvenance;
}

export interface PrnInfo {
    quantity: number;
    form: DoseForm;
    geometry: DoseGeometry;
    /** Verbatim-derived phrase, e.g. "for chest pain". */
    indication: string;
    /** Frequency + timing + instruction fields joined verbatim (limits, emergency text). Always shown in the PRN hub. */
    directionsVerbatim: string;
    mealRule: MealRule;
}

export interface CompiledMedication {
    lineId: string;
    drugName: string;
    strength: string | null;
    duration: string | null;
    form: DoseForm | null;
    status: 'SCHEDULED' | 'PRN' | 'HALTED';
    doses: DoseEvent[];
    prn: PrnInfo | null;
    halts: AmbiguityHalt[];
    /** One consolidated, copy-ready question when halted; otherwise null. */
    pharmacistQuestion: string | null;
    /** English restatement built only from compiled enums and verbatim fragments. */
    plainLanguage: string;
    verbatim: string;
    span: SourceSpan | null;
    fieldSpans: Partial<Record<RawFieldKey, SourceSpan>>;
}

export interface RingItem {
    lineId: string;
    drugName: string;
    strength: string | null;
    quantity: number;
    geometry: DoseGeometry;
    mealRule: MealRule;
    form: DoseForm;
    provenance: SlotProvenance;
}

export interface RingCell {
    slot: UmsSlot;
    track: RingTrack;
    items: RingItem[];
}

export interface Telemetry {
    wordsBefore: number;
    /** Words in the plain-language schedule (what Calm Mode shows and read-aloud speaks). */
    wordsAfterPlain: number;
    /** Words visible on ring tokens: drug name + strength + one quantity label per token. Excludes UI chrome. */
    wordsAfterRing: number;
    reductionPlainPct: number;
    reductionRingPct: number;
    /** Flesch-Kincaid grade (English), floored at 0. */
    fkGradeBefore: number;
    fkGradeAfter: number;
    /** Proxy: non-empty instruction fields a reader must interpret and reconcile. Not a validated clinical metric. */
    decisionPointsBefore: number;
    /** Proxy: distinct (slot, track) action groups + PRN items + pharmacist chips. */
    decisionPointsAfter: number;
    /** Ring dose tokens + PRN items + pharmacist chips. */
    visualTokens: number;
    /** Medications with a before-food / empty-stomach rule. */
    fastingRules: number;
    ambiguitiesFlagged: number;
}

export interface CompiledSchedule {
    documentId: string;
    kind: DocumentKind;
    medications: CompiledMedication[];
    halts: AmbiguityHalt[];
    ringCells: RingCell[];
    telemetry: Telemetry;
}

export type CompileResult =
    | { status: 'OK'; schedule: CompiledSchedule }
    | { status: 'INVALID_DOCUMENT'; reason: 'NOT_A_MEDICATION_DOCUMENT' | 'NO_MEDICATION_LINES' };