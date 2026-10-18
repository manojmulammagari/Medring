'use client';

import { useId, type CSSProperties } from 'react';
import type { DoseGeometry } from '@/types/ums';
import type { GlyphShape, GlyphStyle } from '@/lib/ui-model';

const INK: CSSProperties = { stroke: 'var(--ink)', strokeWidth: 'var(--stroke)', strokeLinejoin: 'round' };

/** Pattern fills (identity without colour). Every <svg> that draws glyphs includes its own <GlyphDefs prefix=…/>. */
export function GlyphDefs({ prefix }: { prefix: string }) {
    return (
        <defs>
            <pattern id={`${prefix}-stripes`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: 'var(--ink)', strokeWidth: 2 }} />
            </pattern>
            <pattern id={`${prefix}-dots`} width="7" height="7" patternUnits="userSpaceOnUse">
                <circle cx="3.5" cy="3.5" r="1.5" style={{ fill: 'var(--ink)' }} />
            </pattern>
            <pattern id={`${prefix}-cross`} width="7" height="7" patternUnits="userSpaceOnUse">
                <path d="M0 0L7 7M7 0L0 7" style={{ stroke: 'var(--ink)', strokeWidth: 1.2 }} />
            </pattern>
        </defs>
    );
}

export function shapePath(shape: GlyphShape, s: number): string {
    switch (shape) {
        case 'CIRCLE':
            return `M ${-s} 0 A ${s} ${s} 0 1 0 ${s} 0 A ${s} ${s} 0 1 0 ${-s} 0 Z`;
        case 'CAPSULE': {
            const w = s * 2;
            const r = (s * 1.05) / 2;
            return `M ${-w / 2 + r} ${-r} H ${w / 2 - r} A ${r} ${r} 0 0 1 ${w / 2 - r} ${r} H ${-w / 2 + r} A ${r} ${r} 0 0 1 ${-w / 2 + r} ${-r} Z`;
        }
        case 'HEX': {
            const pts = Array.from({ length: 6 }, (_, i) => {
                const a = (Math.PI / 180) * (60 * i - 90);
                return `${(s * Math.cos(a)).toFixed(2)} ${(s * Math.sin(a)).toFixed(2)}`;
            });
            return `M ${pts.join(' L ')} Z`;
        }
        case 'TRIANGLE':
            return `M 0 ${-s} L ${(s * 0.92).toFixed(2)} ${(s * 0.72).toFixed(2)} L ${(-s * 0.92).toFixed(2)} ${(s * 0.72).toFixed(2)} Z`;
    }
}

interface UnitProps {
    glyph: GlyphStyle;
    s: number;
    /** 1 = whole unit; 0.25 / 0.5 / 0.75 = scored fraction. */
    fraction: number;
    prefix: string;
    uid: string;
}

function Unit({ glyph, s, fraction, prefix, uid }: UnitProps) {
    const d = shapePath(glyph.shape, s);
    const full = fraction >= 0.999;
    const w = 2 * s * fraction;
    const fillClip = `${uid}-f`;
    const shapeClip = `${uid}-s`;
    const pattern = glyph.pattern === 'SOLID' ? null : `url(#${prefix}-${glyph.pattern.toLowerCase()})`;
    return (
        <g>
            {!full && (
                <>
                    <clipPath id={fillClip}>
                        <rect x={-s} y={-s} width={w} height={2 * s} />
                    </clipPath>
                    <clipPath id={shapeClip}>
                        <path d={d} />
                    </clipPath>
                    {/* the missing part of the tablet, dashed */}
                    <path d={d} fill="none" style={{ ...INK, strokeWidth: 1.6, strokeDasharray: '3 3' }} />
                </>
            )}
            <g clipPath={full ? undefined : `url(#${fillClip})`}>
                <path d={d} style={{ fill: `var(--hue-${glyph.hue})` }} />
                {pattern && <path d={d} style={{ fill: pattern }} />}
                <path d={d} fill="none" style={INK} />
            </g>
            {glyph.shape === 'CAPSULE' && full && <line x1={0} y1={-s * 0.52} x2={0} y2={s * 0.52} style={{ ...INK, strokeWidth: 2 }} />}
            {!full && <line x1={-s + w} y1={-s} x2={-s + w} y2={s} clipPath={`url(#${shapeClip})`} style={{ ...INK, strokeWidth: 2.2 }} />}
        </g>
    );
}

function Badge({ label, s }: { label: string; s: number }) {
    const w = Math.max(22, label.length * 8 + 10);
    return (
        <g transform={`translate(${s * 0.62} ${s * 0.78})`} aria-hidden="true">
            <rect x={-w / 2} y={-9} width={w} height={18} rx={9} style={{ fill: 'var(--ink)' }} />
            <text textAnchor="middle" y={4.5} style={{ fill: 'var(--paper)', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-ui)' }}>
                {label}
            </text>
        </g>
    );
}

function Cup({ s }: { s: number }) {
    const k = s / 16;
    return (
        <g transform={`scale(${k})`}>
            <path d="M -10 -14 H 10 L 8 14 H -8 Z" style={{ fill: 'var(--paper)', ...INK }} />
            <path d="M -9.3 0 H 9.3 L 8 14 H -8 Z" style={{ fill: 'var(--hue-1)' }} />
            <path d="M -6 -7 H -2 M -6 -2 H -2 M -6 3 H -2" style={{ ...INK, strokeWidth: 1.4 }} />
        </g>
    );
}

export interface PillGlyphProps {
    glyph: GlyphStyle;
    geometry: DoseGeometry;
    /** Diameter in SVG user units. The glyph is centred on (0,0). */
    size: number;
    prefix: string;
}

/** Real pill geometry: ½ shows a scored half with the missing half dashed; 2× stacks two units; badge states the exact amount. */
export function PillGlyph({ glyph, geometry, size, prefix }: PillGlyphProps) {
    const uid = useId().replace(/:/g, '');
    const s = size / 2;
    if (geometry.kind === 'VOLUME') {
        return (
            <g>
                <Cup s={s} />
                <Badge label={geometry.label} s={s} />
            </g>
        );
    }
    const units: number[] = [...Array.from({ length: Math.min(geometry.whole, 2) }, () => 1), ...(geometry.partial > 0 ? [geometry.partial] : [])];
    const n = units.length;
    const scale = n === 1 ? 0.92 : 0.7;
    const offsets: ReadonlyArray<readonly [number, number]> =
        n === 1 ? [[0, 0]] : n === 2 ? [[-0.3, -0.22], [0.3, 0.22]] : [[-0.34, -0.26], [0.34, -0.26], [0, 0.34]];
    return (
        <g>
            {units.map((fraction, i) => (
                <g key={i} transform={`translate(${(offsets[i]?.[0] ?? 0) * s} ${(offsets[i]?.[1] ?? 0) * s})`}>
                    <Unit glyph={glyph} s={s * scale} fraction={fraction} prefix={prefix} uid={`${uid}${i}`} />
                </g>
            ))}
            <Badge label={geometry.label} s={s} />
        </g>
    );
}