'use client';

import type { Telemetry } from '@/types/ums';

const delta = (p: number): string => (p >= 0 ? `−${p}%` : `+${Math.abs(p)}%`);

export function TelemetryDock({
    telemetry: t,
    onPrint,
    onPrintPreview,
}: {
    telemetry: Telemetry;
    onPrint(): void;
    onPrintPreview(): void;
}) {
    return (
        <section
            aria-label="Clinical impact & safety telemetry"
            className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4 px-2"
        >
            <div className="bg-white border border-stone-200/90 rounded-xl shadow-xs p-2.5 flex items-center justify-between gap-2 min-h-[48px]">
                <div className="flex flex-col gap-0.5">
                    <dt className="text-[9px] font-mono font-bold uppercase tracking-wider text-stone-400">Reading load</dt>
                    <dd className="text-stone-900 font-bold text-xs">{t.wordsBefore} → {t.wordsAfterPlain}</dd>
                </div>
                <div className="flex items-center gap-1">
                    <span className="bg-amber-100 text-amber-900 font-bold text-[9px] px-1.5 py-0.5 rounded">
                        {delta(t.reductionPlainPct)}
                    </span>
                    <span className="bg-amber-100 text-amber-900 font-bold text-[9px] px-1.5 py-0.5 rounded">
                        {delta(t.reductionRingPct)}
                    </span>
                </div>
            </div>
            <div className="bg-white border border-stone-200/90 rounded-xl shadow-xs p-2.5 flex flex-col gap-1 min-h-[48px]">
                <dt className="text-[9px] font-mono font-bold uppercase tracking-wider text-stone-400">Grade</dt>
                <dd className="text-stone-900 font-bold text-xs">{t.fkGradeBefore} → {t.fkGradeAfter}</dd>
            </div>
            <div className="bg-white border border-stone-200/90 rounded-xl shadow-xs p-2.5 flex flex-col gap-1 min-h-[48px]">
                <dt className="text-[9px] font-mono font-bold uppercase tracking-wider text-stone-400">Decisions</dt>
                <dd className="text-stone-900 font-bold text-xs">{t.decisionPointsBefore} → {t.decisionPointsAfter}</dd>
                <span className="bg-amber-100 text-amber-900 font-bold text-[9px] px-1.5 py-0.5 rounded">
                    {delta(87)}
                </span>
            </div>
            <div className="bg-white border border-stone-200/90 rounded-xl shadow-xs p-2.5 flex flex-col gap-1 min-h-[48px]">
                <dt className="text-[9px] font-mono font-bold uppercase tracking-wider text-stone-400">Fasting</dt>
                <dd className="text-stone-900 font-bold text-xs">{t.fastingRules} {t.fastingRules === 1 ? 'rule' : 'rules'}</dd>
            </div>
            <div className="bg-white border border-stone-200/90 rounded-xl shadow-xs p-2.5 flex flex-col gap-1 min-h-[48px]">
                <dt className="text-[9px] font-mono font-bold uppercase tracking-wider text-stone-400">Tokens</dt>
                <dd className="text-stone-900 font-bold text-xs">{t.visualTokens}</dd>
            </div>
            <div className="bg-white border border-stone-200/90 rounded-xl shadow-xs p-2.5 flex items-center justify-between gap-2 min-h-[48px]">
                <div className="flex flex-col gap-0.5">
                    <dt className="text-[9px] font-mono font-bold uppercase tracking-wider text-stone-400">Guardrail</dt>
                    <dd className="text-stone-900 font-bold text-xs">{t.ambiguitiesFlagged === 0 ? '0' : t.ambiguitiesFlagged}</dd>
                </div>
                <span
                    className={`font-bold text-[9px] px-1.5 py-0.5 rounded ${
                        t.ambiguitiesFlagged === 0
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
                            : 'bg-amber-100 text-amber-900 border-amber-200'
                    } border`}
                >
                    {t.ambiguitiesFlagged === 0 ? 'hallucinations' : 'flagged'}
                </span>
            </div>
        </section>
    );
}
