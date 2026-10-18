'use client';

import type { ReactNode } from 'react';
import { Contrast, Eye, Languages, Printer, Volume2, VolumeX } from 'lucide-react';
import { LANGS, type Lang } from '@/lib/phrasebook';

const Kbd = ({ children }: { children: ReactNode }) => (
    <kbd className="f-data ml-1.5 rounded-[3px] border border-current px-1.5 text-[12px] font-semibold leading-5">{children}</kbd>
);
const btn = 'tactile inline-flex min-h-[44px] items-center gap-2 px-3 text-[14px] font-semibold';

interface Props {
    calm: boolean;
    contrast: boolean;
    speaking: boolean;
    lang: Lang;
    status: string;
    canPrint: boolean;
    onCalm(): void;
    onContrast(): void;
    onSpeak(): void;
    onLang(l: Lang): void;
    onPrint(): void;
}

export function AccessibilityHud(p: Props) {
    return (
        <div className="flex max-w-full flex-col items-end gap-2">
            <div role="toolbar" aria-label="Accessibility controls" className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" className={btn} aria-pressed={p.calm} onClick={p.onCalm}>
                    <Eye size={18} aria-hidden /> Calm mode <Kbd>C</Kbd>
                </button>
                <button type="button" className={btn} aria-pressed={p.contrast} onClick={p.onContrast}>
                    <Contrast size={18} aria-hidden /> High contrast <Kbd>H</Kbd>
                </button>
                <button type="button" className={btn} aria-pressed={p.speaking} onClick={p.onSpeak}>
                    {p.speaking ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />} Read aloud <Kbd>Space</Kbd>
                </button>
                <div className="relative">
                    <label htmlFor="mr-lang" className="sr-only">Plain-language translation</label>
                    <Languages size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
                    <select
                        id="mr-lang"
                        value={p.lang}
                        onChange={(e) => p.onLang(e.target.value as Lang)}
                        className="tactile min-h-[44px] appearance-none pl-10 pr-8 text-[14px] font-semibold"
                    >
                        {LANGS.map((l) => (
                            <option key={l.id} value={l.id}>{l.label}</option>
                        ))}
                    </select>
                </div>
                <button type="button" className={btn} disabled={!p.canPrint} onClick={p.onPrint}>
                    <Printer size={18} aria-hidden /> Fridge sheet <Kbd>P</Kbd>
                </button>
            </div>
            <p className="f-data text-[12px] text-[var(--ink-2)]">
                <Kbd>←</Kbd><Kbd>→</Kbd> cycle doses · <Kbd>1</Kbd><Kbd>2</Kbd><Kbd>3</Kbd> presets · <Kbd>L</Kbd> language · <Kbd>S</Kbd> scan
            </p>
            <p role="status" aria-live="polite" className="min-h-[18px] max-w-[520px] text-right text-[12px] text-[var(--ink-2)]">{p.status}</p>
        </div>
    );
}