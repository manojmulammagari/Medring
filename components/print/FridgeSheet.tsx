'use client';

import { useId } from 'react';
import { UMS_SLOTS, type CompiledMedication, type CompiledSchedule } from '@/types/ums';
import { GlyphDefs, PillGlyph } from '@/components/ring/PillGlyph';
import { formatWindow } from '@/lib/ring-geometry';
import { describeDose, slotName, ui, type Lang } from '@/lib/phrasebook';
import { entriesForSlot, type GlyphStyle } from '@/lib/ui-model';

const FALLBACK: GlyphStyle = { shape: 'CIRCLE', pattern: 'SOLID', hue: 0 };

interface Props {
    schedule: CompiledSchedule;
    glyphs: ReadonlyMap<string, GlyphStyle>;
    lang: Lang;
    generatedAt: string;
}

/** Print-only, high-contrast, one page. Hidden on screen; shown by @media print (press P). */
export function FridgeSheet({ schedule, glyphs, lang, generatedAt }: Props) {
    const uid = useId().replace(/:/g, '');
    const T = ui(lang);
    const prn = schedule.medications.filter((m): m is CompiledMedication => m.status === 'PRN' && m.prn !== null);
    const halted = schedule.medications.filter((m) => m.status === 'HALTED');

    return (
        <section lang={lang} className="hidden bg-white text-black print:block">
            <h1 className="f-display text-[30pt] font-bold leading-none">{T.fridgeTitle}</h1>
            <p className="f-data mt-1 text-[10pt]">MedRing · {generatedAt}</p>

            <table className="mt-4 w-full border-collapse border-[3px] border-black">
                <tbody>
                    {UMS_SLOTS.map((slot) => {
                        const entries = entriesForSlot(schedule, slot);
                        return (
                            <tr key={slot} className="border-b-[3px] border-black align-top">
                                <th scope="row" className="w-[28%] border-r-[3px] border-black p-3 text-left">
                                    <span className="f-display block text-[24pt] font-bold leading-none">{slotName(slot, lang)}</span>
                                    <span className="f-data text-[11pt]">{formatWindow(slot)}</span>
                                </th>
                                <td className="p-3">
                                    {entries.length === 0 ? (
                                        <span className="text-[16pt]">—</span>
                                    ) : (
                                        <ul className="space-y-2">
                                            {entries.map(({ med, dose }, i) => (
                                                <li key={`${med.lineId}-${slot}`} className="flex items-center gap-4">
                                                    <svg viewBox="-34 -34 68 68" width="56" height="56" aria-hidden="true">
                                                        <GlyphDefs prefix={`${uid}${slot}${i}`} />
                                                        <PillGlyph glyph={glyphs.get(med.lineId) ?? FALLBACK} geometry={dose.geometry} size={52} prefix={`${uid}${slot}${i}`} />
                                                    </svg>
                                                    <div>
                                                        <p className="text-[18pt] font-bold leading-tight">{[med.drugName, med.strength].filter(Boolean).join(' ')}</p>
                                                        <p className="text-[16pt] leading-tight">{describeDose(med, dose, lang)}</p>
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
                <div className="mt-4 border-[3px] border-black p-3">
                    <p className="f-data text-[11pt] font-bold uppercase tracking-widest">{T.ifNeeded}</p>
                    {prn.map((m) => (
                        <div key={m.lineId} className="mt-2">
                            <p className="text-[18pt] font-bold leading-tight">{[m.drugName, m.strength].filter(Boolean).join(' ')}</p>
                            <p className="text-[14pt] leading-tight">{T.labelDirections}: {m.prn?.indication}. {m.prn?.directionsVerbatim}</p>
                        </div>
                    ))}
                </div>
            )}

            {halted.length > 0 && (
                <div className="mt-4 border-[3px] border-dashed border-black p-3">
                    <p className="f-data text-[11pt] font-bold uppercase tracking-widest">{T.questions}</p>
                    {halted.map((m) => (
                        <p key={m.lineId} className="mt-2 whitespace-pre-wrap text-[13pt] leading-snug">{m.pharmacistQuestion}</p>
                    ))}
                </div>
            )}

            <p className="mt-4 text-[10pt] leading-snug">{T.disclaimer}</p>
        </section>
    );
}