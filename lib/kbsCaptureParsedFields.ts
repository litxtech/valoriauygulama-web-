import { isUsablePersonName } from '@/lib/guestScan/personNameUtils';
import { formatKbsNationality, formatKbsTrDate, kbsDisplayFullName } from '@/lib/kbsDisplayFormat';
import type { ParsedDocument } from '@/lib/scanner/types';

export type KbsCopyField = {
  key: string;
  label: string;
  value: string;
};

const GENDER_LABEL: Record<string, string> = {
  M: 'Erkek',
  F: 'Kadın',
  X: 'Diğer',
};

const MARITAL_LABEL: Record<string, string> = {
  married: 'Evli',
  single: 'Bekâr',
};

function str(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  return s || null;
}

/** Kimlik bilgileri — öncelikli sıra, tarihler GG.AA.YYYY, tam ad yalnızca ad+soyad. */
export function buildKbsCopyFields(parsed: ParsedDocument | null | undefined): KbsCopyField[] {
  if (!parsed) return [];
  const out: KbsCopyField[] = [];
  const push = (key: string, label: string, raw: string | null | undefined) => {
    const value = str(raw);
    if (value) out.push({ key, label, value });
  };

  if (isUsablePersonName(parsed.lastName)) push('lastName', 'Soyad', parsed.lastName);
  if (isUsablePersonName(parsed.firstName)) push('firstName', 'Ad', parsed.firstName);

  const tamAd = kbsDisplayFullName(parsed);
  if (tamAd) push('fullName', 'Tam ad', tamAd);

  push('documentNumber', 'Kimlik / pasaport no', parsed.documentNumber);
  push('documentSeries', 'Seri no', parsed.documentSeries);

  const birthTr = formatKbsTrDate(parsed.birthDate);
  if (birthTr) push('birthDate', 'Doğum tarihi', birthTr);

  const uyruk = formatKbsNationality(parsed.nationalityCode);
  if (uyruk) push('nationalityCode', 'Uyruk', uyruk);

  const expiryTr = formatKbsTrDate(parsed.expiryDate);
  if (expiryTr) push('expiryDate', 'Son kullanım tarihi', expiryTr);

  if (parsed.gender) push('gender', 'Cinsiyet', GENDER_LABEL[parsed.gender] ?? parsed.gender);
  if (parsed.maritalStatus) {
    push('maritalStatus', 'Medeni hal', MARITAL_LABEL[parsed.maritalStatus] ?? parsed.maritalStatus);
  }
  if (isUsablePersonName(parsed.motherName)) push('motherName', 'Anne adı', parsed.motherName);
  if (isUsablePersonName(parsed.fatherName)) push('fatherName', 'Baba adı', parsed.fatherName);

  const docType =
    parsed.documentType === 'passport'
      ? 'Pasaport'
      : parsed.documentType === 'id_card'
        ? 'Kimlik'
        : parsed.documentType === 'residence_permit'
          ? 'İkamet'
          : parsed.documentType === 'other'
            ? 'Diğer belge'
            : null;
  push('documentType', 'Belge türü', docType);

  const issuing = formatKbsNationality(parsed.issuingCountryCode);
  if (issuing && issuing !== uyruk) push('issuingCountryCode', 'Veren ülke', issuing);

  return out;
}

export function isKbsOcrPending(payload: ParsedDocument | Record<string, unknown> | null | undefined): boolean {
  const w = (payload as ParsedDocument | null)?.warnings;
  return Array.isArray(w) && w.includes('ocr_pending');
}

export function isKbsOcrProcessing(payload: ParsedDocument | Record<string, unknown> | null | undefined): boolean {
  const w = (payload as ParsedDocument | null)?.warnings;
  return Array.isArray(w) && w.includes('ocr_processing');
}

export function listMissingIdFields(parsed: ParsedDocument): string[] {
  const missing: string[] = [];
  if (!isUsablePersonName(parsed.firstName)) missing.push('Ad');
  if (!isUsablePersonName(parsed.lastName)) missing.push('Soyad');
  const docDigits = (parsed.documentNumber ?? '').replace(/\D/g, '');
  if (docDigits.length < 6) missing.push('Kimlik / pasaport no');
  if (!parsed.birthDate) missing.push('Doğum tarihi');
  if (!parsed.nationalityCode) missing.push('Uyruk');
  if (!parsed.expiryDate) missing.push('Son kullanım tarihi');
  return missing;
}

export function kbsOcrStatusLabel(
  payload: ParsedDocument | Record<string, unknown> | null | undefined
): 'pending' | 'processing' | 'ready' | 'empty' {
  if (!payload || typeof payload !== 'object') return 'empty';
  if (isKbsOcrProcessing(payload)) return 'processing';
  if (isKbsOcrPending(payload)) return 'pending';
  const fields = buildKbsCopyFields(payload as ParsedDocument);
  if (fields.length >= 2) return 'ready';
  return 'empty';
}
