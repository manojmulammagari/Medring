// app/api/parse-label/route.ts
// POST multipart/form-data { image } → ParseLabelResponse (types/api.ts).
// Stateless: the image is held in memory for the request only, never stored or logged.
// Body ceiling is 4 MB (Vercel serverless limit ~4.5 MB); the Stage 2 ScanModal uploads originals, so large
// phone photos return IMAGE_TOO_LARGE. Add client-side downscaling if that proves common.
// Env: GEMINI_API_KEY (or GOOGLE_API_KEY), optional GEMINI_MODEL, GEMINI_FALLBACK_MODEL.

import { NextResponse } from 'next/server';
import type { ParseLabelErrorCode, ParseLabelResponse } from '@/types/api';
import { MAX_IMAGE_BYTES, ParseLabelError, extractDocument, sniffImageMime } from '@/lib/gemini-extract';

export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']);

const STATUS: Record<ParseLabelErrorCode, number> = {
    NO_API_KEY: 503,
    INVALID_IMAGE: 400,
    IMAGE_TOO_LARGE: 413,
    MODEL_ERROR: 502,
    BAD_MODEL_OUTPUT: 502,
    RATE_LIMITED: 429,
};

function fail(code: ParseLabelErrorCode, message: string): NextResponse<ParseLabelResponse> {
    return NextResponse.json<ParseLabelResponse>({ ok: false, code, message }, { status: STATUS[code], headers: NO_STORE });
}

// Best-effort per-IP limiter. In-memory, so each serverless instance counts separately; it only blunts abuse.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;
const hits = new Map<string, number[]>();

function limited(key: string, now = Date.now()): boolean {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_PER_WINDOW) {
        hits.set(key, recent);
        return true;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5_000) {
        for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
    return false;
}

const clientKey = (req: Request): string =>
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';

export async function POST(req: Request): Promise<NextResponse<ParseLabelResponse>> {
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
    if (!apiKey) return fail('NO_API_KEY', 'Live AI is not configured on this deployment. Use a demo preset.');

    if (limited(clientKey(req))) return fail('RATE_LIMITED', 'Too many scans in a minute. Wait a moment and try again.');

    const declared = Number(req.headers.get('content-length') ?? 0);
    if (declared > MAX_IMAGE_BYTES + 64 * 1024) {
        return fail('IMAGE_TOO_LARGE', 'That image is larger than 4 MB. Use a smaller photo or a screenshot.');
    }

    let entry: FormDataEntryValue | null;
    try {
        entry = (await req.formData()).get('image');
    } catch {
        return fail('INVALID_IMAGE', 'Upload an image file.');
    }
    if (!entry || typeof entry === 'string') return fail('INVALID_IMAGE', 'Upload an image file.');
    if (entry.size === 0) return fail('INVALID_IMAGE', 'That file is empty.');
    if (entry.size > MAX_IMAGE_BYTES) return fail('IMAGE_TOO_LARGE', 'That image is larger than 4 MB. Use a smaller photo or a screenshot.');

    const bytes = new Uint8Array(await entry.arrayBuffer());
    const mimeType = sniffImageMime(bytes);
    if (!mimeType || !ALLOWED_MIME.has(mimeType)) {
        return fail('INVALID_IMAGE', 'Unsupported image type. Use PNG, JPEG, WebP or HEIC.');
    }

    try {
        const document = await extractDocument({ mimeType, base64: Buffer.from(bytes).toString('base64') }, { apiKey });
        return NextResponse.json<ParseLabelResponse>({ ok: true, document }, { headers: NO_STORE });
    } catch (e) {
        const err = e instanceof ParseLabelError ? e : new ParseLabelError('MODEL_ERROR', 'Unexpected error. Try again.');
        console.error('[parse-label]', err.code);
        return fail(err.code, err.message);
    }
}

/** Deploy check: GET /api/parse-label → { ok: true, configured: boolean }. */
export function GET(): NextResponse {
    return NextResponse.json(
        { ok: true, configured: Boolean(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY) },
        { headers: NO_STORE },
    );
}