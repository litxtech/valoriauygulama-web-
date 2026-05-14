import type { ParsedDocument } from '@/lib/scanner/types';

/** KBS “Müşteri İşlemleri” üçlüsü — MRZ’den kaba tahmin; personel ekranda düzeltir. */
export type KbsPersonKind = 'tc_citizen' | 'ykn_foreign' | 'foreign';

export type UsageKind = 'konaklama' | 'gunluk' | 'afetzede';

export function inferKbsPersonKind(parsed: Pick<ParsedDocument, 'documentType' | 'nationalityCode'>): KbsPersonKind {
  const nat = (parsed.nationalityCode ?? '').toUpperCase();
  if (parsed.documentType === 'passport') return 'foreign';
  if (nat === 'TUR' || nat === 'TR') return 'tc_citizen';
  return 'ykn_foreign';
}
