'use client';

// components/ring/DayRing.tsx
// The 24H Day-Ring dial. Built ONLY from the real contracts:
//   lib/ring-geometry.ts → RING, SLOT_ANGLES, polar(), sectorPath(), layoutHub(), formatWindow(), Placement
//   lib/ui-model.ts      → GlyphStyle, Selection
//   components/ring/PillGlyph.tsx → GlyphDefs, PillGlyph
// No animation library is used here: every pixel is deterministic between SSR and hydration.

import { useId, useMemo } from 'react';
import type { CompiledMedication, CompiledSchedule, DoseGeometry, RingTrack, UmsSlot } from '@/types/ums';
import { UMS_SLOTS } from '@/types/ums';
import { RING, SLOT_ANGLES, formatWindow, layoutHub, polar, sectorPath, type Placement } from '@/lib/ring-geometry';
import { slotName, ui, type Lang } from '@/lib/phrasebook';
import type { GlyphStyle, Selection } from '@/lib/ui-model';
import { GlyphDefs, PillGlyph } from '@/components/ring/PillGlyph';

/** Identity fallback if a medicine has no glyph entry (never expected: styleMap indexes every medication). */
const FALLBACK: GlyphStyle = { shape: 'CIRCLE', pattern: 'SOLID', hue: 0 };
const FALLBACK_GEOMETRY: DoseGeometry = { kind: 'UNITS', whole: 1, partial: 0, label: '1 unit' };

const PLATE_R = RING.outer.r1 + 28; // 244 — white dial plate
const LABEL_R = PLATE_R + 22; // 266 — quadrant chips sit fully outside the bezel, clear of every token tag
const LABEL_W = 84;
const LABEL_H = 28;
const TICK_IN = PLATE_R - 20;
const TICK_OUT = PLATE_R - 5;
const CLOCK_LABEL_R = PLATE_R - 14;
const BOUNDARY_DEG = [0, 90, 180, 270] as const;
const CLOCK_MARKS: ReadonlyArray<{ deg: number; label: string }> = [
    { deg: 0, label: '6 AM' },
    { deg: 90, label: '12 PM' },
    { deg: 180, label: '6 PM' },
    { deg: 270, label: '12 AM' },
];

/** Semantic time-of-day chromatic coding — colour + shape + pattern redundancy. */
const SLOT_COLOR: Record<UmsSlot, string> = {
    MORNING: '#d97706',
    NOON: '#0284c7',
    EVENING: '#ea580c',
    BEDTIME: '#4f46e5',
};

const SLOT_PILL: Record<UmsSlot, { idle: string; active: string }> = {
    MORNING: {
        idle: 'bg-amber-50 border-amber-300 text-amber-950',
        active: 'bg-amber-600 text-white border-amber-600',
    },
    NOON: {
        idle: 'bg-sky-50 border-sky-300 text-sky-950',
        active: 'bg-sky-600 text-white border-sky-600',
    },
    EVENING: {
        idle: 'bg-orange-50 border-orange-300 text-orange-950',
        active: 'bg-orange-600 text-white border-orange-600',
    },
    BEDTIME: {
        idle: 'bg-indigo-50 border-indigo-300 text-indigo-950',
        active: 'bg-indigo-600 text-white border-indigo-600',
    },
};

const RAD = Math.PI / 180;
const textWidth = (s: string, px: number): number => s.length * px * 0.58;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/**
 * Every SVG coordinate derived from trigonometry is written with toFixed(2). Node and Chromium use
 * different shortest-round-trip float formatting for long fractional values, so a raw `x={43.019928495519224}`
 * renders as a different string on the server ("43.019928495519196") and React reports a hydration
 * mismatch. toFixed is spec-exact in every engine, so both trees emit byte-identical markup.
 */
const n2 = (v: number): string => v.toFixed(2);

