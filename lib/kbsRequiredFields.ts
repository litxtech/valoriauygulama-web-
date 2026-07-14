/**
 * Jandarma KBS “Müşteri İşlemleri” zorunlu alanları (yıldızlı).
 * Üç kol: T.C. Vatandaşı | YKN olan Yabancı | Yabancı
 */
import type { KbsPersonKind, UsageKind } from '@/lib/kbsInferPersonKind';

export type KbsFormField =
  | 'identityNo'
  | 'passportNo'
  | 'documentSerialNo'
  | 'firstName'
  | 'lastName'
  | 'birthDate'
  | 'country'
  | 'nationality'
  | 'fatherName'
  | 'motherName'
  | 'gender'
  | 'maritalStatus'
  | 'roomNo'
  | 'plateNumber'
  | 'phone'
  | 'usageKind'
  | 'checkinAt';

/** Yıldızlı = zorunlu. Kol başına. */
export const KBS_REQUIRED_BY_KIND: Record<KbsPersonKind, KbsFormField[]> = {
  /**
   * T.C.: sisteme TC yazılır, kimlik otomatik çekilir.
   * Konaklama için oda / kullanım / giriş zorunlu.
   * Belge seri formda da yıldızlı — varsa gönderilir, TC-only autofetch sonrası zorunlu tutulmaz.
   */
  tc_citizen: ['identityNo', 'roomNo', 'usageKind', 'checkinAt'],
  /** YKN (genelde 99…): yabancı gibi, kimlik no = YKN + seri + kimlik + konaklama. */
  ykn_foreign: [
    'identityNo',
    'documentSerialNo',
    'firstName',
    'lastName',
    'birthDate',
    'country',
    'roomNo',
    'usageKind',
    'checkinAt',
  ],
  /** Yabancı: pasaport/belge no + seri + kimlik + konaklama. */
  foreign: [
    'passportNo',
    'documentSerialNo',
    'firstName',
    'lastName',
    'birthDate',
    'country',
    'roomNo',
    'usageKind',
    'checkinAt',
  ],
};

export const KBS_OPTIONAL_FIELDS: KbsFormField[] = [
  'fatherName',
  'motherName',
  'gender',
  'maritalStatus',
  'plateNumber',
  'phone',
];

export function soapUsageKind(usage: UsageKind | string | null | undefined): string {
  const u = String(usage ?? 'konaklama').toLowerCase();
  if (u === 'gunluk') return 'GUNLUK';
  if (u === 'afetzede') return 'AFETZEDE';
  return 'KONAKLAMA';
}

export function soapGender(g: string | null | undefined): string {
  if (g === 'M') return 'ERKEK';
  if (g === 'F') return 'KADIN';
  return 'TANIMSIZ';
}

export function soapMarital(m: string | null | undefined): string | null {
  if (m === 'married') return 'EVLI';
  if (m === 'single') return 'BEKAR';
  return null;
}

/** Gateway check-in için operasyon adı. */
export function soapCheckInOperation(kind: KbsPersonKind | string | null | undefined): string {
  return kind === 'tc_citizen' ? 'MusteriKimlikNoGiris' : 'MusteriYabanciGiris';
}

export function soapCheckOutOperation(kind: KbsPersonKind | string | null | undefined): string {
  return kind === 'tc_citizen' ? 'MusteriKimlikNoCikis' : 'MusteriYabanciCikis';
}

export function soapDeleteOperation(kind: KbsPersonKind | string | null | undefined): string {
  return kind === 'tc_citizen' ? 'MusteriTCSIil' : 'MusteriYabanciSil';
}
