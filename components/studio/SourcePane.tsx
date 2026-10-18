'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { CompiledMedication, DocumentKind } from '@/types/ums';

const KIND_LABEL: Record<DocumentKind, string> = {
    DISCHARGE_TABLE: 'Discharge table',
    MEDICATION_LIST: 'Medication list',
    BOTTLE_LABEL: 'Bottle label',
    HANDWRITTEN_RX: 'Handwritten prescription',
    OTHER: 'Document',
};

interface Seg {
    text: string;
    lineId: string | null;
    evidence: boolean;
}

/** Splits rawText at every line/evidence boundary so highlights are exact character spans. */
function segment(raw: string, meds: readonly CompiledMedication[]): Seg[] {
    const cuts = new Set<number>([0, raw.length]);
    for (const m of meds) {
        if (m.span) {
            cuts.add(m.span.start);
            cuts.add(m.span.end);
        }
        for (const h of m.halts) for (const ev of h.evidence) if (ev.span) (cuts.add(ev.span.start), cuts.add(ev.span.end));
    }
    const pts = [...cuts].filter((p) => p >= 0 && p <= raw.length).sort((a, b) => a - b);
    const out: Seg[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i] as number;
        const b = pts[i + 1] as number;
        if (a === b) continue;
        const owner = meds.find((m) => m.span && a >= m.span.start && b <= m.span.end);
        const evidence =
            !!owner?.span &&
            owner.halts.some((h) =>
                h.evidence.some((ev) => {
                    const s = ev.span;
                    if (!s || !owner.span) return false;
                    const wholeLine = s.start <= owner.span.start && s.end >= owner.span.end; // line-level evidence is not a field highlight
                    return !wholeLine && a >= s.start && b <= s.end;
                }),
            );
        out.push({ text: raw.slice(a, b), lineId: owner?.lineId ?? null, evidence });
    }
    return out;
}

interface Props {
    rawText: string;
    kind: DocumentKind;
    medications: readonly CompiledMedication[];
    activeLineId: string | null;
    onHoverLine(id: string | null): void;
    onPickLine(id: string): void;
}

export function SourcePane({ rawText, kind, medications, activeLineId, onHoverLine, onPickLine }: Props) {
    const segs = useMemo(() => segment(rawText, medications), [rawText, medications]);
    const halted = useMemo(() => new Set(medications.filter((m) => m.status === 'HALTED').map((m) => m.lineId)), [medications]);
    const ref = useRef<HTMLPreElement>(null);

    useEffect(() => {
        if (!activeLineId || !ref.current) return;
        ref.current.querySelector<HTMLElement>(`[data-line="${CSS.escape(activeLineId)}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [activeLineId]);

    return (
        <div className="border-2 border-[var(--ink)] bg-[var(--paper)]">
            <div className="flex items-center justify-between border-b-2 border-[var(--ink)] px-4 py-2">
                <span className="f-data text-[12px] font-semibold uppercase tracking-[0.14em]">Original · {KIND_LABEL[kind]}</span>
                <span className="f-data text-[12px] text-[var(--ink-2)]">verbatim, exact spans</span>
            </div>
            <pre
                ref={ref}
                aria-label="Original document text. Highlighted lines match the selected dose."
                className="f-data max-h-[62vh] overflow-auto whitespace-pre-wrap break-words px-4 py-4 text-[15px] leading-8"
            >
                {segs.map((seg, i) => {
                    if (!seg.lineId) return <span key={i}>{seg.text}</span>;
                    const active = seg.lineId === activeLineId;
                    const cls = [
                        'cursor-pointer',
                        active && !seg.evidence ? 'bg-[var(--ink)] text-[var(--paper)]' : '',
                        seg.evidence ? 'bg-[var(--amber)] font-semibold text-[var(--amber-ink)]' : '',
                        halted.has(seg.lineId) && !seg.evidence ? 'underline decoration-[var(--amber)] decoration-wavy decoration-2 underline-offset-4' : '',
                    ].join(' ');
                    return (
                        <span
                            key={i}
                            data-line={seg.lineId}
                            className={cls}
                            onMouseEnter={() => onHoverLine(seg.lineId)}
                            onMouseLeave={() => onHoverLine(null)}
                            onClick={() => onPickLine(seg.lineId as string)}
                        >
                            {seg.text}
                        </span>
                    );
                })}
            </pre>
        </div>
    );
}