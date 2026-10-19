'use client';

import type { ReactNode } from 'react';
import { Contrast, Eye, Printer, Volume2, VolumeX } from 'lucide-react';
import { LANGS, type Lang } from '@/lib/phrasebook';

const Kbd = ({ children }: { children: ReactNode }) => (
    <kbd className="mr-kbd">{children}</kbd>
);
const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-stone-300 text-stone-700 bg-white/80 hover:bg-white transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1';

const LANG_PILLS: Array<{ id: Lang; label: string }> = [
    { id: 'en', label: 'EN' },
    { id: 'hi', label: 'हिं' },
    { id: 'es', label: 'ES' },
];

interface Props {
    calm: boolean;
    contrast: boolean;
    elder: boolean;
    speaking: boolean;
    lang: Lang;
    status: string;
    canPrint: boolean;
    onCalm(): void;
    onContrast(): void;
    onElder(): void;
    onSpeak(): void;
    onLang(l: Lang): void;
    onPrint(): void;
    onScan(): void;
    onPrintPreview(): void;
}

export function AccessibilityHud(p: Props) {
    return (
        <div className="w-full flex flex-col gap-3 pt-3 mt-3 border-t border-stone-200/70">
            {/* Left group: Accessibility */}
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={`${btn} ${p.calm ? 'bg-amber-100 text-amber-900 border-amber-400 shadow-sm' : ''}`} aria-pressed={p.calm} onClick={p.onCalm}>
                    <Eye size={15} aria-hidden /> Calm <span className="hidden sm:inline">mode</span> <Kbd>C</Kbd>
                </button>
                <button type="button" className={`${btn} ${p.contrast ? 'bg-stone-900 text-white border-stone-900 shadow-sm' : ''}`} aria-pressed={p.contrast} onClick={p.onContrast}>
                    <Contrast size={15} aria-hidden /> High <span className="hidden sm:inline">contrast</span> <Kbd>H</Kbd>
                </button>
                <button type="button" className={`${btn} ${p.elder ? 'bg-indigo-100 text-indigo-900 border-indigo-400 shadow-sm' : ''}`} aria-pressed={p.elder} onClick={p.onElder}>
                    <span aria-hidden>👴</span> AA+ Elder <Kbd>E</Kbd>
                </button>
                <button type="button" className={`${btn} ${p.speaking ? 'bg-emerald-100 text-emerald-900 border-emerald-400 shadow-sm' : ''}`} aria-pressed={p.speaking} onClick={p.onSpeak}>
                    {p.speaking ? <VolumeX size={15} aria-hidden /> : <Volume2 size={15} aria-hidden />} Read <span className="hidden sm:inline">aloud</span> <Kbd>Space</Kbd>
                </button>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-stone-300 text-stone-700 bg-white text-xs font-medium">
                    <span aria-hidden>🌐</span>
                    {LANG_PILLS.map((l) => (
                        <button
                            key={l.id}
                            type="button"
                            role="radio"
                            aria-checked={p.lang === l.id}
                            aria-label={LANGS.find((x) => x.id === l.id)?.label ?? l.id}
                            onClick={() => p.onLang(l.id)}
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold uppercase transition-colors border ${
                                p.lang === l.id
                                    ? 'bg-stone-900 text-white border-stone-900'
                                    : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'
                            }`}
                        >
                            {l.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Right group: Output & Shortcuts */}
            <div className="flex items-center justify-between gap-2 w-full flex-wrap">
                <div className="flex items-center gap-2 text-[10px] font-mono text-stone-500 whitespace-nowrap">
                    <span>← → cycle doses</span>
                    <span className="text-stone-300">·</span>
                    <span>1–3 presets</span>
                    <span className="text-stone-300">·</span>
                    <span>L lang</span>
                    <span className="text-stone-300">·</span>
                    <span>S scan</span>
                </div>
                <div className="flex items-center gap-2">
                    <button type="button" className={btn} disabled={!p.canPrint} onClick={p.onPrint}>
                        <Printer size={15} aria-hidden /> Fridge sheet <Kbd>P</Kbd>
                    </button>
                    <button type="button" className={btn} onClick={p.onPrintPreview}>
                        <Eye size={15} aria-hidden /> Print preview <Kbd>V</Kbd>
                    </button>
                </div>
            </div>
        </div>
    );
}
