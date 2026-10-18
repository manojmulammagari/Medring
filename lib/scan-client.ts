// lib/scan-client.ts: browser-side helpers for the scan modal.
import type { ParseLabelResponse } from '@/types/api';

export async function scanBlob(blob: Blob, signal?: AbortSignal): Promise<ParseLabelResponse> {
    const body = new FormData();
    body.append('image', blob, 'label.png');
    try {
        const res = await fetch('/api/parse-label', { method: 'POST', body, signal });
        return (await res.json()) as ParseLabelResponse;
    } catch {
        return { ok: false, code: 'MODEL_ERROR', message: 'Could not reach the scan service. Check your connection and try again.' };
    }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}

/** Draws a clean pharmacy label to a PNG so judges without a pill bottle can exercise live vision in one click. */
export async function renderSampleBottlePng(): Promise<Blob> {
    const W = 1200;
    const H = 800;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('Canvas is unavailable');

    g.fillStyle = '#D9D2C3';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#B8731A';
    roundRect(g, 120, 60, 960, 680, 40);
    g.fill();
    g.fillStyle = '#FFFFFF';
    roundRect(g, 200, 130, 800, 540, 14);
    g.fill();
    g.strokeStyle = '#111111';
    g.lineWidth = 3;
    g.stroke();

    g.fillStyle = '#111111';
    const lines: Array<[string, number, number]> = [
        ['GREENFIELD PHARMACY      Rx 8814207', 36, 200],
        ['M. IYER   QTY 60   DR. L. OKAFOR', 32, 255],
        ['METFORMIN HCL 500 MG TABLET', 44, 360],
        ['TAKE 1 TABLET BY MOUTH TWICE DAILY', 40, 440],
        ['TAKE WITH FOOD', 40, 510],
        ['REFILLS: 2', 30, 600],
    ];
    for (const [text, size, y] of lines) {
        g.font = `700 ${size}px "Courier New", monospace`;
        g.fillText(text, 240, y);
    }
    return new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))), 'image/png'),
    );
}