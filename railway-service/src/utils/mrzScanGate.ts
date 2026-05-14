/** Ops KBS köprüsü: app `lib/scanner` ile aynı MRZ kayıt kuralları. */

import { Errors } from '../shared/errors/appError.js';

const MRZ_OCR_OK_MIN = 0.9;

function mrzCharsetRatio(mrz: string | null | undefined): number {
  if (!mrz) return 0;
  const t = String(mrz).replace(/\r\n/g, '\n').replace(/\n/g, '');
  if (!t.length) return 0;
  let ok = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c >= 48 && c <= 57) ok += 1;
    else if (c >= 65 && c <= 90) ok += 1;
    else if (c === 60) ok += 1;
  }
  return ok / t.length;
}

type Parsed = {
  rawMrz: string | null;
  warnings: string[];
  checksumsValid: boolean | null;
};

const SUB = {
  parse_failed: 'MRZ_PARSE_FAILED',
  checksum_invalid: 'MRZ_CHECKSUM_INVALID',
  low_confidence: 'MRZ_LOW_OCR'
} as const;

/**
 * `raw_mrz` doluysa ICAO check digit’leri zorunlu; aksi 400.
 */
export function requireValidMrzForUpsert(body: {
  parsed: Parsed;
  rawMrz?: string | null;
  ocrEngine?: string | null;
}): { mrz_checksum_valid: true; ocr_engine: string } | Record<string, never> {
  const raw = (body.parsed.rawMrz ?? body.rawMrz ?? '').trim();
  if (!raw) return {};

  const { parsed } = body;
  const hasParseFailed = parsed.warnings?.some(
    (w) => w === 'MRZ parse failed' || w.toLowerCase().includes('parse failed')
  );
  if (hasParseFailed) {
    throw Errors.badRequest('MRZ parse failed', { subcode: SUB.parse_failed });
  }
  const ratio = mrzCharsetRatio(raw);
  if (ratio < MRZ_OCR_OK_MIN && parsed.checksumsValid !== true) {
    throw Errors.badRequest('MRZ OCR quality too low', { subcode: SUB.low_confidence });
  }
  if (parsed.checksumsValid === false) {
    throw Errors.badRequest('MRZ checksum invalid', { subcode: SUB.checksum_invalid });
  }
  if (parsed.checksumsValid !== true) {
    if (ratio < MRZ_OCR_OK_MIN) {
      throw Errors.badRequest('MRZ checksum not verified', { subcode: SUB.low_confidence });
    }
    throw Errors.badRequest('MRZ could not be verified', { subcode: SUB.parse_failed });
  }
  const engine = (body.ocrEngine && String(body.ocrEngine).trim()) || 'expo-text-extractor';
  return { mrz_checksum_valid: true, ocr_engine: engine };
}
