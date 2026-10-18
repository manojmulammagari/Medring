// lib/ui-model.ts: UI-only derivations over CompiledSchedule (selection order, glyph identity, Calm Mode slots).
import { UMS_SLOTS, type CompiledMedication, type CompiledSchedule, type DoseEvent, type UmsSlot } from '@/types/ums';

export type Selection = { lineId: string; slot: UmsSlot | null };

export const SHAPES = ['CIRCLE', 'CAPSULE', 'HEX', 'TRIANGLE'] as const;
export const PATTERNS = ['SOLID', 'STRIPES', 'DOTS', 'CROSS'] as const;
export type GlyphShape = (typeof SHAPES)[number];
export type GlyphPattern = (typeof PATTERNS)[number];
export interface GlyphStyle {
    shape: GlyphShape;
    pattern: GlyphPattern;
    hue: number;
}

/** Shape cycles fastest, then pattern, so up to 16 medicines stay distinguishable without colour. */
export function glyphStyleFor(index: number): GlyphStyle {
    return {
        shape: SHAPES[index % 4] as GlyphShape,
        pattern: PATTERNS[Math.floor(index / 4) % 4] as GlyphPattern,
        hue: (index + Math.floor(index / 4)) % 4,
    };
}

export const styleMap = (schedule: CompiledSchedule): Map<string, GlyphStyle> =>
    new Map(schedule.medications.map((m, i) => [m.lineId, glyphStyleFor(i)] as const));

/** Arrow-key order: ring tokens (slot order, inner then outer), then PRN, then pharmacist chips. */
export function buildSequence(schedule: CompiledSchedule): Selection[] {
    const seq: Selection[] = [];
    for (const cell of schedule.ringCells) for (const it of cell.items) seq.push({ lineId: it.lineId, slot: cell.slot });
    for (const m of schedule.medications) if (m.status === 'PRN') seq.push({ lineId: m.lineId, slot: null });
    for (const m of schedule.medications) if (m.status === 'HALTED') seq.push({ lineId: m.lineId, slot: null });
    return seq;
}

export function stepSelection(seq: readonly Selection[], current: Selection | null, dir: 1 | -1): Selection | null {
    if (seq.length === 0) return null;
    const i = current ? seq.findIndex((s) => s.lineId === current.lineId && s.slot === current.slot) : -1;
    if (i === -1) return (dir === 1 ? seq[0] : seq[seq.length - 1]) ?? null;
    return seq[(i + dir + seq.length) % seq.length] ?? null;
}

/** Device hour → display slot (00:00–05:59 counts as Bedtime). */
export function slotForHour(hour: number): UmsSlot {
    if (hour >= 6 && hour < 11) return 'MORNING';
    if (hour >= 11 && hour < 16) return 'NOON';
    if (hour >= 16 && hour < 20) return 'EVENING';
    return 'BEDTIME';
}

export const slotsWithDoses = (schedule: CompiledSchedule): UmsSlot[] =>
    UMS_SLOTS.filter((slot) => schedule.ringCells.some((c) => c.slot === slot && c.items.length > 0));

/** First slot with doses at or after the current time of day, wrapping. */
export function initialCalmSlot(schedule: CompiledSchedule, hour: number): UmsSlot | null {
    const active = slotsWithDoses(schedule);
    if (active.length === 0) return null;
    const start = UMS_SLOTS.indexOf(slotForHour(hour));
    for (let i = 0; i < 4; i++) {
        const s = UMS_SLOTS[(start + i) % 4];
        if (s && active.includes(s)) return s;
    }
    return active[0] ?? null;
}

export function shiftCalmSlot(schedule: CompiledSchedule, from: UmsSlot | null, dir: 1 | -1): UmsSlot | null {
    const active = slotsWithDoses(schedule);
    if (active.length === 0) return null;
    if (!from) return active[0] ?? null;
    const start = UMS_SLOTS.indexOf(from);
    for (let i = 1; i <= 4; i++) {
        const s = UMS_SLOTS[(start + dir * i + 8) % 4];
        if (s && active.includes(s)) return s;
    }
    return from;
}

export interface SlotEntry {
    med: CompiledMedication;
    dose: DoseEvent;
}

export function entriesForSlot(schedule: CompiledSchedule, slot: UmsSlot): SlotEntry[] {
    const out: SlotEntry[] = [];
    for (const track of ['INNER', 'OUTER'] as const) {
        const cell = schedule.ringCells.find((c) => c.slot === slot && c.track === track);
        for (const it of cell?.items ?? []) {
            const med = schedule.medications.find((m) => m.lineId === it.lineId);
            const dose = med?.doses.find((d) => d.slot === slot);
            if (med && dose) out.push({ med, dose });
        }
    }
    return out;
}