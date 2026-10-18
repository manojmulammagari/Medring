'use client';

import { useId } from 'react';
import { ChevronLeft, ChevronRight, Eye, TriangleAlert, Volume2, VolumeX } from 'lucide-react';
import type { CompiledMedication, CompiledSchedule, UmsSlot } from '@/types/ums';
import { GlyphDefs, PillGlyph } from '@/components/ring/PillGlyph';
import { formatWindow } from '@/lib/ring-geometry';
import { describeDose, slotName, ui, type Lang } from '@/lib/phrasebook';
import { entriesForSlot, shiftCalmSlot, type GlyphStyle } from '@/lib/ui-model';

const FALLBACK: GlyphStyle = { shape: 'CIRCLE', pattern: 'SOLID', hue: 0 };

interface Props {
    schedule: CompiledSchedule;
    glyphs: ReadonlyMap<string, GlyphStyle>;
    lang: Lang;
    slot: UmsSlot | null;
    speaking: boolean;
    onShift(dir: 1 | -1): void;
    onSpeak(): void;
    onExit(): void;
}

function SlotList({ schedule, glyphs, lang, slot, uid }: { schedule: CompiledSchedule; glyphs: ReadonlyMap<string, GlyphStyle>; lang: Lang; slot: UmsSlot; uid: string }) {
    const entries = entriesForSlot(schedule, slot);
    return (
        <ul>
            {entries.map(({ med, dose }, i) => (
                <li key={`${med.lineId}-${slot}`} className="flex items-center gap-5 border-t-2 border-[var(--ink)] py-5">
                    <svg viewBox="-36 -36 72 72" className="h-[84px] w-[84px] shrink-0" aria-hidden="true">
                        <GlyphDefs prefix={`${uid}${i}`} />
                        <PillGlyph glyph={glyphs.get(med.lineId) ?? FALLBACK} geometry={dose.geometry} size={58} prefix={`${uid}${i}`} />
                    </svg>
                    <div>
                        <p className="f-display text-[30px] font-semibold leading-tight">{[med.drugName, med.strength].filter(Boolean).join(' ')}</p>
                        <p className="text-[24px] leading-snug">{describeDose(med, dose, lang)}</p>
                    </div>
                </li>
            ))}
        </ul>
    );
}

/** Zero-noise single-card view. Safety items (as-needed medicines, pharmacist chips) stay visible. */
export function CalmCard({ schedule, glyphs, lang, slot, speaking, onShift, onSpeak, onExit }: Props) {
    const uid = useId().replace(/:/g, '');
    const T = ui(lang);
    const next = slot ? shiftCalmSlot(schedule, slot, 1) : null;
    const prn = schedule.medications.filter((m): m is CompiledMedication => m.status === 'PRN' && m.prn !== null);
    const halted = schedule.medications.filter((m) => m.status === 'HALTED');
    const btn = 'tactile inline-flex min-h-[48px] items-center gap-2 px-4 text-[18px] font-semibold';

    return (
        <article lang={lang} aria-label="Calm view" className="mx-auto max-w-[760px] space-y-10 text-[24px] leading-snug">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2">
                    <button type="button" className={btn} onClick={() => onShift(-1)} aria-label="Earlier time of day"><ChevronLeft size={22} aria-hidden /> Earlier</button>
                    <button type="button" className={btn} onClick={() => onShift(1)} aria-label="Later time of day">Later <ChevronRight size={22} aria-hidden /></button>
                </div>
                <div className="flex gap-2">
                    <button type="button" className={btn} aria-pressed={speaking} onClick={onSpeak}>{speaking ? <VolumeX size={22} aria-hidden /> : <Volume2 size={22} aria-hidden />} Read aloud</button>
                    <button type="button" className={btn} onClick={onExit}><Eye size={22} aria-hidden /> Full view</button>
                </div>
            </div>

            {slot ? (
                <section aria-label={T.rightNow}>
                    <p className="f-data text-[16px] font-semibold uppercase tracking-[0.16em]">{T.rightNow}</p>
                    <h2 className="f-display mt-1 text-[48px] font-semibold leading-none">{slotName(slot, lang)}</h2>
                    <p className="f-data mt-1 text-[16px] text-[var(--ink-2)]">{formatWindow(slot)} · based on this device&apos;s clock; use Earlier / Later to preview</p>
                    <div className="mt-4"><SlotList schedule={schedule} glyphs={glyphs} lang={lang} slot={slot} uid={`${uid}a`} /></div>
                </section>
            ) : (
                <p>{T.nothingDue}</p>
            )}

            {slot && next && next !== slot && (
                <section aria-label={T.upNext}>
                    <p className="f-data text-[16px] font-semibold uppercase tracking-[0.16em]">{T.upNext}</p>
                    <h3 className="f-display mt-1 text-[34px] font-semibold leading-none">{slotName(next, lang)}</h3>
                    <div className="mt-4"><SlotList schedule={schedule} glyphs={glyphs} lang={lang} slot={next} uid={`${uid}b`} /></div>
                </section>
            )}

            {prn.length > 0 && (
                <section aria-label={T.ifNeeded} className="border-2 border-[var(--ink)] p-5">
                    <p className="f-data text-[16px] font-semibold uppercase tracking-[0.16em]">{T.ifNeeded}</p>
                    {prn.map((m) => (
                        <div key={m.lineId} className="mt-3">
                            <p className="f-display text-[30px] font-semibold leading-tight">{[m.drugName, m.strength].filter(Boolean).join(' ')}</p>
                            <p>{m.prn?.indication}</p>
                            <p className="mt-1 text-[24px]">{m.prn?.directionsVerbatim}</p>
                        </div>
                    ))}
                </section>
            )}

            {halted.length > 0 && (
                <section aria-label={T.askPharmacist} className="space-y-3">
                    {halted.map((m) => (
                        <div key={m.lineId} className="flex items-start gap-3 border-2 border-[var(--ink)] bg-[var(--amber)] p-5 text-[var(--amber-ink)]">
                            <TriangleAlert size={28} aria-hidden className="mt-1 shrink-0" />
                            <div><p className="font-bold">{m.drugName}</p><p>{T.askPharmacist}. The label is unclear.</p></div>
                        </div>
                    ))}
                </section>
            )}
        </article>
    );
}