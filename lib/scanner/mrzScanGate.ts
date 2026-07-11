import type { ParsedDocument } from './types';
import { mrzCharsetRatio } from './mrzCharset';

export type MrzSaveBlockReason = 'no_mrz' | 'parse_failed' | 'checksum_invalid' | 'low_confidence_ocr';

const MRZ_OCR_OK_MIN = 0.9;

/**
 * Sadece ICAO check digit'leri geçen MRZ kayda yazılır (profesyonel kural).
 * Bulanık / şüpheli OCR: düşük charset oranı + checksum doğrulanamıyorsa engellenir.
 */
export function canSaveMrzDocument(args: {
  rawMrz: string | null;
  parsed: ParsedDocument;
}):
  | { allowed: true }
  | { allowed: false; reason: MrzSaveBlockReason } {
  const { rawMrz, parsed } = args;
  const raw = rawMrz?.trim() ?? '';
  if (!raw) {
    return { allowed: false, reason: 'no_mrz' };
  }

  const hasParseFailed = parsed.warnings?.some(
    (w) => w === 'MRZ parse failed' || w.includes('parse failed')
  );
  if (hasParseFailed) {
    return { allowed: false, reason: 'parse_failed' };
  }

  const ratio = mrzCharsetRatio(raw);
  if (ratio < MRZ_OCR_OK_MIN && parsed.checksumsValid !== true) {
    return { allowed: false, reason: 'low_confidence_ocr' };
  }

  if (parsed.checksumsValid === false) {
    return { allowed: false, reason: 'checksum_invalid' };
  }
  if (parsed.checksumsValid !== true) {
    return { allowed: false, reason: ratio < MRZ_OCR_OK_MIN ? 'low_confidence_ocr' : 'parse_failed' };
  }

  return { allowed: true };
}

/**
 * Canlı kamera kilidi: checksum doğrulanamasa bile yüksek charset + temel alanlar doluysa
 * kullanıcı onay ekranına geçilir (KBS kaydı yine `canSaveMrzDocument` ile sıkı kontrol edilir).
 */
export function canLockMrzLiveScan(args: {
  rawMrz: string | null;
  parsed: ParsedDocument;
}): boolean {
  const strict = canSaveMrzDocument(args);
  if (strict.allowed) return true;

  const { rawMrz, parsed } = args;
  const raw = rawMrz?.trim() ?? '';
  if (!raw) return false;
  if (parsed.warnings?.some((w) => w === 'MRZ parse failed' || w.includes('parse failed'))) {
    return false;
  }
  if (parsed.checksumsValid === false) return false;

  const ratio = mrzCharsetRatio(raw);
  if (ratio < 0.84) return false;
  if (!parsed.documentNumber?.trim()) return false;

  const isPassport = parsed.documentType === 'passport';
  if (isPassport) {
    return ratio >= 0.86 || parsed.checksumsValid === true;
  }

  if (!parsed.firstName?.trim() && !parsed.lastName?.trim()) return false;
  return true;
}

export function isMrzPayload(rawMrz: string | null | undefined): boolean {
  return Boolean(rawMrz && String(rawMrz).trim().length > 0);
}

/**
 * Kimlik çekim arka plan OCR — checksum doğrulanamasa bile anlamlı MRZ alanları varsa kabul.
 */
export function canUseKbsCaptureMrz(args: {
  rawMrz: string | null;
  parsed: ParsedDocument;
}): boolean {
  const { rawMrz, parsed } = args;
  const raw = rawMrz?.trim() ?? '';
  if (!raw) return false;
  if (
    parsed.warnings?.some((w) => w === 'MRZ parse failed' || w.includes('parse failed'))
  ) {
    return false;
  }
  const hasFallback = parsed.warnings?.includes('mrz_fallback_parse');
  const ratio = mrzCharsetRatio(raw);
  if (ratio < 0.76 && !hasFallback) return false;
  if (!parsed.documentNumber?.trim()) return false;
  const hasDate = !!(parsed.birthDate || parsed.expiryDate);
  const hasName = !!(parsed.firstName?.trim() || parsed.lastName?.trim());
  return parsed.checksumsValid === true || hasFallback || hasDate || hasName;
}
