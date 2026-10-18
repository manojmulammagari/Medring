'use client';

import { useEffect, useState } from 'react';
import { Check, ClipboardCopy, TriangleAlert, Volume2, VolumeX } from 'lucide-react';
import type { CompiledMedication, SlotProvenance } from '@/types/ums';
import { describeDose, describeMedication, slotName, ui, type Lang } from '@/lib/phrasebook';

const PROVENANCE: Record<SlotProvenance, string> = {
    PATTERN: 'Time read from the dose pattern on the label.',
    TIME_WORD: 'Time of day stated on the label.',
    UMS_FREQUENCY_MAP: 'The label gave only a count (for example "twice daily"). Placed by the UMS convention; confirm with your pharmacist if timing matters.',
};

function CopyButton({ text }: { text: string }) {
    const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
    useEffect(() => {
        if (state === 'idle') return;
        const t = setTimeout(() => setState('idle'), 2200);
        return () => clearTimeout(t);
    }, [state]);
    return (
        <button
            type="button"
            className="tactile inline-flex min-h-[44px] items-center gap-2 px-3 text-[14px] font-semibold"
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(text);
                    setState('ok');
                } catch {
                    setState('fail');
                }
            }}
        >
            {state === 'ok' ? <Check size={18} aria-hidden /> : <ClipboardCopy size={18} aria-hidden />}
            {state === 'ok' ? 'Copied' : state === 'fail' ? 'Copy failed: select the text above' : 'Copy question'}
        </button>
    );
}

interface DetailProps {
    med: CompiledMedication | null;
    lang: Lang;
    speaking: boolean;
    onSpeak(): void;
}

export function DetailPanel({ med, lang, speaking, onSpeak }: DetailProps) {
    const T = ui(lang);
    return (
        <section aria-label="Selected medicine" className="border-2 border-[var(--ink)] bg-[var(--paper)] p-4">
            <div aria-live="polite" lang={lang}>
                {!med ? (
                    <p className="text-[15px] text-[var(--ink-2)]">Hover or focus a dose, or press ← → to step through. The matching line in the original is highlighted.</p>
                ) : (
                    <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <h2 className="f-display text-[26px] font-semibold leading-tight">{[med.drugName, med.strength].filter(Boolean).join(' ')}</h2>
                            <button type="button" aria-pressed={speaking} onClick={onSpeak} className="tactile inline-flex min-h-[44px] items-center gap-2 px-3 text-[14px] font-semibold">
                                {speaking ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />} Read aloud
                            </button>
                        </div>
                        <p className="mt-2 text-[20px] leading-snug">{describeMedication(med, lang)}</p>

                        {med.status === 'SCHEDULED' && (
                            <ul className="mt-3 space-y-2 text-[14px]">
                                {med.doses.map((d) => (
                                    <li key={d.slot} className="border-l-4 border-[var(--ink)] pl-3">
                                        <b>{slotName(d.slot, lang)}</b>: {describeDose(med, d, lang)}
                                        <span className="block text-[var(--ink-2)]">
                                            {PROVENANCE[d.provenance]}
                                            {d.mealRule === 'NONE_STATED' ? ' No food rule is printed on the label.' : ''}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {med.status === 'PRN' && med.prn && (
                            <div className="mt-3 border-2 border-[var(--ink)] p-3">
                                <p className="f-data text-[12px] font-semibold uppercase tracking-[0.14em]">{T.labelDirections}</p>
                                <p className="mt-1 text-[15px]">{med.prn.directionsVerbatim}</p>
                            </div>
                        )}

                        {med.status === 'HALTED' && (
                            <div className="mt-3 space-y-3">
                                {med.halts.map((h, i) => (
                                    <div key={`${h.code}-${i}`} className="border-2 border-[var(--ink)] bg-[var(--amber)] p-3 text-[var(--amber-ink)]">
                                        <p className="f-data text-[12px] font-bold uppercase tracking-[0.14em]">{h.code.replaceAll('_', ' ')}</p>
                                        <p className="mt-1 text-[15px] font-medium">{h.message}</p>
                                    </div>
                                ))}
                                {med.pharmacistQuestion && (
                                    <div>
                                        <p className="f-data text-[12px] font-semibold uppercase tracking-[0.14em]">{T.questions}</p>
                                        <blockquote className="mt-1 whitespace-pre-wrap border-l-4 border-[var(--ink)] pl-3 text-[15px]">{med.pharmacistQuestion}</blockquote>
                                        <div className="mt-2"><CopyButton text={med.pharmacistQuestion} /></div>
                                    </div>
                                )}
                            </div>
                        )}

                        <p className="f-data mt-4 text-[12px] uppercase tracking-[0.14em] text-[var(--ink-2)]">Original line</p>
                        <blockquote className="f-data mt-1 whitespace-pre-wrap border-l-4 border-[var(--ink)] pl-3 text-[14px]">{med.verbatim}</blockquote>
                        {med.duration && <p className="mt-2 text-[14px]"><b>Duration on label:</b> {med.duration}</p>}
                    </>
                )}
            </div>
        </section>
    );
}

interface TrayProps {
    meds: readonly CompiledMedication[];
    activeLineId: string | null;
    lang: Lang;
    onPick(lineId: string): void;
}

/** The amber "Verify with Pharmacist" guardrail chips. */
export function PharmacistTray({ meds, activeLineId, lang, onPick }: TrayProps) {
    const halted = meds.filter((m) => m.status === 'HALTED');
    if (halted.length === 0) return null;
    const T = ui(lang);
    return (
        <section aria-label="Needs pharmacist verification" className="space-y-3">
            {halted.map((m) => (
                <div key={m.lineId} className={`border-2 border-[var(--ink)] bg-[var(--amber)] p-3 text-[var(--amber-ink)] ${activeLineId === m.lineId ? 'shadow-[4px_4px_0_var(--ink)]' : ''}`}>
                    <button type="button" onClick={() => onPick(m.lineId)} className="flex min-h-[44px] w-full items-center gap-2 text-left text-[16px] font-bold">
                        <TriangleAlert size={20} aria-hidden /> Verify with pharmacist: {m.drugName}
                    </button>
                    <p className="mt-1 text-[14px]">{T.askPharmacist}. The app did not guess.</p>
                    {m.pharmacistQuestion && <div className="mt-2"><CopyButton text={m.pharmacistQuestion} /></div>}
                </div>
            ))}
        </section>
    );
}