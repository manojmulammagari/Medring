'use client';

import { Printer, X } from 'lucide-react';
import type { CompiledMedication, CompiledSchedule } from '@/types/ums';
import { UMS_SLOTS, type UmsSlot } from '@/types/ums';
import type { GlyphStyle } from '@/lib/ui-model';
import type { Lang } from '@/lib/phrasebook';
import { GlyphDefs, PillGlyph } from '@/components/ring/PillGlyph';
import { formatWindow } from '@/lib/ring-geometry';
import { describeDose, slotName, ui } from '@/lib/phrasebook';
import { entriesForSlot } from '@/lib/ui-model';

const FALLBACK: GlyphStyle = { shape: 'CIRCLE', pattern: 'SOLID', hue: 0 };

interface Props {
    open: boolean;
    onClose(): void;
    schedule: CompiledSchedule;
    glyphs: ReadonlyMap<string, GlyphStyle>;
    lang: Lang;
    generatedAt: string;
}

export function PrintPreviewModal({ open, onClose, schedule, glyphs, lang, generatedAt }: Props) {
    const T = ui(lang);
    const prn = schedule.medications.filter((m): m is CompiledMedication & { prn: NonNullable<CompiledMedication['prn']> } => m.status === 'PRN' && m.prn !== null);
    const halted = schedule.medications.filter((m) => m.status === 'HALTED');

    return (
        <dialog
            open={open}
            onClose={onClose}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            aria-labelledby="print-title"
            className="border-2 border-[var(--ink)] bg-[var(--card)] p-0 text-[var(--ink)] shadow-[8px_8px_0_var(--ink)] max-w-[720px] w-[96vw]"
        >
            <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 id="print-title" className="f-display text-[26px] font-semibold leading-tight">
                            {T.fridgeTitle}
                        </h2>
                        <p className="f-data text-[13px] text-[var(--ink-2)]">
                            MedRing · {generatedAt} · Print preview (press <kbd className="mr-kbd">P</kbd> to send to printer)
                        </p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="tactile grid h-11 w-11 place-items-center">
                        <X size={20} aria-hidden />
                    </button>
                </div>

                <div className="mt-6 bg-white border-2 border-[var(--ink)] p-5 shadow-[4px_4px_0_var(--ink)] print:shadow-none">
                    <p className="f-data text-[11px] uppercase tracking-wider text-[var(--ink-2)] mb-2">Single-page refrigerator sheet · caregiver checklist</p>
                    <table className="mt-3 w-full border-collapse border-[3px] border-[var(--ink)]">
                        <tbody>
                            {UMS_SLOTS.map((slot) => {
                                const entries = entriesForSlot(schedule, slot);
                                return (
                                    <tr key={slot} className="border-b border-[var(--ink-2)] align-top last:border-0">
                                        <th scope="row" className="w-[30%] border-r border-[var(--ink-2)] p-3 text-left">
                                            <span className="f-display block text-[22px] font-bold leading-none">{slotName(slot, lang)}</span>
                                            <span className="f-data text-[11px]">{formatWindow(slot)}</span>
                                        </th>
                                        <td className="p-3">
                                            {entries.length === 0 ? (
                                                <span className="text-[16px] text-[var(--ink-2)]">— none —</span>
                                            ) : (
                                                <ul className="space-y-2">
                                                    {entries.map(({ med, dose }, i) => (
                                                        <li key={`${med.lineId}-${slot}`} className="flex items-start gap-3">
                                                            <div className="flex items-center gap-2">
                                                                <input type="checkbox" className="w-5 h-5 border-[var(--ink)] rounded focus-visible:ring-2 focus-visible:ring-amber-500" aria-label={`Mark ${med.drugName} taken`} />
                                                                <svg viewBox="-30 -30 60 60" width="40" height="40" aria-hidden>
                                                                    <GlyphDefs prefix={`ppv${slot}${i}`} />
                                                                    <PillGlyph glyph={glyphs.get(med.lineId) ?? FALLBACK} geometry={dose.geometry} size={42} prefix={`ppv${slot}${i}`} />
                                                                </svg>
                                                            </div>
                                                            <div>
                                                                <p className="text-[15px] font-bold leading-tight">{[med.drugName, med.strength].filter(Boolean).join(' ')}</p>
                                                                <p className="text-[13px] leading-tight text-[var(--ink-2)]">{describeDose(med, dose, lang)}</p>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {prn.length > 0 && (
                        <div className="mt-5 border-2 border-[var(--ink)] p-3">
                            <p className="f-data text-[11px] font-bold uppercase tracking-wider">{T.ifNeeded}</p>
                            {prn.map((m) => (
                                <div key={m.lineId} className="mt-2 flex items-start gap-2">
                                    <input type="checkbox" className="mt-1 w-5 h-5 border-[var(--ink)] rounded focus-visible:ring-2 focus-visible:ring-amber-500" aria-label={`Mark ${m.drugName} taken`} />
                                    <div>
                                        <p className="text-[15px] font-bold leading-tight">{[m.drugName, m.strength].filter(Boolean).join(' ')}</p>
                                        <p className="text-[13px] leading-tight text-[var(--ink-2)]">{m.prn?.indication}. {m.prn?.directionsVerbatim}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {halted.length > 0 && (
                        <div className="mt-5 border-2 border-[var(--ink)] border-dashed p-3 bg-[var(--amber-bg)] text-[var(--amber-ink)]">
                            <p className="f-data text-[11px] font-bold uppercase tracking-wider">{T.questions}</p>
                            {halted.map((m) => (
                                <p key={m.lineId} className="mt-2 whitespace-pre-wrap text-[13px] leading-snug">{m.pharmacistQuestion}</p>
                            ))}
                        </div>
                    )}

                    <div className="mt-5 border-t-2 border-[var(--ink-2)] pt-3 flex items-center justify-between">
                        <button type="button" onClick={onClose} className="tactile px-4 py-2 text-[14px] font-semibold">
                            Back to dashboard
                        </button>
                        <button type="button" onClick={() => window.print()} className="tactile flex items-center gap-2 px-4 py-2 text-[14px] font-semibold">
                            <Printer size={16} aria-hidden /> Print sheet <span className="mr-kbd">P</span>
                        </button>
                    </div>
                </div>
            </div>
        </dialog>
    );
}
