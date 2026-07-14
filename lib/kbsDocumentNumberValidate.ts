import type { ParsedDocument } from '@/lib/scanner/types';

/** T.C., YKN, alfanümerik pasaport veya yabancı belge numarası. */
export function hasPlausibleKbsDocumentNumber(
  docNumber: string | null | undefined,
  documentType?: ParsedDocument['documentType'] | null
): boolean {
  const raw = (docNumber ?? '').trim().toUpperCase();
  if (!raw) return false;

  const digits = raw.replace(/\D/g, '');
  if (/^[1-9]\d{10}$/.test(digits)) return true;
  if (/^99\d{9}$/.test(digits)) return true;

  const alnum = raw.replace(/[^A-Z0-9]/g, '');
  if (alnum.length < 5 || alnum.length > 14) return false;
  if (/^[A-Z]{1,3}\d{5,10}$/.test(alnum)) return true;
  if (/^\d{6,14}$/.test(digits)) return true;
  if (/[A-Z]/.test(alnum) && /\d/.test(alnum) && alnum.length >= 6) return true;
  if (documentType === 'passport' && alnum.length >= 5 && /[A-Z]/.test(alnum) && /\d/.test(alnum)) {
    return true;
  }
  return false;
}
