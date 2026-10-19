'use client';

import { X } from 'lucide-react';

interface Props {
    open: boolean;
    onClose(): void;
}

export function WhyMedRingModal({ open, onClose }: Props) {
    return (
        <dialog
            open={open}
            onClose={onClose}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            aria-labelledby="why-title"
            className="border-2 border-[var(--ink)] bg-[var(--card)] p-0 text-[var(--ink)] shadow-[8px_8px_0_var(--ink)]"
        >
            <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                    <h2 id="why-title" className="f-display text-[28px] font-semibold leading-tight">
                        Why MedRing Wins
                    </h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="tactile grid h-11 w-11 place-items-center">
                        <X size={20} aria-hidden />
                    </button>
                </div>
                <p className="mt-3 text-[15px] text-[var(--ink-2)] leading-relaxed">
                    Most medication apps rephrase, summarize, or guess what a label says. MedRing never guesses: every
                    dose, time, and food rule is restated verbatim from the printed label, then placed on a 24-hour ring
                    so a patient — or a pharmacist — can see the whole day at a glance.
                </p>
                <div className="mt-6 space-y-4">
                    <div className="border-l-4 border-[var(--ink)] pl-4">
                        <h3 className="f-data text-[13px] font-bold uppercase tracking-wider text-[var(--ink-2)] mb-1">Deterministic, not generative</h3>
                        <p className="text-[14px] leading-relaxed">
                            The compiler runs pure, offline rules over the extracted text. If anything is torn, truncated, or
                            inconsistent, the medicine is halted with a ready-to-copy pharmacist question — never scheduled on a guess.
                        </p>
                    </div>
                    <div className="border-l-4 border-[var(--ink)] pl-4">
                        <h3 className="f-data text-[13px] font-bold uppercase tracking-wider text-[var(--ink-2)] mb-1">Colour is never the only signal</h3>
                        <p className="text-[14px] leading-relaxed">
                            Each time-of-day period carries a distinct shape + pattern (sunrise hatch, noon dot matrix, evening crosshatch, bedtime ring)
                            plus semantic colour, so the ring stays legible in greyscale or high contrast.
                        </p>
                    </div>
                    <div className="border-l-4 border-[var(--ink)] pl-4">
                        <h3 className="f-data text-[13px] font-bold uppercase tracking-wider text-[var(--ink-2)] mb-1">Built for the whole care team</h3>
                        <p className="text-[14px] leading-relaxed">
                            Source prescription → 24-hour ring → clinical detail, bidirectionally traced. Calm mode, high contrast,
                            elder large-type, read-aloud, and a one-page fridge sheet for caregivers.
                        </p>
                    </div>
                </div>
                <div className="mt-8 border-t-2 border-[var(--ink)] pt-4">
                    <p className="f-data text-[11px] uppercase tracking-wider text-[var(--ink-2)]">Demo fixtures · fictional patients · not medical advice</p>
                </div>
            </div>
        </dialog>
    );
}
