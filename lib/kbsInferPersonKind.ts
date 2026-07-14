import { looksLikeAlphanumericPassportNo } from '@/lib/kbsDocumentNumberValidate';
import type { ParsedDocument } from '@/lib/scanner/types';

/** KBS “Müşteri İşlemleri” üçlüsü — MRZ’den kaba tahmin; personel ekranda düzeltir. */
export type KbsPersonKind = 'tc_citizen' | 'ykn_foreign' | 'foreign';

export type UsageKind = 'konaklama' | 'gunluk' | 'afetzede';

/**
 * YKN: genelde 99 ile başlar; haneye/başlangıç rakamına sıkı bağlanılmaz.
 * TC: klasik 11 hane. Pasaport (AP902390 vb.) → yabancı — harfler asla T.C. sanılmasın.
 */
export function inferKbsPersonKind(
  parsed: Pick<ParsedDocument, 'documentType' | 'nationalityCode' | 'documentNumber' | 'issuingCountryCode'>
): KbsPersonKind {
  const docRaw = (parsed.documentNumber ?? '').trim().toUpperCase();
  const docDigits = docRaw.replace(/\D/g, '');

  if (parsed.documentType === 'passport') return 'foreign';
  // AP902390 gibi alfanümerik → her zaman yabancı (MusteriYabanciGiris / BELGENO)
  if (looksLikeAlphanumericPassportNo(docRaw)) return 'foreign';

  // YKN: 99 ile başlayan kimlik no (yalnızca rakam)
  if (!/[A-Z]/.test(docRaw.replace(/[^A-Z0-9]/g, '')) && docDigits.startsWith('99') && docDigits.length >= 9) {
    return 'ykn_foreign';
  }

  // T.C. 11 hane (yalnızca rakam)
  if (/^[1-9]\d{10}$/.test(docDigits) && !docDigits.startsWith('99') && !/[A-Z]/.test(docRaw)) {
    return 'tc_citizen';
  }

  const nat = (parsed.nationalityCode ?? '').toUpperCase();
  const iss = (parsed.issuingCountryCode ?? '').toUpperCase();
  const turkish = nat === 'TUR' || nat === 'TR' || nat === 'TC' || iss === 'TUR' || iss === 'TR' || iss === 'TC';

  if (parsed.documentType === 'id_card' && turkish) return 'tc_citizen';
  if (turkish && parsed.documentType !== 'passport') return 'tc_citizen';
  if (parsed.documentType === 'id_card') return 'ykn_foreign';
  return 'foreign';
}
