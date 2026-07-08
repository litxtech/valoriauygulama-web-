import type { ParsedDocument } from '@/lib/scanner/types';

/** KBS “Müşteri İşlemleri” üçlüsü — MRZ’den kaba tahmin; personel ekranda düzeltir. */
export type KbsPersonKind = 'tc_citizen' | 'ykn_foreign' | 'foreign';

export type UsageKind = 'konaklama' | 'gunluk' | 'afetzede';

export function inferKbsPersonKind(
  parsed: Pick<ParsedDocument, 'documentType' | 'nationalityCode' | 'documentNumber' | 'issuingCountryCode'>
): KbsPersonKind {
  const docDigits = (parsed.documentNumber ?? '').replace(/\D/g, '');
  if (parsed.documentType === 'passport') return 'foreign';
  if (/^99\d{9}$/.test(docDigits)) return 'ykn_foreign';
  if (/^[1-9]\d{10}$/.test(docDigits)) return 'tc_citizen';

  const nat = (parsed.nationalityCode ?? '').toUpperCase();
  const iss = (parsed.issuingCountryCode ?? '').toUpperCase();
  const turkish = nat === 'TUR' || nat === 'TR' || iss === 'TUR' || iss === 'TR';

  if (parsed.documentType === 'id_card' && turkish) return 'tc_citizen';
  if (turkish && parsed.documentType !== 'passport') return 'tc_citizen';
  if (parsed.documentType === 'id_card') return 'foreign';
  return 'ykn_foreign';
}
