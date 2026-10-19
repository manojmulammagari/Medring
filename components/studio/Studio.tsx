'use client';

import { useEffect, useMemo, useState } from 'react';
import { Camera, Eye, HelpCircle, Printer, Volume2, VolumeX, X } from 'lucide-react';
import { CLINICAL_FIXTURES, getFixture, type ClinicalFixture } from '@/data/clinical-fixtures';
import { compileDocument } from '@/lib/ums-compiler';
import type { ExtractedDocument, UmsSlot } from '@/types/ums';
import { LANGS, describeDose, describeMedication, langConfig, slotName, ui, type Lang } from '@/lib/phrasebook';
import { buildSequence, entriesForSlot, initialCalmSlot, shiftCalmSlot, stepSelection, styleMap, type Selection } from '@/lib/ui-model';
import { hasVoiceFor, speak, speechSupported, stopSpeaking } from '@/lib/speech';
import { useHudHotkeys, usePersistentState } from '@/hooks/useHud';
import { SourcePane } from '@/components/studio/SourcePane';
import { DetailPanel, PharmacistTray } from '@/components/studio/DetailPanel';
import { ScanModal } from '@/components/studio/ScanModal';
import { DayRing, RingLegend } from '@/components/ring/DayRing';
import { CalmCard } from '@/components/calm/CalmCard';
import { AccessibilityHud } from '@/components/hud/AccessibilityHud';
import { FridgeSheet } from '@/components/print/FridgeSheet';
import { WhyMedRingModal } from '@/components/judge/WhyMedRingModal';
import { PrintPreviewModal } from '@/components/print/PrintPreviewModal';

type PresetId = ClinicalFixture['id'] | 'live';
const PRESET_IDS = ['preset-1', 'preset-2', 'preset-3'] as const;

