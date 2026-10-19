'use client';

import { useMemo } from 'react';
import type { CompiledMedication, DocumentKind } from '@/types/ums';
import { slotName, ui, type Lang } from '@/lib/phrasebook';

const KIND_LABEL: Record<DocumentKind, string> = {
    DISCHARGE_TABLE: 'Discharge table',
    MEDICATION_LIST: 'Medication list',
    BOTTLE_LABEL: 'Bottle label',
    HANDWRITTEN_RX: 'Handwritten prescription',
    OTHER: 'Document',
};

function extractPatientLine(rawText: string): string | null {
    const lines = rawText.split('\n');
    for (const line of lines) {
        if (/Patient:/i.test(line)) {
            return line.replace(/Patient:/i, '').trim();
        }
    }
    return null;
}

function extractDiagnosisLine(rawText: string): string | null {
    const lines = rawText.split('\n');
    for (const line of lines) {
        if (/Diagnosis:/i.test(line)) {
            return line.replace(/Diagnosis:/i, '').trim();
        }
    }
    return null;
}

function extractMrn(patientLine: string | null): string | null {
    if (!patientLine) return null;
    const m = patientLine.match(/MRN:\s*(\S+)/i);
    return m ? m[1] : null;
}

function extractNameAge(patientLine: string | null): string | null {
    if (!patientLine) return null;
    const beforeMrn = patientLine.split(/MRN:/i)[0];
    const nameAge = beforeMrn.replace(/,?\s*\d+\s*[MFmf]\s*$/, '').trim();
    const agem = patientLine.match(/(\d+)\s*[MFmf]/i);
    const age = agem ? `, ${agem[1]}` : '';
    return nameAge ? `${nameAge}${age}` : null;
}

interface Props {
    rawText: string;
    kind: DocumentKind;
    medications: readonly CompiledMedication[];
    lang: Lang;
    activeLineId: string | null;
    onHoverLine(id: string | null): void;
    onPickLine(id: string): void;
}

export function SourcePane({ rawText, kind, medications, lang, activeLineId, onHoverLine, onPickLine }: Props) {
    const T = ui(lang);
    const patientLine = extractPatientLine(rawText);
    const diagnosisLine = extractDiagnosisLine(rawText);
    const patientName = extractNameAge(patientLine);
    const mrn = extractMrn(patientLine);

    const header = useMemo(() => {
        const parts: string[] = [];
        if (patientName) parts.push(patientName);
        if (mrn) parts.push(`MRN: ${mrn}`);
        if (diagnosisLine) parts.push(diagnosisLine.split(',')[0]);
        return parts.join(' · ');
    }, [patientName, mrn, diagnosisLine]);

    return (
        <div className="bg-[var(--paper)]">
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
                <span className="f-data text-[11px] font-semibold uppercase tracking-[0.14em]">{KIND_LABEL[kind]}</span>
                <span className="f-data text-[11px] text-stone-500 uppercase tracking-[0.14em]">verbatim · exact spans</span>
            </div>

            {/* Compact patient metadata bar — 2 lines max, never hides the meds */}
            {header && (
                <div className="px-4 py-2">
                    <div className="text-[11px] font-mono bg-stone-100 px-3 py-1.5 rounded-lg mb-2 text-stone-600 leading-tight">
                        {header}
                    </div>
                </div>
            )}

            {/* All medication rows — clickable verbatim rows, all visible above the fold */}
            <div className="px-4 space-y-1.5 pb-3">
                {medications.map((m) => {
                    const active = m.lineId === activeLineId;
                    const firstDose = m.doses[0];
                    const slotText = firstDose ? ` · ${slotName(firstDose.slot, lang)}` : '';
                    const foodText = firstDose?.mealRule === 'NONE_STATED'
                        ? ' · UNSTATED FOOD RULE — NEVER GUESSED'
                        : firstDose?.mealRule === 'BEFORE_FOOD'
                            ? ' · before food'
                            : firstDose?.mealRule === 'AFTER_FOOD'
                                ? ' · after food'
                                : ' · with food';
                    return (
                        <button
                            key={m.lineId}
                            type="button"
                            className={[
                                'text-xs font-mono py-2 px-2.5 rounded-lg border-l-4 transition-all cursor-pointer flex items-start gap-2',
                                'border-transparent bg-stone-50/60 text-stone-900',
                                active
                                    ? 'bg-amber-50 border-l-amber-600 font-medium text-stone-950 shadow-sm'
                                    : 'hover:bg-stone-100 hover:border-l-stone-400',
                            ].join(' ')}
                            onMouseEnter={() => onHoverLine(m.lineId)}
                            onMouseLeave={() => onHoverLine(null)}
                            onClick={() => onPickLine(m.lineId)}
                            aria-label={`Select ${[m.drugName, m.strength].filter(Boolean).join(' ')}`}
                        >
                            <span className="font-semibold leading-tight">
                                {[m.drugName, m.strength].filter(Boolean).join(' ')}
                            </span>
                            <span className="ml-2 text-[10px] text-stone-500 leading-tight">{`${m.doses.length} dose${m.doses.length !== 1 ? 's' : ''}${slotText}${foodText}`}</span>
                        </button>
                    );
                })}
                {medications.length === 0 && (
                    <p className="text-xs text-stone-500 italic py-2">No medication lines found in this document.</p>
                )}
            </div>

            {/* Full verbatim source (collapsed by default — available for inspection) */}
            <details className="px-4 pt-3 border-t border-stone-200/60">
                <summary className="cursor-pointer text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400 hover:text-stone-700">
                    Show full verbatim source
                </summary>
                <pre className="mt-2 f-data max-h-[40vh] overflow-auto whitespace-pre-wrap break-words px-3 py-3 text-[12px] leading-6 bg-stone-50/60 rounded-lg border border-stone-200">
                    {rawText}
                </pre>
            </details>
        </div>
    );
}
