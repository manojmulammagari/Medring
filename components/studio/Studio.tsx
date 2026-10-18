'use client';

import { useEffect, useMemo, useState } from 'react';
import { Camera } from 'lucide-react';
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
import { TelemetryBar } from '@/components/telemetry/TelemetryBar';

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
    const [lang, setLang] = usePersistentState<Lang>('medring.lang', 'en');
    const [scanOpen, setScanOpen] = useState(false);
    const [speaking, setSpeaking] = useState(false);
    const [speechNote, setSpeechNote] = useState('');
    const [generatedAt, setGeneratedAt] = useState('');

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
    const step = (dir: 1 | -1): void => {
        if (!schedule) return;
        if (calm) setCalmSlot((s) => shiftCalmSlot(schedule, s, dir));
        else setSelection((cur) => stepSelection(sequence, cur, dir));
    };
    const cycleLang = (): void => {
        stopTalking();
        setLang((l) => LANGS[(LANGS.findIndex((x) => x.id === l) + 1) % LANGS.length]?.id ?? 'en');
    };
    const print = (): void => {
        if (schedule) window.print();
    };
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
                <a href="#schedule" className="tactile sr-only px-3 py-2 focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50">Skip to schedule</a>

                <header className="mr-topbar">
                    <div className="mr-topbar-row">
                        <div>
                            <h1 className="f-display mr-brand-title">MedRing</h1>
                            <p className="mr-brand-tag">Prescriptions and discharge sheets, restated as one day. Never guessed.</p>
                        </div>
                        <AccessibilityHud
                            calm={calm}
                            contrast={contrast}
                            speaking={speaking}
                            lang={lang}
                            status={speaking ? 'Reading aloud…' : speechNote}
                            canPrint={!!schedule}
                            onCalm={toggleCalm}
                            onContrast={() => setContrast((c) => !c)}
                            onSpeak={speakNow}
                            onLang={(l) => {
                                stopTalking();
                                setLang(l);
                            }}
                            onPrint={print}
                        />
                    </div>
                    <div className="mr-topbar-row mr-topbar-row-2">
                        <div role="radiogroup" aria-label="Demo presets" className="mr-preset-row">
                            {CLINICAL_FIXTURES.map((f, i) => (
                                <button key={f.id} type="button" role="radio" aria-checked={presetId === f.id} onClick={() => choosePreset(f.id)} className={presetBtn}>
                                    <span className="f-data mr-preset-num">{i + 1}</span>
                                    {f.shortLabel}
                                </button>
                            ))}
                            {liveDoc && (
                                <button type="button" role="radio" aria-checked={presetId === 'live'} onClick={() => choosePreset('live')} className={presetBtn}>
                                    Your scan
                                </button>
                            )}
                        </div>
                        <button type="button" onClick={() => setScanOpen(true)} className={`${presetBtn} mr-scan-btn`}>
                            <Camera size={18} aria-hidden /> Scan your own label / sheet
                            <kbd className="f-data mr-kbd">S</kbd>
                        </button>
                    </div>
                </header>

                <main id="schedule" className="mr-shell">
                    {result?.status === 'INVALID_DOCUMENT' ? (
                        <section className="mr-card mr-empty">
                            <h2 className="f-display mr-empty-title">This does not look like a medication document</h2>
                            <p className="mr-empty-text">
                                MedRing will not guess. Try a clearer, closer photo of the label or sheet, or open a demo preset.
                            </p>
                            <div className="mr-preset-row">
                                <button type="button" className={presetBtn} onClick={() => setScanOpen(true)}>Scan again</button>
                                <button type="button" className={presetBtn} onClick={() => choosePreset('preset-1')}>Open preset 1</button>
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
                        />
                    ) : schedule && doc ? (
                        <div className="mr-studio-grid">
                            <section aria-label="Source prescription" className="mr-col">
                                <p className="mr-col-eyebrow" data-step="1">Source prescription</p>
                                <p className="mr-note">{description}</p>
                                <SourcePane
                                    rawText={doc.rawText}
                                    kind={doc.kind}
                                    medications={schedule.medications}
                                    activeLineId={activeLineId}
                                    onHoverLine={setHoverLineId}
                                    onPickLine={pickLine}
                                />
                            </section>

                            <section aria-label="24-hour day ring" className="mr-col">
                                <p className="mr-col-eyebrow" data-step="2">24-hour day ring</p>
                                <DayRing
                                    schedule={schedule}
                                    glyphs={glyphs}
                                    activeLineId={activeLineId}
                                    onSelect={setSelection}
                                    onHover={setHoverLineId}
                                    lang={lang}
                                />
                                <RingLegend />
                            </section>

                            <section aria-label="Clinical detail and pharmacist tray" className="mr-col">
                                <p className="mr-col-eyebrow" data-step="3">Clinical detail</p>
                                <PharmacistTray meds={schedule.medications} activeLineId={activeLineId} lang={lang} onPick={pickLine} />
                                <DetailPanel med={detailMed} lang={lang} speaking={speaking} onSpeak={speakNow} />
                            </section>
                        </div>
                    ) : null}
                </main>


                {!calm && schedule && <TelemetryBar telemetry={schedule.telemetry} />}

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
            </div>

            {schedule && <FridgeSheet schedule={schedule} glyphs={glyphs} lang={lang} generatedAt={generatedAt} />}
        </div>
    );
}