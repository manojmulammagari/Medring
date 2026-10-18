// lib/ring-geometry.ts: pure geometry for the 500×500 concentric Day-Ring. Angles are degrees clockwise from 12 o'clock.
import { SLOT_WINDOWS, type RingTrack, type UmsSlot } from '@/types/ums';

export const RING = {
    size: 500,
    cx: 250,
    cy: 250,
    hubR: 66,
    inner: { r0: 78, r1: 146 }, // empty stomach / before food
    outer: { r0: 152, r1: 216 }, // with food / after food
    gutterDeg: 2.5,
} as const;

export const SLOT_ANGLES: Record<UmsSlot, readonly [number, number]> = {
    MORNING: [0, 90],
    NOON: [90, 180],
    EVENING: [180, 270],
    BEDTIME: [270, 360],
};

export function polar(r: number, deg: number): { x: number; y: number } {
    const a = (deg * Math.PI) / 180;
    return { x: RING.cx + r * Math.sin(a), y: RING.cy - r * Math.cos(a) };
}

const f = (n: number): string => n.toFixed(2);

/** Annular sector between radii r0<r1 and angles a0<a1 (≤180°). */
export function sectorPath(r0: number, r1: number, a0: number, a1: number): string {
    const o0 = polar(r1, a0);
    const o1 = polar(r1, a1);
    const i1 = polar(r0, a1);
    const i0 = polar(r0, a0);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M ${f(o0.x)} ${f(o0.y)} A ${r1} ${r1} 0 ${large} 1 ${f(o1.x)} ${f(o1.y)} L ${f(i1.x)} ${f(i1.y)} A ${r0} ${r0} 0 ${large} 0 ${f(i0.x)} ${f(i0.y)} Z`;
}

export interface Placement {
    x: number;
    y: number;
    size: number;
}

/** Tokens in one (slot, track) cell are spread evenly along the arc and shrink to fit: collision-free by construction. */
export function layoutTokens(count: number, track: RingTrack, slot: UmsSlot): Placement[] {
    if (count === 0) return [];
    const band = track === 'INNER' ? RING.inner : RING.outer;
    const [a0, a1] = SLOT_ANGLES[slot];
    const pad = RING.gutterDeg + 3;
    const span = a1 - a0 - 2 * pad;
    const rMid = (band.r0 + band.r1) / 2;
    const arcLen = ((span * Math.PI) / 180) * rMid;
    const size = Math.max(26, Math.min(48, (band.r1 - band.r0) * 0.72, (arcLen / count) * 0.86));
    const step = span / count;
    return Array.from({ length: count }, (_, i) => {
        const { x, y } = polar(rMid, a0 + pad + step * (i + 0.5));
        return { x, y, size };
    });
}

/** PRN dock inside the center hub; at most 3 visible. */
export function layoutHub(count: number): Placement[] {
    const n = Math.min(count, 3);
    const size = n <= 1 ? 40 : n === 2 ? 36 : 30;
    return Array.from({ length: n }, (_, i) => ({ x: RING.cx + (i - (n - 1) / 2) * (size + 4), y: RING.cy + 8, size }));
}

const hr12 = (h: number): string => {
    const hh = h % 24;
    return `${hh % 12 === 0 ? 12 : hh % 12} ${hh >= 12 ? 'PM' : 'AM'}`;
};
export const formatWindow = (slot: UmsSlot): string => `${hr12(SLOT_WINDOWS[slot].startHour)}–${hr12(SLOT_WINDOWS[slot].endHour)}`;