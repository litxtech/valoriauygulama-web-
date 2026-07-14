import type { ParsedDocument } from '@/lib/scanner/types';

/** Örn. AP902390, U12345678 — harf+rakam; yalnızca rakam T.C./YKN değil. */
export function looksLikeAlphanumericPassportNo(docNumber: string | null | undefined): boolean {
  const alnum = (docNumber ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (alnum.length < 5 || alnum.length > 14) return false;
  if (!/[A-Z]/.test(alnum) || !/\d/.test(alnum)) return false;
  // Saf 11 hane T.C. / 99… YKN sayılmaz
  if (/^[1-9]\d{10}$/.test(alnum)) return false;
  if (/^99\d{9,}$/.test(alnum)) return false;
  return true;
}

/** T.C., YKN, alfanümerik pasaport (AP902390) veya yabancı belge numarası. */
export function hasPlausibleKbsDocumentNumber(
  docNumber: string | null | undefined,
  documentType?: ParsedDocument['documentType'] | null
): boolean {
  const raw = (docNumber ?? '').trim().toUpperCase();
  if (!raw) return false;

  const digits = raw.replace(/\D/g, '');
  if (/^[1-9]\d{10}$/.test(digits) && !/[A-Z]/.test(raw.replace(/[^A-Z0-9]/g, ''))) return true;
  if (/^99\d{9}$/.test(digits) && !/[A-Z]/.test(raw.replace(/[^A-Z0-9]/g, ''))) return true;

  const alnum = raw.replace(/[^A-Z0-9]/g, '');
  if (alnum.length < 5 || alnum.length > 14) return false;
  // AP902390, AB12CD34, P1234567 vb.
  if (looksLikeAlphanumericPassportNo(alnum)) return true;
  if (/^[A-Z]{1,4}\d{4,10}$/.test(alnum)) return true;
  if (/^\d{6,14}$/.test(digits)) return true;
  if (/[A-Z]/.test(alnum) && /\d/.test(alnum) && alnum.length >= 5) return true;
  if (documentType === 'passport' && alnum.length >= 5) return true;
  return false;
}