interface ScheduledToken {
    key: string;
    lineId: string;
    name: string;
    strength: string | null;
    slot: UmsSlot;
    track: RingTrack;
    x: number;
    y: number;
    deg: number; // angle in degrees from 12 o'clock, clockwise
    plateR: number;
    haloR: number;
    glyphSize: number;
    tagW: number;
    tagH: number;
    tagY: number; // radial distance from token center to label center
    note: string | null;
    geometry: DoseGeometry;
    glyph: GlyphStyle;
    slotColor: string;
}

interface HubToken {
    lineId: string;
    name: string;
    strength: string | null;
    geometry: DoseGeometry;
    glyph: GlyphStyle;
    x: number;
    y: number;
    plateR: number;
    glyphSize: number;
    slotColor: string;
}

function buildTokens(schedule: CompiledSchedule, glyphs: ReadonlyMap<string, GlyphStyle>): ScheduledToken[] {
    const out: ScheduledToken[] = [];
    for (const cell of schedule.ringCells) {
        if (cell.items.length === 0) continue;
        const band = cell.track === 'INNER' ? RING.inner : RING.outer;
        const [a0, a1] = SLOT_ANGLES[cell.slot];
        const pad = RING.gutterDeg + 4;
        const span = a1 - a0 - 2 * pad;
        const step = span / Math.max(cell.items.length, 1);
        const rMid = (band.r0 + band.r1) / 2;
        const rHalf = Math.max((band.r1 - band.r0) / 2 - 8, 6); // half-band minus padding, min 6px

        cell.items.forEach((item, i) => {
            // Stagger radial distance within the band so same-slot tokens don't stack vertically
            const r = clamp(rMid + ((i % 2) === 0 ? -rHalf * 0.55 : rHalf * 0.55), band.r0 + 8, band.r1 - 8);
            const deg = a0 + pad + step * (i + 0.5);
            const p = polar(r, deg);

            const name = item.drugName.length > 11 ? `${item.drugName.slice(0, 10)}…` : item.drugName;
            const note = item.mealRule === 'BEFORE_FOOD' ? 'before food' : null;
            const crowded = cell.items.length >= 5;
            const fontPx = crowded ? 9 : 10.5;
            const tagW = Math.round(clamp(Math.max(textWidth(name, fontPx), note ? textWidth(note, 8) : 0) + 14, 40, crowded ? 58 : 78));
            const tagH = note ? 26 : 18;

            out.push({
                key: `${item.lineId}-${cell.slot}-${cell.track}-${i}`,
                lineId: item.lineId,
                name,
                strength: item.strength,
                slot: cell.slot,
                track: cell.track,
                x: p.x,
                y: p.y,
                deg,
                plateR: clamp(Math.round(r * 0.20), 9, 26),
                haloR: 0, // set below
                glyphSize: 0, // set below
                tagW,
                tagH,
                tagY: 14 + tagH / 2,
                note,
                geometry: item.geometry,
                glyph: glyphs.get(item.lineId) ?? FALLBACK,
                slotColor: SLOT_COLOR[cell.slot],
            });
        });
    }
    // Second pass: derive haloR and glyphSize from plateR
    for (const t of out) {
        t.haloR = t.plateR + 7;
        t.glyphSize = t.plateR * 1.3;
    }
    return out;
}

function buildHub(schedule: CompiledSchedule, glyphs: ReadonlyMap<string, GlyphStyle>): HubToken[] {
    const prn: CompiledMedication[] = schedule.medications.filter((m) => m.status === 'PRN' && m.prn !== null);
    const places = layoutHub(prn.length);
    return prn.slice(0, places.length).map((m, i) => {
        const p = places[i] as Placement;
        const plateR = clamp(p.size * 0.5, 8, 21);
        return {
            lineId: m.lineId,
            name: m.drugName,
            strength: m.strength,
            geometry: m.prn?.geometry ?? { kind: 'UNITS', whole: 1, partial: 0, label: '1' },
            glyph: glyphs.get(m.lineId) ?? FALLBACK,
            x: p.x,
            y: p.y,
            plateR,
            glyphSize: plateR * 1.3,
            slotColor: '#6b7280',
        };
    });
}

