/**
 * MRZ / kimlik okuma şüphesi — checksum fail, fallback parse, belirsiz alanlar.
 * Şüpheli sonuçlar “sağlıklı” sayılmaz; derin OCR / manuel kontrol tetiklenir.
 */
import type { ParsedDocument } from '@/lib/scanner/types';

export const MRZ_NEEDS_REVIEW_WARNING = 'mrz_needs_review';
export const MRZ_DOC_REPAIRED_WARNING = 'mrz_document_number_repaired';
export const MRZ_IDENTITY_CONFLICT_WARNING = 'mrz_visual_identity_conflict';
export const MRZ_VISUAL_VERIFIED_WARNING = 'mrz_visual_verified';
export const MRZ_VISUAL_PARTIAL_WARNING = 'mrz_visual_partial';

export function isMrzChecksumSuspicious(parsed: ParsedDocument | null | undefined): boolean {
  if (!parsed?.rawMrz) return false;
  if (parsed.checksumsValid === true) return false;
  if (parsed.checksumsValid === false) return true;
  const w = parsed.warnings ?? [];
  return w.some(
    (x) =>
      x === 'mrz_fallback_parse' ||
      x === 'MRZ checksum validation failed' ||
      x === 'MRZ parse failed' ||
      x === 'document_number_uncertain' ||
      x.includes('uncertain') ||
      x.includes('checksum')
  );
}

export function hasMrzNeedsReview(parsed: ParsedDocument | null | undefined): boolean {
  return (parsed?.warnings ?? []).includes(MRZ_NEEDS_REVIEW_WARNING);
}

/** Şüpheli MRZ veya kimlik çelişkisi uyarısı ekle (yinelenmez). */
export function withMrzNeedsReviewWarning(parsed: ParsedDocument): ParsedDocument {
  if (!isMrzChecksumSuspicious(parsed) && !hasMrzNeedsReview(parsed)) {
    // Çelişki uyarısı varsa da review
    if (!(parsed.warnings ?? []).includes(MRZ_IDENTITY_CONFLICT_WARNING)) {
      return parsed;
    }
  }
  const warnings = [...(parsed.warnings ?? [])];
  if (!warnings.includes(MRZ_NEEDS_REVIEW_WARNING)) {
    warnings.push(MRZ_NEEDS_REVIEW_WARNING);
  }
  return { ...parsed, warnings };
}

export function pushParsedWarning(parsed: ParsedDocument, warning: string): ParsedDocument {
  const warnings = [...(parsed.warnings ?? [])];
  if (!warnings.includes(warning)) warnings.push(warning);
  return { ...parsed, warnings };
}
