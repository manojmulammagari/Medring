import type { Telemetry } from '@/types/ums';

const delta = (p: number): string => (p >= 0 ? `−${p}%` : `+${Math.abs(p)}%`);

function Metric({ k, children, brand = false }: { k: string; children: React.ReactNode; brand?: boolean }) {
    return (
        <div className={brand ? 'mr-metric mr-metric-brand' : 'mr-metric'}>
            <dt>{k}</dt>
            <dd>{children}</dd>
        </div>
    );
}

/**
 * One-row executive status bar: 46px tall, dark, horizontally scrollable only if a reader narrows the window.
 * Every number comes from compileDocument(); nothing here is hard-coded.
 */
export function TelemetryBar({ telemetry: t }: { telemetry: Telemetry }) {
    return (
        <footer className="mr-telemetry" aria-label="Live measurements">
            <div className="mr-telemetry-row">
                <dl className="mr-telemetry-stats">
                    <Metric k="Measured" brand>
                        <span className="f-data">live · this document</span>
                    </Metric>
                    <Metric k="Reading load">
                        {t.wordsBefore} → {t.wordsAfterPlain} <b>{delta(t.reductionPlainPct)}</b> · ring {t.wordsAfterRing} <b>{delta(t.reductionRingPct)}</b>
                    </Metric>
                    <Metric k="Grade">
                        {t.fkGradeBefore} → {t.fkGradeAfter}
                    </Metric>
                    <Metric k="Decisions">
                        {t.decisionPointsBefore} → {t.decisionPointsAfter}
                    </Metric>
                    <Metric k="Fasting">
                        {t.fastingRules} {t.fastingRules === 1 ? 'rule' : 'rules'}
                    </Metric>
                    <Metric k="Tokens">{t.visualTokens}</Metric>
                    <Metric k="Guardrail">
                        {t.ambiguitiesFlagged} flagged
                    </Metric>
                </dl>

                <details className="mr-telemetry-more">
                    <summary aria-label="How these numbers are computed">How?</summary>
                    <p>
                        Words = tokens containing a letter or digit. &quot;Plain&quot; = words in the plain-language schedule shown and read aloud. &quot;On ring&quot; = drug
                        name, strength and one quantity label per token (axis labels excluded). Flesch-Kincaid = 0.39·words/sentences + 11.8·syllables/words − 15.59, table
                        rows counted as sentences, floored at 0. Decision points are a proxy: non-empty instruction fields to reconcile before; distinct time/food groups +
                        as-needed items + pharmacist chips after. Not a validated clinical measure.
                    </p>
                </details>
            </div>
        </footer>
    );
}
