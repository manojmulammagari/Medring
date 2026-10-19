'use client';

import { useEffect, useState } from 'react';
import { Check, ClipboardCopy, TriangleAlert, Volume2, VolumeX } from 'lucide-react';
import type { CompiledMedication, SlotProvenance } from '@/types/ums';
import { describeDose, describeMedication, slotName, ui, type Lang } from '@/lib/phrasebook';

const PROVENANCE: Record<SlotProvenance, Record<Lang, string>> = {
    PATTERN: {
        en: 'Time read from the dose pattern on the label.',
        hi: 'लेबल पर खुराक पैटर्न से समय पढ़ा गया।',
        es: 'Hora leída del patrón de dosis en la etiqueta.',
    },
    TIME_WORD: {
        en: 'Time of day stated on the label.',
        hi: 'लेबल पर दिन का समय बताया गया।',
        es: 'Hora del día indicada en la etiqueta.',
    },
    UMS_FREQUENCY_MAP: {
        en: 'The label gave only a count (for example "twice daily"). Placed by the UMS convention; confirm with your pharmacist if timing matters.',
        hi: 'लेबल में केवल संख्या दी गई है (उदाहरण के लिए "दो बार दैनिक")। यूएमएस परंपरा के अनुसार रखा गया; समय महत्वपूर्ण होने पर अपने फार्मासिस्ट से पुष्टि करें।',
        es: 'La etiqueta daba solo un recuento (por ejemplo "dos veces al día"). Colocado por la convención de UMS; confirme con su farmacéutico si el momento es importante.',
    },
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
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const toggleDose = (slot: string): void => setChecked((c) => { const n = new Set(c); n.has(slot) ? n.delete(slot) : n.add(slot); return n; });
    const isChecked = (slot: string): boolean => checked.has(slot);

    // Verbatim clinical-provenance notice for before-food (AC / empty-stomach) doses.
    const hasBeforeFood = med?.doses.some((d) => d.mealRule === 'BEFORE_FOOD') ?? false;
    return (
        <section aria-label="Selected medicine" className="bg-[var(--paper)] p-4">
            <div aria-live="polite" lang={lang}>
                {!med ? (
                    <p className="text-[15px] text-[var(--ink-2)]">Hover or focus a dose, or press ← → to step through. The matching line in the original is highlighted.</p>
                ) : (
                    <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <h2 className="f-display text-[26px] font-semibold leading-tight">{[med.drugName, med.strength].filter(Boolean).join(' ')}</h2>
                            <button type="button" aria-pressed={speaking} onClick={onSpeak} className="tactile inline-flex min-h-[44px] items-center gap-2 px-3 text-[14px] font-semibold">
                                {speaking ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />} {T.readAloud}
                            </button>
                        </div>

                        {hasBeforeFood && (
                            <div className="mt-3 rounded-xl border-l-4 border-l-rose-500 border border-rose-200 bg-rose-50/80 p-3 text-xs leading-relaxed text-rose-950 flex items-start gap-2.5" role="status" aria-label="Clinical provenance">
                                <span aria-hidden>⚖️</span>
                                <span>{lang === 'hi' ? 'शाब्दिक मोड — मुद्रित समय कोड से सख्ती से रखा गया; मेडरिंग कभी क्लिनिशियन संक्षिप्त नाम को ओवरराइड या अनुमान नहीं लगाता।' : lang === 'es' ? 'Modo literal — colocado estrictamente desde el código de tiempo impreso; MedRing nunca anula ni adivina la abreviatura del médico.' : 'Verbatim mode — placed strictly from the printed timing code; MedRing never overrides or guesses clinician shorthand.'}</span>
                            </div>
                        )}

                        <p className="mt-3 text-[20px] leading-snug">{describeMedication(med, lang)}</p>

                        {med.status === 'SCHEDULED' && (
                            <ul className="mt-4 space-y-2">
                                {med.doses.map((d) => {
                                    const isTaken = isChecked(d.slot);
                                    return (
                                        <li key={d.slot} className="border border-stone-200 rounded-xl p-3 hover:bg-stone-50/60 transition-colors">
                                            <div className={`flex items-center justify-between gap-3 w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border ${
                                                isTaken
                                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                                                    : 'border-stone-200 bg-stone-50 hover:bg-amber-50/60'
                                            } transition-colors cursor-pointer`}>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked(d.slot)}
                                                        onChange={() => toggleDose(d.slot)}
                                                        aria-label={`Mark ${[med.drugName, med.strength].filter(Boolean).join(' ')} ${slotName(d.slot, lang)} dose as taken`}
                                                        className="w-5 h-5 border-stone-600 rounded focus-visible:ring-2 focus-visible:ring-amber-500"
                                                    />
                                                    <span className={`font-medium ${isTaken ? 'text-emerald-900' : 'text-stone-700'}`}>
                                                        {isTaken ? T.taken : T.takeDose}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1 text-[10px] font-mono">
                                                    <span className="text-stone-500">{slotName(d.slot, lang)}</span>
                                                    <span className="text-stone-700 font-bold">{describeDose(med, d, lang)}</span>
                                                </div>
                                            </div>
                                            <div className={`mt-2 p-3 rounded-xl border ${isTaken ? 'bg-emerald-50 border-emerald-200' : 'bg-stone-900 border-stone-700'}`}>
                                                <span className={`block text-[9px] uppercase tracking-wider ${isTaken ? 'text-emerald-600' : 'text-stone-400'} mb-1`}>
                                                    {PROVENANCE[d.provenance][lang]}
                                                </span>
                                                <span className={`block whitespace-pre-wrap text-xs ${isTaken ? 'text-emerald-900' : 'text-amber-300'}`}>
                                                    {`Source: ${[med.drugName, med.strength].filter(Boolean).join(' ')} · ${slotName(d.slot, lang)} · ${describeDose(med, d, lang)}`}
                                                    {d.mealRule === 'NONE_STATED' ? ` · ${lang === 'hi' ? 'मुद्रित खाद्य नियम नहीं — कभी अनुमान नहीं लगाया गया' : lang === 'es' ? ' · sin regla de alimento impresa — nunca adivinado' : 'no printed food rule — never guessed'}` : ''}
                                                </span>
                                            </div>
                                        </li>
                                    );
                                })}
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

                        <p className="f-data mt-4 text-[12px] uppercase tracking-[0.14em] text-[var(--ink-2)]">{T.originalLine}</p>
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