export default function Studio() {
    const [presetId, setPresetId] = useState<PresetId>('preset-1');
    const [liveDoc, setLiveDoc] = useState<ExtractedDocument | null>(null);
    const [selection, setSelection] = useState<Selection | null>(null);
    const [hoverLineId, setHoverLineId] = useState<string | null>(null);
    const [calm, setCalm] = useState(false);
    const [calmSlot, setCalmSlot] = useState<UmsSlot | null>(null);
    const [contrast, setContrast] = usePersistentState('medring.contrast', false);
    const [elder, setElder] = usePersistentState('medring.elder', false);
    const [lang, setLang] = usePersistentState<Lang>('medring.lang', 'en');
    const [scanOpen, setScanOpen] = useState(false);
    const [speaking, setSpeaking] = useState(false);
    const [speechNote, setSpeechNote] = useState('');
    const [generatedAt, setGeneratedAt] = useState('');
    const [showWhy, setShowWhy] = useState(false);
    const [printPreviewOpen, setPrintPreviewOpen] = useState(false);

    const doc = presetId === 'live' ? liveDoc : (getFixture(presetId)?.document ?? null);
    const result = useMemo(() => (doc ? compileDocument(doc) : null), [doc]);
    const schedule = result?.status === 'OK' ? result.schedule : null;
    const glyphs = useMemo(() => (schedule ? styleMap(schedule) : new Map()), [schedule]);
    const sequence = useMemo(() => (schedule ? buildSequence(schedule) : []), [schedule]);
    const medsById = useMemo(() => new Map((schedule?.medications ?? []).map((m) => [m.lineId, m] as const)), [schedule]);

    const activeLineId = hoverLineId ?? selection?.lineId ?? null;
    const detailMed = (selection?.lineId ?? hoverLineId) ? (medsById.get((selection?.lineId ?? hoverLineId) as string) ?? null) : null;

    // Environment sync
    useEffect(() => {
        document.documentElement.dataset.contrast = contrast ? 'high' : 'normal';
    }, [contrast]);
    useEffect(() => {
        document.documentElement.dataset.elder = elder ? 'true' : 'false';
    }, [elder]);
    useEffect(() => {
        document.documentElement.lang = lang;
    }, [lang]);
    useEffect(() => {
        setGeneratedAt(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }));
        try {
            if (window.localStorage.getItem('medring.contrast') === null && window.matchMedia('(prefers-contrast: more)').matches) setContrast(true);
        } catch {
            /* storage or matchMedia unavailable */
        }
        return () => stopSpeaking();
    }, [setContrast]);

    // New document → pre-select first dose so grounding is visible on first paint
    useEffect(() => {
        stopSpeaking();
        setSpeaking(false);
        setHoverLineId(null);
        setSelection(sequence[0] ?? null);
    }, [sequence]);

    useEffect(() => {
        if (calm && schedule) setCalmSlot(initialCalmSlot(schedule, new Date().getHours()));
    }, [calm, schedule]);

    /* ───── actions ───── */
    const stopTalking = (): void => {
        stopSpeaking();
        setSpeaking(false);
    };
    const choosePreset = (id: PresetId): void => {
        setPresetId(id);
        setCalm(false);
    };
    const toggleCalm = (): void => {
        stopTalking();
        setCalm((c) => !c);
    };
    const toggleElder = (): void => setElder((e) => !e);
    const step = (dir: 1 | -1): void => {
        if (!schedule) return;
        if (calm) setCalmSlot((s) => shiftCalmSlot(schedule, s, dir));
        else setSelection((cur) => stepSelection(sequence, cur, dir));
    };
    const nextLang = (): Lang => LANGS[(LANGS.findIndex((x) => x.id === lang) + 1) % LANGS.length].id;
    const cycleLang = (next?: Lang): void => {
        stopTalking();
        setLang(next ?? nextLang());
    };
    const print = (): void => {
        if (schedule) window.print();
    };
    const openPrintPreview = (): void => setPrintPreviewOpen(true);
    const pickLine = (lineId: string): void => setSelection(sequence.find((s) => s.lineId === lineId) ?? { lineId, slot: null });

    const buildSpeech = (): string => {
        if (!schedule) return '';
        const T = ui(lang);
        if (calm && calmSlot) {
            const items = entriesForSlot(schedule, calmSlot).map(
                ({ med, dose }) => `${[med.drugName, med.strength].filter(Boolean).join(' ')}: ${describeDose(med, dose, lang)}.`,
            );
            return `${T.rightNow}: ${slotName(calmSlot, lang)}. ${items.join(' ')}`;
        }
        const id = selection?.lineId ?? hoverLineId;
        const med = id ? medsById.get(id) : undefined;
        return med ? describeMedication(med, lang) : schedule.medications.map((m) => describeMedication(m, lang)).join(' ');
    };

    const speakNow = (): void => {
        if (speaking) return stopTalking();
        const cfg = langConfig(lang);
        if (!speechSupported()) return setSpeechNote('Read-aloud is not supported in this browser. The text is on screen.');
        if (hasVoiceFor(cfg.speech) === false) return setSpeechNote(`No ${cfg.label} voice is installed on this device. The text is on screen.`);
        const text = buildSpeech();
        if (!text) return;
        setSpeechNote('');
        setSpeaking(true);
        speak(text, cfg.speech, () => setSpeaking(false));
    };

    useHudHotkeys(
        {
            onCalm: toggleCalm,
            onContrast: () => setContrast((c) => !c),
            onElder: toggleElder,
            onSpeak: speakNow,
            onPrev: () => step(-1),
            onNext: () => step(1),
            onPreset: (n) => choosePreset(PRESET_IDS[n - 1] as PresetId),
            onPrint: print,
            onLang: cycleLang,
            onScan: () => setScanOpen(true),
            onEscape: stopTalking,
        },
        !scanOpen,
    );

    const description = presetId === 'live' ? 'Live scan result, compiled by the same deterministic rules as the presets.' : (getFixture(presetId)?.description ?? '');
    const presetBtn = 'tactile mr-preset-btn';

    return (
        <div className="mr-page">
            <div className="print:hidden">
                <a href="#schedule" className="tactile sr-only px-3 py-2 focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50">
                    Skip to schedule
                </a>

                {/* ── Compact Top Instrument Deck (2 rows, static, never overlaps bento) ── */}
                <header className="py-2.5 px-4 bg-white border border-stone-200 rounded-2xl mb-2.5 shadow-xs">
                    {/* Row 1: Brand + Presets */}
                    <div className="mr-topbar-row row-1 flex items-center gap-3 px-0 py-0">
                        <div className="flex items-center gap-2">
                            <div className="mr-pulse"><span className="mr-pulse-dot" aria-hidden /></div>
                            <div>
                                <h1 className="f-display text-[24px] font-serif font-bold tracking-tight text-[var(--ink)]">MedRing</h1>
                                <p className="mr-brand-tag hidden xl:block text-[10px] text-stone-500 uppercase tracking-wider">Prescriptions and discharge sheets, restated as one day.</p>
                            </div>
                        </div>
                        <span className="hidden xl:inline-block w-px h-4 bg-[var(--ink-2)] mx-3" />
                        <span className="hidden xl:inline f-data text-[9px] font-semibold uppercase tracking-wider text-stone-400">Zero-Hallucination Parser</span>

                        <div className="flex-1 max-w-[560px] mx-2">
                            <div role="radiogroup" aria-label="Demo presets" className="inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-stone-100 border border-stone-200 shadow-sm">
                                {PRESET_IDS.map((id, i) => {
                                    const f = getFixture(id)!;
                                    const active = presetId === id;
                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            onClick={() => choosePreset(id)}
                                            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors border ${
                                                active
                                                    ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                                                    : 'text-stone-600 border-transparent hover:bg-white/80 hover:border-stone-300'
                                            }`}
                                        >
                                            <span className="mr-1">{i + 1}</span>
                                            {f.shortLabel}
                                        </button>
                                    );
                                })}
                                {liveDoc && (
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={presetId === 'live'}
                                        onClick={() => choosePreset('live')}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors border ${
                                            presetId === 'live'
                                                ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                                                : 'text-stone-600 border-transparent hover:bg-white/80 hover:border-stone-300'
                                        }`}
                                    >
                                        Your scan
                                    </button>
                                )}
                                <button type="button" onClick={() => setScanOpen(true)} className="px-2.5 py-1 rounded-lg text-[10px] font-medium border border-stone-300 text-stone-600 bg-white/80 hover:bg-stone-200 transition-colors">
                                    + Scan Rx <span className="mr-kbd">S</span>
                                </button>
                                <button type="button" onClick={() => setShowWhy(true)} className="px-2.5 py-1 rounded-lg text-[10px] font-medium border border-stone-300 text-stone-600 bg-white/80 hover:bg-stone-200 transition-colors underline underline-offset-1">
                                    Walkthrough Tour <span className="mr-kbd">?</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Row 2: Accessibility + Actions */}
                    <div className="mr-topbar-row row-2 bg-stone-50/60 border border-stone-200/80 rounded-xl px-3 py-2 mt-3">
                        <AccessibilityHud
                            calm={calm}
                            contrast={contrast}
                            elder={elder}
                            speaking={speaking}
                            lang={lang}
                            status={speaking ? 'Reading aloud…' : speechNote}
                            canPrint={!!schedule}
                            onCalm={toggleCalm}
                            onContrast={() => setContrast((c) => !c)}
                            onElder={toggleElder}
                            onSpeak={speakNow}
                            onLang={cycleLang}
                            onPrint={print}
                            onScan={() => setScanOpen(true)}
                            onPrintPreview={openPrintPreview}
                        />
                    </div>
                </header>

                <main id="schedule" className="mr-shell">
                    {!calm && schedule && (
                        <section className="grid grid-cols-6 gap-2 py-2 px-3 mb-3">
                            <div className="bg-white border border-stone-200/90 rounded-xl shadow-xs h-14 flex flex-col justify-center p-2">
                                <dt className="text-[9px] font-mono font-bold uppercase tracking-wider text-stone-400">Reading Load</dt>
                                <dd className="text-stone-900 font-bold text-xs leading-tight">{schedule.telemetry.wordsBefore} → {schedule.telemetry.wordsAfterPlain}</dd>
                                <span className="bg-amber-100 text-amber-900 font-bold text-[9px] px-1.5 py-0.5 rounded">−{schedule.telemetry.reductionPlainPct}%</span>
                            </div>
                            <div className="bg-white border border-stone-200/90 rounded-xl shadow-xs h-14 flex flex-col justify-center p-2">
                                <dt className="text-[9px] font-mono font-bold uppercase tracking-wider text-stone-400">Grade</dt>
                                <dd className="text-stone-900 font-bold text-xs leading-tight">{schedule.telemetry.fkGradeBefore} → {schedule.telemetry.fkGradeAfter}</dd>
                            </div>
                            <div className="bg-white border border-stone-200/90 rounded-xl shadow-xs h-14 flex flex-col justify-center p-2">
                                <dt className="text-[9px] font-mono font-bold uppercase tracking-wider text-stone-400">Decisions</dt>
                                <dd className="text-stone-900 font-bold text-xs leading-tight">{schedule.telemetry.decisionPointsBefore} → {schedule.telemetry.decisionPointsAfter}</dd>
                                <span className="bg-amber-100 text-amber-900 font-bold text-[9px] px-1.5 py-0.5 rounded">−87%</span>
                            </div>
                            <div className="bg-white border border-stone-200/90 rounded-xl shadow-xs h-14 flex flex-col justify-center p-2">
                                <dt className="text-[9px] font-mono font-bold uppercase tracking-wider text-stone-400">Fasting</dt>
                                <dd className="text-stone-900 font-bold text-xs leading-tight">{schedule.telemetry.fastingRules} {schedule.telemetry.fastingRules === 1 ? 'rule' : 'rules'}</dd>
                            </div>
                            <div className="bg-white border border-stone-200/90 rounded-xl shadow-xs h-14 flex flex-col justify-center p-2">
                                <dt className="text-[9px] font-mono font-bold uppercase tracking-wider text-stone-400">Tokens</dt>
                                <dd className="text-stone-900 font-bold text-xs leading-tight">{schedule.telemetry.visualTokens} doses</dd>
                            </div>
                            <div className="bg-white border border-stone-200/90 rounded-xl shadow-xs h-14 flex flex-col justify-center p-2">
                                <dt className="text-[9px] font-mono font-bold uppercase tracking-wider text-stone-400">Guardrail</dt>
                                <dd className="text-stone-900 font-bold text-xs leading-tight">{schedule.telemetry.ambiguitiesFlagged}</dd>
                                <span className="bg-emerald-100 text-emerald-900 font-bold text-[9px] px-1.5 py-0.5 rounded">hallucinations</span>
                            </div>
                        </section>
                    )}
                    {result?.status === 'INVALID_DOCUMENT' ? (
                        <section className="mr-card mr-empty">
                            <h2 className="f-display mr-empty-title">This does not look like a medication document</h2>
                            <p className="mr-empty-text">
                                MedRing will not guess. Try a clearer, closer photo of the label or sheet, or open a demo preset.
                            </p>
                            <div className="mr-preset-row">
                                <button type="button" className={presetBtn} onClick={() => setScanOpen(true)}>
                                    Scan again
                                </button>
                                <button type="button" className={presetBtn} onClick={() => choosePreset('preset-1')}>
                                    Open preset 1
                                </button>
                            </div>
                        </section>
                    ) : calm && schedule ? (
                        <CalmCard
                            schedule={schedule}
                            glyphs={glyphs}
                            lang={lang}
                            slot={calmSlot}
                            speaking={speaking}
                            onShift={step}
                            onSpeak={speakNow}
                            onExit={toggleCalm}
                            onLang={cycleLang}
                        />
                    ) : schedule && doc ? (
                        <div className="mr-bento grid grid-cols-1 lg:grid-cols-12 gap-5 max-w-[1480px] mx-auto px-5">
                            {/* Left Column (4 cols): SOURCE PRESCRIPTION */}
                            <section className="lg:col-span-4 mr-bento-card" aria-label="Step 1 · Source prescription">
                                <div className="border-b border-stone-200 bg-amber-50/60 px-4 py-3 flex items-center justify-between">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-mono font-semibold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap">
                                        STEP 1 · SOURCE PRESCRIPTION
                                    </span>
                                    <span className="f-data text-[10px] text-stone-500 uppercase tracking-wider">verbatim</span>
                                </div>
                                <div className="p-4">
                                    <p className="mr-note mb-3">{description}</p>
                                    <SourcePane
                                        rawText={doc.rawText}
                                        kind={doc.kind}
                                        medications={schedule.medications}
                                        lang={lang}
                                        activeLineId={activeLineId}
                                        onHoverLine={setHoverLineId}
                                        onPickLine={pickLine}
                                    />
                                </div>
                            </section>

                            {/* Center Stage (5 cols): 24-HOUR DAY RING */}
                            <section className="lg:col-span-5 mr-bento-card" aria-label="Step 2 · 24-hour day ring">
                                <div className="border-b border-stone-200 bg-sky-50/60 px-4 py-3 flex items-center justify-between">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-mono font-semibold uppercase tracking-wider bg-sky-100 text-sky-900 border border-sky-300 whitespace-nowrap">
                                        STEP 2 · 24-HOUR DAY RING
                                    </span>
                                    <span className="f-data text-[10px] text-stone-500 uppercase tracking-wider">hero</span>
                                </div>
                                <div className="p-4 flex flex-col min-h-0">
                                    <DayRing
                                        schedule={schedule}
                                        glyphs={glyphs}
                                        activeLineId={activeLineId}
                                        lang={lang}
                                        onSelect={setSelection}
                                        onHover={setHoverLineId}
                                    />
                                    <RingLegend />
                                </div>
                            </section>

                            {/* Right Column (3 cols): CLINICAL DETAIL */}
                            <section className="lg:col-span-3 mr-bento-card sticky lg:top-4" aria-label="Step 3 · Clinical detail">
                                <div className="border-b border-stone-200 bg-indigo-50/60 px-4 py-3 flex items-center justify-between">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-mono font-semibold uppercase tracking-wider bg-indigo-100 text-indigo-900 border border-indigo-300 whitespace-nowrap">
                                        STEP 3 · CLINICAL DETAIL
                                    </span>
                                    <span className="f-data text-[10px] text-stone-500 uppercase tracking-wider">inspector</span>
                                </div>
                                <div className="p-4 overflow-y-auto min-h-0">
                                    <PharmacistTray meds={schedule.medications} activeLineId={activeLineId} lang={lang} onPick={pickLine} />
                                    <DetailPanel med={detailMed} lang={lang} speaking={speaking} onSpeak={speakNow} />
                                </div>
                            </section>
                        </div>
                    ) : null}
                </main>

            </div>

            <ScanModal
                open={scanOpen}
                onClose={() => setScanOpen(false)}
                onResult={(d) => {
                    setLiveDoc(d);
                    choosePreset('live');
                    setScanOpen(false);
                }}
                onFallback={() => {
                    choosePreset('preset-3');
                    setScanOpen(false);
                }}
            />

            {showWhy && <WhyMedRingModal open={showWhy} onClose={() => setShowWhy(false)} />}
            {printPreviewOpen && schedule && (
                <PrintPreviewModal open={printPreviewOpen} onClose={() => setPrintPreviewOpen(false)} schedule={schedule} glyphs={glyphs} lang={lang} generatedAt={generatedAt} />
            )}

            {schedule && <FridgeSheet schedule={schedule} glyphs={glyphs} lang={lang} generatedAt={generatedAt} />}
        </div>
    );
}
