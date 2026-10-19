'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, FileText, Image, Loader2, Sparkles, Upload, X } from 'lucide-react';
import type { ExtractedDocument } from '@/types/ums';
import type { ParseLabelErrorCode } from '@/types/api';
import { renderSampleBottlePng, scanBlob } from '@/lib/scan-client';
import { parseRxText, REAL_WORLD_SAMPLES } from '@/lib/text-parser';

interface Props {
    open: boolean;
    onClose(): void;
    onResult(doc: ExtractedDocument): void;
    onFallback(): void;
}

const ACCEPT = 'image/*,.txt,.pdf';

function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(typeof r.result === 'string' ? r.result : String(r.result ?? ''));
        r.onerror = () => reject(r.error);
        r.readAsText(file);
    });
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(typeof r.result === 'string' ? r.result : String(r.result ?? ''));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
    });
}

export function ScanModal({ open, onClose, onResult, onFallback }: Props) {
    const ref = useRef<HTMLDialogElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<{ code: ParseLabelErrorCode; message: string } | null>(null);
    const [source, setSource] = useState<'upload' | 'text'>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [extractedText, setExtractedText] = useState('');

    useEffect(() => {
        const d = ref.current;
        if (!d) return;
        if (open && !d.open) {
            setError(null);
            setBusy(false);
            setFile(null);
            setImagePreview(null);
            setExtractedText('');
            setSource('upload');
            d.showModal();
        }
        if (!open && d.open) d.close();
    }, [open]);

    async function run(getBlob: () => Promise<Blob>): Promise<void> {
        setBusy(true);
        setError(null);
        try {
            const res = await scanBlob(await getBlob());
            if (res.ok) onResult(res.document);
            else setError({ code: res.code, message: res.message });
        } catch {
            setError({ code: 'INVALID_IMAGE', message: 'Could not prepare that image. Try another one.' });
        } finally {
            setBusy(false);
        }
    }

    function handleFile(f: File): void {
        setFile(f);
        setError(null);
        const name = f.name.toLowerCase();
        if (name.endsWith('.txt')) {
            void readFileAsText(f).then((t) => {
                setExtractedText(t);
                setSource('text');
            });
        } else if (name.endsWith('.pdf')) {
            setExtractedText(
                'PDF text extraction is not available client-side. Please paste the prescription text below, or upload a PNG/JPG/WebP photo instead.',
            );
            setSource('text');
        } else {
            void readFileAsDataUrl(f).then((url) => {
                setImagePreview(url);
                setSource('upload');
            });
        }
    }

    const handleQuickFill = useCallback(
        (sample: { id: string; title: string; text: string }) => {
            setExtractedText(sample.text);
            setSource('text');
            setError(null);
        },
        [],
    );

    const handleRender = useCallback(() => {
        const text = extractedText.trim();
        if (!text) {
            setError({ code: 'INVALID_IMAGE', message: 'Please paste or type some prescription text first.' });
            return;
        }
        const doc = parseRxText(text);
        if (!doc.isValidMedicationDocument) {
            setError({ code: 'INVALID_IMAGE', message: 'No medication lines were detected. Try adding drug names and directions.' });
            return;
        }
        onResult(doc);
    }, [extractedText, onResult]);

    return (
        <dialog
            ref={ref}
            onClose={onClose}
            onClick={(e) => {
                if (e.target === ref.current) onClose();
            }}
            aria-labelledby="scan-title"
            className="w-[min(640px,95vw)] border-2 border-[var(--ink)] bg-[var(--paper)] p-0 text-[var(--ink)]"
        >
            <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                    <h2 id="scan-title" className="f-display text-[28px] font-semibold leading-tight">Scan a prescription</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="tactile grid h-11 w-11 place-items-center">
                        <X size={20} aria-hidden />
                    </button>
                </div>
                <p className="mt-2 text-[14px] text-[var(--ink-2)]">
                    Upload a prescription photo or paste OCR text. MedRing restates what is printed and never guesses. Demo: do not upload real patient information.
                </p>

                {/* Source tabs */}
                <div className="mt-4 flex gap-2 border-b border-stone-200/60 pb-2">
                    <button
                        type="button"
                        onClick={() => setSource('upload')}
                        className={`text-[12px] font-mono font-semibold py-1 border-b-2 ${
                            source === 'upload' ? 'border-amber-600 text-amber-900' : 'border-transparent text-stone-500 hover:text-stone-700'
                        }`}
                    >
                        <Image size={16} aria-hidden /> Upload Photo
                    </button>
                    <button
                        type="button"
                        onClick={() => setSource('text')}
                        className={`text-[12px] font-mono font-semibold py-1 border-b-2 ${
                            source === 'text' ? 'border-rose-600 text-rose-900' : 'border-transparent text-stone-500 hover:text-stone-700'
                        }`}
                    >
                        <FileText size={16} aria-hidden /> Paste or Type Text
                    </button>
                </div>

                {/* Upload tab */}
                {source === 'upload' && (
                    <div className="mt-4 space-y-3">
                        <div className="grid gap-3">
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => run(renderSampleBottlePng)}
                                className="tactile inline-flex min-h-[52px] items-center justify-center gap-2 px-4 text-[15px] font-bold"
                            >
                                {busy ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <Sparkles size={20} aria-hidden />}
                                Test with sample bottle photo
                            </button>
                            <label
                                className={`tactile inline-flex min-h-[52px] items-center justify-center gap-2 px-4 text-[15px] font-semibold ${
                                    busy ? 'pointer-events-none opacity-45' : ''
                                }`}
                            >
                                <Upload size={20} aria-hidden /> Upload photo / text file
                                <input
                                    type="file"
                                    accept={ACCEPT}
                                    capture="environment"
                                    className="sr-only"
                                    disabled={busy}
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        e.target.value = '';
                                        if (f) handleFile(f);
                                    }}
                                />
                            </label>
                        </div>

                        {imagePreview && (
                            <div className="border border-stone-200 rounded-lg p-3 bg-stone-50/60">
                                <img src={imagePreview} alt="Uploaded prescription preview" className="max-w-full max-h-[300px] rounded-md block mx-auto" />
                                <p className="mt-2 text-[12px] text-stone-500 text-center">
                                    Image preview. {file?.type.startsWith('text/') ? 'Text file detected — content loaded below.' : 'Enter the OCR text below, or type it manually if no AI key is configured.'}
                                </p>
                            </div>
                        )}

                        <div className="border border-stone-200 rounded-lg p-3 bg-stone-50/60">
                            <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-stone-500 mb-2">
                                Extracted / OCR text (edit before rendering)
                            </label>
                            <textarea
                                value={extractedText}
                                onChange={(e) => setExtractedText(e.target.value)}
                                className="w-full min-h-[120px] font-mono text-[12px] p-3 bg-[var(--paper)] border border-stone-200 rounded focus-visible:ring-2 focus-visible:ring-amber-500 outline-none"
                                placeholder="Paste OCR text or type the prescription here…"
                            />
                        </div>
                    </div>
                )}

                {/* Text tab */}
                {source === 'text' && (
                    <div className="mt-4 space-y-3">
                        <div className="border border-stone-200 rounded-lg p-3 bg-stone-50/60">
                            <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-stone-500 mb-2">
                                Prescription text
                            </label>
                            <textarea
                                value={extractedText}
                                onChange={(e) => setExtractedText(e.target.value)}
                                className="w-full min-h-[160px] font-mono text-[12px] p-3 bg-[var(--paper)] border border-stone-200 rounded focus-visible:ring-2 focus-visible:ring-amber-500 outline-none"
                                placeholder="Paste prescription text here… e.g. 'Tab. Aspirin EC 75 mg — 1 tab — 1-0-0 — AC'"
                            />
                        </div>
                    </div>
                )}

                {/* Quick-fill chips */}
                <div className="mt-4">
                    <p className="text-[11px] font-mono font-bold uppercase tracking-wider text-stone-500 mb-2">Try real-world messy formats:</p>
                    <div className="flex flex-wrap gap-2">
                        {REAL_WORLD_SAMPLES.map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                disabled={busy}
                                onClick={() => handleQuickFill(s)}
                                className="tactile text-[11px] font-mono py-1.5 px-3 rounded border border-stone-200 text-stone-700 bg-white hover:bg-stone-50 transition-colors"
                            >
                                {s.title}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Action row */}
                <div className="mt-5 flex items-center justify-between gap-3">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onFallback}
                        className="tactile inline-flex min-h-[44px] items-center gap-2 px-4 text-[14px] font-semibold"
                    >
                        Load demo preset instead
                    </button>
                    <button
                        type="button"
                        disabled={busy || extractedText.trim().length === 0}
                        onClick={handleRender}
                        className="tactile inline-flex min-h-[44px] items-center justify-center gap-2 px-5 text-[15px] font-bold bg-stone-900 text-white hover:bg-stone-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Render 24-Hour Ring
                    </button>
                </div>

                {error && (
                    <div className="mt-4 border-2 border-[var(--ink)] bg-[var(--amber)] p-3 text-[var(--amber-ink)]">
                        <p className="font-semibold">{error.code === 'NO_API_KEY' ? 'Live AI is not configured on this deployment.' : 'The scan did not complete.'}</p>
                        <p className="mt-1 text-[13px]">{error.message}</p>
                        <button type="button" onClick={onFallback} className="tactile mt-3 min-h-[44px] px-3 text-[14px] font-semibold">
                            Load Preset 3 instead
                        </button>
                    </div>
                )}
            </div>
        </dialog>
    );
}
