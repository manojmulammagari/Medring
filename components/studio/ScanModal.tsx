'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Sparkles, Upload, X } from 'lucide-react';
import type { ExtractedDocument } from '@/types/ums';
import type { ParseLabelErrorCode } from '@/types/api';
import { renderSampleBottlePng, scanBlob } from '@/lib/scan-client';

interface Props {
    open: boolean;
    onClose(): void;
    onResult(doc: ExtractedDocument): void;
    onFallback(): void;
}

export function ScanModal({ open, onClose, onResult, onFallback }: Props) {
    const ref = useRef<HTMLDialogElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<{ code: ParseLabelErrorCode; message: string } | null>(null);

    useEffect(() => {
        const d = ref.current;
        if (!d) return;
        if (open && !d.open) {
            setError(null);
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

    return (
        <dialog
            ref={ref}
            onClose={onClose}
            onClick={(e) => {
                if (e.target === ref.current) onClose();
            }}
            aria-labelledby="scan-title"
            className="w-[min(560px,94vw)] border-2 border-[var(--ink)] bg-[var(--paper)] p-0 text-[var(--ink)]"
        >
            <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                    <h2 id="scan-title" className="f-display text-[28px] font-semibold leading-tight">Scan a label or discharge sheet</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="tactile grid h-11 w-11 place-items-center"><X size={20} aria-hidden /></button>
                </div>
                <p className="mt-2 text-[15px] text-[var(--ink-2)]">
                    The image is read for text only. MedRing restates what is printed and sends anything unclear to your pharmacist. Demo: do not upload real patient information.
                </p>

                <div className="mt-5 grid gap-3">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(renderSampleBottlePng)}
                        className="tactile inline-flex min-h-[52px] items-center justify-center gap-2 px-4 text-[16px] font-bold"
                    >
                        {busy ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <Sparkles size={20} aria-hidden />}
                        Test live AI with sample bottle photo
                    </button>

                    <label className={`tactile inline-flex min-h-[52px] items-center justify-center gap-2 px-4 text-[16px] font-semibold ${busy ? 'pointer-events-none opacity-45' : ''}`}>
                        <Upload size={20} aria-hidden /> Upload a photo or screenshot
                        <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="sr-only"
                            disabled={busy}
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (file) void run(async () => file);
                            }}
                        />
                    </label>
                </div>

                <div role="status" aria-live="polite" className="mt-4 min-h-[24px] text-[15px]">
                    {busy && <span className="inline-flex items-center gap-2"><Camera size={18} aria-hidden /> Reading the label…</span>}
                    {error && (
                        <div className="border-2 border-[var(--ink)] bg-[var(--amber)] p-3 text-[var(--amber-ink)]">
                            <p className="font-semibold">
                                {error.code === 'NO_API_KEY' ? 'Live AI is not configured on this deployment.' : 'The scan did not complete.'}
                            </p>
                            <p className="mt-1 text-[14px]">{error.message}</p>
                            <button type="button" onClick={onFallback} className="tactile mt-3 min-h-[44px] px-3 text-[14px] font-semibold">Load Preset 3 instead</button>
                        </div>
                    )}
                </div>
            </div>
        </dialog>
    );
}