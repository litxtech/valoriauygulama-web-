import type { ParsedDocument } from '@/lib/scanner/types';

/** Örn. AP902390, U12345678 — harf+rakam; yalnızca rakam T.C./YKN değil. */
export function looksLikeAlphanumericPassportNo(docNumber: string | null | undefined): boolean {
  const alnum = (docNumber ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (alnum.length < 6 || alnum.length > 12) return false;
  if (!/[A-Z]/.test(alnum) || !/\d/.test(alnum)) return false;
  // Saf 11 hane T.C. / 99… YKN sayılmaz
  if (/^[1-9]\d{10}$/.test(alnum)) return false;
  if (/^99\d{9,}$/.test(alnum)) return false;
  // Tipik pasaport: 1–3 harf + rakam veya harf-rakam karışık 6–9
  if (/^[A-Z]{1,3}\d{4,9}$/.test(alnum)) return true;
  if (/^[A-Z]\d{6,9}$/.test(alnum)) return true;
  if (/^[A-Z0-9]{6,9}$/.test(alnum) && /[A-Z]/.test(alnum) && /\d/.test(alnum)) return true;
  return false;
}

/** T.C., YKN, alfanümerik pasaport (AP902390) veya yabancı belge numarası. */
export function hasPlausibleKbsDocumentNumber(
  docNumber: string | null | undefined,
  documentType?: ParsedDocument['documentType'] | null
): boolean {
  const raw = (docNumber ?? '').trim().toUpperCase();
  if (!raw) return false;

  const digits = raw.replace(/\D/g, '');
  const alnum = raw.replace(/[^A-Z0-9]/g, '');

  // T.C. kimlik
  if (/^[1-9]\d{10}$/.test(digits) && !/[A-Z]/.test(alnum)) return true;
  // Yabancı kimlik no (99…)
  if (/^99\d{9}$/.test(digits) && !/[A-Z]/.test(alnum)) return true;

  if (alnum.length < 5 || alnum.length > 14) return false;

  // Pasaport: sıkı — rastgele 5 harf kabul etme
  if (documentType === 'passport') {
    return looksLikeAlphanumericPassportNo(alnum);
  }

  // Genel / id_card / residence
  if (looksLikeAlphanumericPassportNo(alnum)) return true;
  if (/^[A-Z]{1,4}\d{4,10}$/.test(alnum)) return true;
  if (/^\d{6,14}$/.test(digits) && digits.length === alnum.length) return true;
  if (/[A-Z]/.test(alnum) && /\d/.test(alnum) && alnum.length >= 6) return true;
  return false;
}
