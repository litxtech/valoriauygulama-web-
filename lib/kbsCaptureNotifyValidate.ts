import { KBS_REQUIRED_BY_KIND, type KbsFormField } from '@/lib/kbsRequiredFields';
import { inferKbsPersonKind, type KbsPersonKind } from '@/lib/kbsInferPersonKind';
import type { ParsedDocument } from '@/lib/scanner/types';

export type KbsNotifyForm = {
  firstName: string;
  lastName: string;
  docNo: string;
  documentSeries: string;
  birthDate: string;
  nationality: string;
  roomSelected: boolean;
};

const LABELS: Partial<Record<KbsFormField, string>> = {
  identityNo: 'Kimlik no',
  passportNo: 'Pasaport no',
  documentSerialNo: 'Seri no',
  firstName: 'Ad',
  lastName: 'Soyad',
  birthDate: 'Doğum tarihi',
  country: 'Ülke / Uyruk',
  nationality: 'Ülke / Uyruk',
  roomNo: 'Oda',
};

/** Bildir öncesi: yalnızca KBS zorunlu alanları; opsiyoneller kontrol edilmez. */
export function validateCaptureNotifyForm(
  form: KbsNotifyForm,
  parsed: ParsedDocument | null
): { ok: true; kind: KbsPersonKind } | { ok: false; message: string } {
  const kind = inferKbsPersonKind(
    parsed ?? {
      documentType: 'passport',
      nationalityCode: form.nationality || null,
      documentNumber: form.docNo || null,
      issuingCountryCode: null,
    }
  );
  const required = KBS_REQUIRED_BY_KIND[kind];
  const missing: string[] = [];

  for (const field of required) {
    if (field === 'checkinAt' || field === 'usageKind') continue;
    if (field === 'roomNo') {
      if (!form.roomSelected) missing.push(LABELS.roomNo ?? 'Oda');
      continue;
    }
    if (field === 'firstName' && !form.firstName.trim()) missing.push('Ad');
    if (field === 'lastName' && !form.lastName.trim()) missing.push('Soyad');
    if (field === 'birthDate' && !form.birthDate.trim()) missing.push('Doğum tarihi');
    if ((field === 'country' || field === 'nationality') && !form.nationality.trim()) {
      missing.push('Ülke / Uyruk');
    }
    if (field === 'identityNo' || field === 'passportNo') {
      if (!form.docNo.trim()) missing.push(LABELS[field] ?? 'Belge no');
    }
    if (field === 'documentSerialNo') {
      const seri = form.documentSeries.trim() || form.docNo.trim();
      if (!seri) missing.push('Seri no');
    }
  }

  if (missing.length) {
    return {
      ok: false,
      message: `KBS zorunlu alanlar eksik: ${[...new Set(missing)].join(', ')}`,
    };
  }
  return { ok: true, kind };
}
