import type { ParsedDocument } from '@/lib/scanner/types';

/** KBS “Müşteri İşlemleri” üçlüsü — MRZ’den kaba tahmin; personel ekranda düzeltir. */
export type KbsPersonKind = 'tc_citizen' | 'ykn_foreign' | 'foreign';

export type UsageKind = 'konaklama' | 'gunluk' | 'afetzede';

/**
 * YKN: genelde 99 ile başlar; haneye/başlangıç rakamına sıkı bağlanılmaz.
 * TC: klasik 11 hane. Pasaport → yabancı.
 */
export function inferKbsPersonKind(
  parsed: Pick<ParsedDocument, 'documentType' | 'nationalityCode' | 'documentNumber' | 'issuingCountryCode'>
): KbsPersonKind {
  const docDigits = (parsed.documentNumber ?? '').replace(/\D/g, '');

  if (parsed.documentType === 'passport') return 'foreign';

  // YKN: 99 ile başlayan kimlik no (uzunluk sabit değil)
  if (docDigits.startsWith('99') && docDigits.length >= 9) return 'ykn_foreign';

  // T.C. 11 hane
  if (/^[1-9]\d{10}$/.test(docDigits) && !docDigits.startsWith('99')) return 'tc_citizen';

  const nat = (parsed.nationalityCode ?? '').toUpperCase();
  const iss = (parsed.issuingCountryCode ?? '').toUpperCase();
  const turkish = nat === 'TUR' || nat === 'TR' || iss === 'TUR' || iss === 'TR';

  if (parsed.documentType === 'id_card' && turkish) return 'tc_citizen';
  if (turkish && parsed.documentType !== 'passport') return 'tc_citizen';
  if (parsed.documentType === 'id_card') return 'ykn_foreign';
  return 'foreign';
}