export interface DayRingProps {
    schedule: CompiledSchedule;
    glyphs: ReadonlyMap<string, GlyphStyle>;
    /** Hovered or selected medicine: every token of that medicine gets a halo, its source line is highlighted. */
    activeLineId: string | null;
    lang: Lang;
    /**
     * Accepted for contract compatibility only. Motion is governed by the CSS `prefers-reduced-motion`
     * media query: a client-only value such as useReducedMotion() must never reach the DOM, because the
     * server render cannot know it and React would report a hydration mismatch.
     */
    reducedMotion?: boolean;
    onSelect(selection: Selection): void;
    onHover(lineId: string | null): void;
}

export function DayRing({ schedule, glyphs, activeLineId, lang, onSelect, onHover }: DayRingProps) {
    const uid = useId().replace(/:/g, '');
    const T = ui(lang);

    const tokens = useMemo(() => buildTokens(schedule, glyphs), [schedule, glyphs]);
    const hubTokens = useMemo(() => buildHub(schedule, glyphs), [schedule, glyphs]);
    const prnMeds = useMemo(() => schedule.medications.filter((m) => m.status === 'PRN' && m.prn !== null), [schedule]);

    const activeMed = useMemo(
        () => (activeLineId ? (schedule.medications.find((m) => m.lineId === activeLineId) ?? null) : null),
        [schedule, activeLineId],
    );
    const activeSlot = activeMed?.doses[0]?.slot ?? null;

    const firstInSlot = (slot: UmsSlot): string | null => {
        for (const cell of schedule.ringCells) {
            if (cell.slot !== slot) continue;
            const item = cell.items[0];
            if (item) return item.lineId;
        }
        return null;
    };
    const pickSlot = (slot: UmsSlot): void => {
        const lineId = firstInSlot(slot);
        if (lineId) onSelect({ lineId, slot });
    };
    const selectToken = (lineId: string, slot: UmsSlot | null): void => onSelect({ lineId, slot });

    const scheduledCount = tokens.length;
    const noRuleCount = schedule.ringCells.reduce(
        (n, c) => n + c.items.filter((it) => it.mealRule === 'NONE_STATED').length,
        0,
    );

    return (
        <section className="mr-bento-card" aria-label="24-hour medication ring">
            <div className="border-b border-stone-200 px-4 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-mono font-semibold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap">UMS 4-PERIOD DIAL</span>
                    <h2 className="f-display text-[18px] font-bold text-[var(--ink)]">24-hour medication ring</h2>
                    <p className="f-data text-[10px] text-stone-500 uppercase tracking-wider">{scheduledCount} scheduled · {prnMeds.length} as-needed</p>
                </div>
                <span className="f-data text-[9px] text-stone-400 uppercase tracking-wider">hero</span>
            </div>

            <div role="group" aria-label="Dose periods" className="grid grid-cols-4 gap-2 my-3">
                {UMS_SLOTS.map((slot) => {
                    const count = tokens.filter((t) => t.slot === slot).length;
                    const isActive = activeSlot === slot;
                    return (
                        <button
                            key={slot}
                            type="button"
                            className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg border transition-colors text-[11px] font-bold ${SLOT_PILL[slot][isActive ? 'active' : 'idle']}`}
                            aria-pressed={isActive}
                            disabled={count === 0}
                            aria-label={`${slotName(slot, lang)}, ${formatWindow(slot)}, ${count} ${count === 1 ? 'dose' : 'doses'}`}
                            onClick={() => pickSlot(slot)}
                        >
                            <span className="font-bold whitespace-nowrap">{slotName(slot, lang)}</span>
                            <span className="f-data text-[10px] whitespace-nowrap">{count}</span>
                        </button>
                    );
                })}
            </div>

            <div className="mr-ring-wrap">
                <svg viewBox="-45 -45 590 590" className="mr-ring-svg" role="group" aria-label="Day ring with one token per scheduled dose">
                    <GlyphDefs prefix={uid} />

                    {/* Outer dial plate — always white, never a black disc. */}
                    <circle cx={RING.cx} cy={RING.cy} r={PLATE_R} fill="#ffffff" stroke="var(--ink)" strokeWidth="2.5" />
                    <circle cx={RING.cx} cy={RING.cy} r={PLATE_R - 9} fill="none" stroke="var(--ink)" strokeWidth="1" opacity="0.35" />

                    {/* 24h bezel: one tick per hour, heavy at 6 AM / 12 PM / 6 PM / 12 AM. */}
                    {Array.from({ length: 24 }, (_, i) => {
                        const deg = i * 15;
                        const heavy = i % 6 === 0;
                        const p1 = polar(heavy ? TICK_IN : CLOCK_LABEL_R + 4, deg);
                        const p2 = polar(TICK_OUT, deg);
                        return (
                            <line
                                key={deg}
                                x1={n2(p1.x)}
                                y1={n2(p1.y)}
                                x2={n2(p2.x)}
                                y2={n2(p2.y)}
                                stroke="var(--ink)"
                                strokeWidth={heavy ? 2.25 : 1}
                                opacity={heavy ? 0.95 : 0.45}
                                strokeLinecap="round"
                            />
                        );
                    })}
                    {CLOCK_MARKS.map((m) => {
                        const p = polar(CLOCK_LABEL_R, m.deg);
                        return (
                            <text
                                key={m.deg}
                                x={n2(p.x)}
                                y={n2(p.y + 3.2)}
                                textAnchor="middle"
                                fill="var(--ink-2)"
                                style={{ fontSize: '9.5px', fontWeight: 700, fontFamily: 'var(--font-data)' }}
                            >
                                {m.label}
                            </text>
                        );
                    })}

                    {/* Quadrant wells: pale ground for every period, amber tint for the period in focus. */}
                    {UMS_SLOTS.map((slot) => {
                        const [a0, a1] = SLOT_ANGLES[slot];
                        const d = sectorPath(RING.hubR + 4, RING.outer.r1 + 18, a0 + 1.6, a1 - 1.6);
                        const isActive = activeSlot === slot;
                        return (
                            <path
                                key={`well-${slot}`}
                                d={d}
                                fill={isActive ? 'rgba(245, 158, 11, 0.16)' : '#f8f7f2'}
                                stroke="var(--ink)"
                                strokeWidth="1.6"
                                style={{ transition: 'fill 140ms ease, d 200ms ease' }}
                                aria-hidden="true"
                                onClick={() => pickSlot(slot)}
                            />
                        );
                    })}

                    {/* Period dividers from hub to bezel. */}
                    {BOUNDARY_DEG.map((deg) => {
                        const p1 = polar(RING.hubR, deg);
                        const p2 = polar(RING.outer.r1 + 18, deg);
                        return <line key={`div-${deg}`} x1={n2(p1.x)} y1={n2(p1.y)} x2={n2(p2.x)} y2={n2(p2.y)} stroke="var(--ink)" strokeWidth="1.6" />;
                    })}

                    {/* Track boundary circles: fill="none" — they are rails, not discs. */}
                    <circle cx={RING.cx} cy={RING.cy} r={RING.inner.r0} fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="3 4" opacity="0.45" />
                    <circle cx={RING.cx} cy={RING.cy} r={RING.inner.r1} fill="none" stroke="var(--ink)" strokeWidth="1.9" />
                    <circle cx={RING.cx} cy={RING.cy} r={RING.outer.r0} fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="3 4" opacity="0.45" />
                    <circle cx={RING.cx} cy={RING.cy} r={RING.outer.r1} fill="none" stroke="var(--ink)" strokeWidth="1.9" />

                    {/* Scheduled tokens: white plate + real pill geometry + name tag. */}
                    {tokens.map((t) => {
                        const isActive = t.lineId === activeLineId;
                        // Tangential label placement: labels spread along the arc direction instead of
                        // converging radially, so same-slot tokens never collide.
                        const rad = t.deg * RAD;
                        const tanX = Math.cos(rad);
                        const tanY = Math.sin(rad);
                        const tx = tanX * t.tagY;
                        const ty = tanY * t.tagY;
                        const leaderX1 = Math.sin(rad) * t.plateR;
                        const leaderY1 = -Math.cos(rad) * t.plateR;
                        const leaderX2 = tanX * (t.plateR + 3);
                        const leaderY2 = tanY * (t.plateR + 3);
                        return (
                            <g
                                key={t.key}
                                className="mr-ring-token"
                                role="button"
                                tabIndex={0}
                                aria-pressed={isActive}
                                aria-label={`${[t.name, t.strength].filter(Boolean).join(' ')} — ${slotName(t.slot, lang)}, ${formatWindow(t.slot)}${t.note ? ', empty stomach' : ''}`}
                                transform={`translate(${t.x.toFixed(2)}, ${t.y.toFixed(2)})`}
                                onClick={() => selectToken(t.lineId, t.slot)}
                                onMouseEnter={() => onHover(t.lineId)}
                                onMouseLeave={() => onHover(null)}
                                onFocus={() => onHover(t.lineId)}
                                onBlur={() => onHover(null)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        selectToken(t.lineId, t.slot);
                                    }
                                }}
                            >
                                {isActive && (
                                    <circle r={n2(t.haloR)} className="mr-halo" fill="rgba(245, 158, 11, 0.22)" stroke="var(--focus)" strokeWidth="3" />
                                )}
                                <circle r={n2(t.plateR)} fill="#ffffff" stroke="var(--ink)" strokeWidth={isActive ? 3 : 2} />
                                {t.track === 'INNER' && (
                                    <circle r={n2(t.plateR - 3)} fill="none" stroke="var(--ink)" strokeWidth="1.2" strokeDasharray="2 2.4" opacity="0.5" />
                                )}
                                <PillGlyph glyph={t.glyph} geometry={t.geometry} size={Math.round(t.glyphSize)} prefix={uid} slotColor={t.slotColor} />
                                {/* Leader line from token edge to label */}
                                <line
                                    x1={n2(leaderX1)}
                                    y1={n2(leaderY1)}
                                    x2={n2(leaderX2)}
                                    y2={n2(leaderY2)}
                                    stroke="var(--ink-2)"
                                    strokeWidth="1"
                                    opacity="0.5"
                                    strokeLinecap="round"
                                />
                                <g transform={`translate(${tx.toFixed(2)}, ${ty.toFixed(2)})`} aria-hidden="true">
                                    <rect
                                        x={n2(-t.tagW / 2)}
                                        y={n2(-t.tagH / 2)}
                                        width={n2(t.tagW)}
                                        height={n2(t.tagH)}
                                        rx="5"
                                        fill={isActive ? 'var(--ink)' : '#ffffff'}
                                        stroke="var(--ink)"
                                        strokeWidth="1.5"
                                    />
                                    <text
                                        y={t.note ? -1.4 : 3.6}
                                        textAnchor="middle"
                                        fill={isActive ? '#ffffff' : 'var(--ink)'}
                                        style={{ fontSize: '10.5px', fontWeight: 800, fontFamily: 'var(--font-ui)', letterSpacing: '-0.01em' }}
                                    >
                                        {t.name}
                                    </text>
                                    {t.note && (
                                        <text y="8.6" textAnchor="middle" fill={isActive ? 'var(--amber)' : 'var(--ink-2)'} style={{ fontSize: '8px', fontWeight: 700, fontFamily: 'var(--font-data)' }}>
                                            {t.note}
                                        </text>
                                    )}
                                </g>
                            </g>
                        );
                    })}

                    {/* Centre PRN hub — white, never black. */}
                    <circle cx={RING.cx} cy={RING.cy} r={RING.hubR} fill="#ffffff" stroke="var(--ink)" strokeWidth="2.5" />
                    <circle cx={RING.cx} cy={RING.cy} r={RING.hubR - 7} fill="none" stroke="var(--ink)" strokeWidth="1" strokeDasharray="2 3" opacity="0.45" />
                    {hubTokens.length > 0 && (
                        <text
                            x={RING.cx}
                            y={RING.cy - RING.hubR + 21}
                            textAnchor="middle"
                            fill="var(--ink-2)"
                            style={{ fontSize: '8.5px', fontWeight: 800, letterSpacing: '0.1em', fontFamily: 'var(--font-data)' }}
                        >
                            {T.hub.toUpperCase()}
                        </text>
                    )}

                    {hubTokens.map((h) => {
                        const isActive = h.lineId === activeLineId;
                        return (
                            <g
                                key={`hub-${h.lineId}`}
                                className="mr-ring-token"
                                role="button"
                                tabIndex={0}
                                aria-pressed={isActive}
                                aria-label={`${[h.name, h.strength].filter(Boolean).join(' ')} — ${T.ifNeeded}`}
                                transform={`translate(${h.x.toFixed(2)}, ${h.y.toFixed(2)})`}
                                onClick={() => selectToken(h.lineId, null)}
                                onMouseEnter={() => onHover(h.lineId)}
                                onMouseLeave={() => onHover(null)}
                                onFocus={() => onHover(h.lineId)}
                                onBlur={() => onHover(null)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        selectToken(h.lineId, null);
                                    }
                                }}
                            >
                                {isActive && <circle r={n2(h.plateR + 6)} className="mr-halo" fill="rgba(245, 158, 11, 0.25)" stroke="var(--focus)" strokeWidth="3" />}
                                <circle r={n2(h.plateR)} fill="#ffffff" stroke="var(--ink)" strokeWidth={isActive ? 2.75 : 1.75} />
                                <PillGlyph glyph={h.glyph} geometry={h.geometry} size={Math.round(h.glyphSize)} prefix={uid} slotColor={h.slotColor} />
                            </g>
                        );
                    })}
                    {prnMeds.length > 3 && (
                        <text x={RING.cx} y={RING.cy + RING.hubR - 12} textAnchor="middle" fill="var(--ink-2)" style={{ fontSize: '8px', fontWeight: 700, fontFamily: 'var(--font-data)' }}>
                            +{prnMeds.length - 3} more
                        </text>
                    )}

                    {/* Quadrant chips sitting on the bezel. */}
                    {UMS_SLOTS.map((slot) => {
                        const p = polar(LABEL_R, (SLOT_ANGLES[slot][0] + SLOT_ANGLES[slot][1]) / 2);
                        const isActive = activeSlot === slot;
                        return (
                            <g key={`label-${slot}`} transform={`translate(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`} aria-hidden="true" style={{ cursor: 'pointer' }} onClick={() => pickSlot(slot)}>
                                <rect x={-LABEL_W / 2} y={-LABEL_H / 2} width={LABEL_W} height={LABEL_H} rx="7" fill={isActive ? 'var(--ink)' : '#ffffff'} stroke="var(--ink)" strokeWidth="2" />
                                <text x="0" y="-1.8" textAnchor="middle" fill={isActive ? '#ffffff' : 'var(--ink)'} style={{ fontSize: '11.5px', fontWeight: 800, letterSpacing: '0.04em', fontFamily: 'var(--font-ui)' }}>
                                    {slotName(slot, lang).toUpperCase()}
                                </text>
                                <text x="0" y="9.6" textAnchor="middle" fill={isActive ? 'var(--amber)' : 'var(--ink-2)'} style={{ fontSize: '9px', fontWeight: 700, fontFamily: 'var(--font-data)' }}>
                                    {formatWindow(slot)}
                                </text>
                            </g>
                        );
                    })}
                </svg>

                {prnMeds.length > 0 && (
                    <ul className="mr-prn-row" aria-label={T.ifNeeded}>
                        <li className="mr-prn-row-label f-data">{T.hub.toUpperCase()}</li>
                        {prnMeds.map((m, i) => {
                            const isActive = m.lineId === activeLineId;
                            const prefix = `${uid}prn${i}`;
                            return (
                                <li key={m.lineId}>
                                    <button
                                        type="button"
                                        className="tactile mr-prn-chip"
                                        aria-pressed={isActive}
                                        onClick={() => selectToken(m.lineId, null)}
                                        onMouseEnter={() => onHover(m.lineId)}
                                        onMouseLeave={() => onHover(null)}
                                    >
                                        <svg width="20" height="20" viewBox="-13 -13 26 26" aria-hidden="true">
                                            <GlyphDefs prefix={prefix} />
                                            <PillGlyph glyph={glyphs.get(m.lineId) ?? FALLBACK} geometry={m.prn?.geometry ?? FALLBACK_GEOMETRY} size={22} prefix={prefix} slotColor="#6b7280" />
                                        </svg>
                                        <span className="mr-prn-chip-name">{[m.drugName, m.strength].filter(Boolean).join(' ')}</span>
                                        {m.prn?.indication && <span className="mr-prn-chip-note">{m.prn.indication}</span>}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <footer className="mr-ring-foot">
                <span className="f-data mr-ring-foot-item">Inner band · empty stomach</span>
                <span className="f-data mr-ring-foot-item">Outer band · with / after food</span>
                <span className="f-data mr-ring-foot-item">{noRuleCount === 0 ? 'Every dose states a food rule' : `${noRuleCount} ${noRuleCount === 1 ? 'dose has' : 'doses have'} no printed food rule — never guessed`}</span>
            </footer>
        </section>
    );
}

/** Static key for the dial. Kept as a component so the studio can place it exactly where the legend belongs. */
export function RingLegend() {
    return (
        <aside className="mr-card mr-legend" aria-label="How to read the ring">
            <h3 className="f-data mr-legend-title">How to read the ring</h3>
            <ul className="mr-legend-list">
                <li className="mr-legend-item">
                    <svg width="26" height="26" viewBox="-13 -13 26 26" aria-hidden="true">
                        <rect x="-10" y="-10" width="20" height="20" rx="4" fill="#ffffff" stroke="var(--ink)" strokeWidth="2" />
                        <path d="M -10 6 L 10 -6 M -10 0 L 10 -12 M -4 10 L 10 0" stroke="var(--hue-1)" strokeWidth="2.6" strokeLinecap="round" />
                    </svg>
                    <span>
                        <b>Shape + pattern = one medicine.</b> Colour is never the only signal.
                    </span>
                </li>
                <li className="mr-legend-item">
                    <svg width="26" height="26" viewBox="-13 -13 26 26" aria-hidden="true">
                        <circle r="10" fill="none" stroke="var(--ink)" strokeWidth="2" strokeDasharray="3 3" />
                        <circle r="5" fill="none" stroke="var(--hue-2)" strokeWidth="2.4" />
                    </svg>
                    <span>
                        <b>Inner band</b> is empty stomach / before food. <b>Outer band</b> is with or after food.
                    </span>
                </li>
                <li className="mr-legend-item">
                    <svg width="26" height="26" viewBox="-13 -13 26 26" aria-hidden="true">
                        <circle r="10" fill="#ffffff" stroke="var(--ink)" strokeWidth="2" />
                        <path d="M -6 0 L 6 0 M 0 -6 L 0 6" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span>
                        <b>The centre hub</b> holds as-needed medicines. A dashed half on a token means a split tablet; the badge states the exact amount.
                    </span>
                </li>
            </ul>
        </aside>
    );
}
