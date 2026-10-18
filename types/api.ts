// types/api.ts: contract between ScanModal (Stage 2) and /api/parse-label (Stage 3).
import type { ExtractedDocument } from '@/types/ums';

export type ParseLabelErrorCode =
    | 'NO_API_KEY'
    | 'INVALID_IMAGE'
    | 'IMAGE_TOO_LARGE'
    | 'MODEL_ERROR'
    | 'BAD_MODEL_OUTPUT'
    | 'RATE_LIMITED';

/** Request: multipart/form-data, field "image". A non-medication image returns ok:true with isValidMedicationDocument:false. */
export type ParseLabelResponse =
    | { ok: true; document: ExtractedDocument }
    | { ok: false; code: ParseLabelErrorCode; message: string };