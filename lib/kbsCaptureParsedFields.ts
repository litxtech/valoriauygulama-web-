import { isUsablePersonName } from '@/lib/guestScan/personNameUtils';
import { hasPlausibleKbsDocumentNumber } from '@/lib/kbsDocumentNumberValidate';
import { formatKbsNationality, formatKbsTrDate, kbsAgeYearsFromBirthDate, kbsDisplayFullName } from '@/lib/kbsDisplayFormat';
import { isKbsPlaceholderName } from '@/lib/kbsCaptureOcrMerge';
import type { ParsedDocument } from '@/lib/scanner/types';
import type { KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';

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

function pickPayloadString(obj: Record<string, unknown>, camel: string, snake: string): string | null {
  const v = obj[camel] ?? obj[snake];
  return typeof v === 'string' ? str(v) : null;
}

/** DB / eski kayıtlar — camelCase veya snake_case, isteğe bağlı `parsed` sarmalayıcı. */
export function normalizeKbsParsedPayload(
  raw: ParsedDocument | Record<string, unknown> | null | undefined
): ParsedDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const root = raw as Record<string, unknown>;
  const inner =
    root.parsed && typeof root.parsed === 'object'
      ? (root.parsed as Record<string, unknown>)
      : root;

  const genderRaw = pickPayloadString(inner, 'gender', 'gender');
  const gender =
    genderRaw === 'M' || genderRaw === 'F' || genderRaw === 'X' ? genderRaw : null;

  const docTypeRaw = pickPayloadString(inner, 'documentType', 'document_type');
  const documentType =
    docTypeRaw === 'passport' ||
    docTypeRaw === 'id_card' ||
    docTypeRaw === 'residence_permit' ||
    docTypeRaw === 'other'
      ? docTypeRaw
      : 'other';

  const maritalRaw = pickPayloadString(inner, 'maritalStatus', 'marital_status');
  const maritalStatus = maritalRaw === 'married' || maritalRaw === 'single' ? maritalRaw : null;

  const warningsRaw = inner.warnings;
  const warnings = Array.isArray(warningsRaw)
    ? warningsRaw.filter((w): w is string => typeof w === 'string')
    : [];

  return {
    documentType,
    fullName: pickPayloadString(inner, 'fullName', 'full_name'),
    firstName: pickPayloadString(inner, 'firstName', 'first_name'),
    lastName: pickPayloadString(inner, 'lastName', 'last_name'),
    middleName: pickPayloadString(inner, 'middleName', 'middle_name'),
    documentNumber: pickPayloadString(inner, 'documentNumber', 'document_number'),
    documentSeries: pickPayloadString(inner, 'documentSeries', 'document_series'),
    nationalityCode: pickPayloadString(inner, 'nationalityCode', 'nationality_code'),
    issuingCountryCode: pickPayloadString(inner, 'issuingCountryCode', 'issuing_country_code'),
    birthDate: pickPayloadString(inner, 'birthDate', 'birth_date'),
    expiryDate: pickPayloadString(inner, 'expiryDate', 'expiry_date'),
    gender,
    motherName: pickPayloadString(inner, 'motherName', 'mother_name'),
    fatherName: pickPayloadString(inner, 'fatherName', 'father_name'),
    maritalStatus,
    rawMrz: pickPayloadString(inner, 'rawMrz', 'raw_mrz'),
    confidence: typeof inner.confidence === 'number' ? inner.confidence : null,
    checksumsValid: typeof inner.checksumsValid === 'boolean' ? inner.checksumsValid : null,
    warnings,
  };
}

type KbsParsedEnrichSource = {
  document_number?: string | null;
  nationality_code?: string | null;
  issuing_country_code?: string | null;
  expiry_date?: string | null;
  document_type?: string | null;
  guest?: {
    first_name?: string | null;
    last_name?: string | null;
    birth_date?: string | null;
    gender?: string | null;
    nationality_code?: string | null;
  } | null;
};

/** parsed_payload boş kalsa bile belge / misafir sütunlarından alanları tamamla. */
export function enrichKbsParsedFromSources(
  raw: ParsedDocument | Record<string, unknown> | null | undefined,
  source?: KbsParsedEnrichSource | null
): ParsedDocument | null {
  const base = normalizeKbsParsedPayload(raw);
  if (!source) return base;

  const docTypeRaw = source.document_type?.trim();
  const documentType =
    docTypeRaw === 'passport' ||
    docTypeRaw === 'id_card' ||
    docTypeRaw === 'residence_permit' ||
    docTypeRaw === 'other'
      ? docTypeRaw
      : base?.documentType ?? 'other';

  const guest = source.guest;
  const guestGender = guest?.gender?.trim();
  const gender =
    base?.gender ??
    (guestGender === 'M' || guestGender === 'F' || guestGender === 'X' ? guestGender : null);

  const baseForPlaceholder = {
    ...(base ?? {}),
    firstName: base?.firstName ?? null,
    lastName: base?.lastName ?? null,
  } as ParsedDocument;
  const baseIsPlaceholder = isKbsPlaceholderName(baseForPlaceholder);

  const firstName =
    base?.firstName && !baseIsPlaceholder ? base.firstName : str(guest?.first_name) ?? base?.firstName;
  const lastName =
    base?.lastName && !baseIsPlaceholder ? base.lastName : str(guest?.last_name) ?? base?.lastName;
  const fullName =
    base?.fullName ??
    kbsDisplayFullName({ ...(base ?? {}), firstName, lastName } as ParsedDocument) ??
    ([firstName, lastName].filter(Boolean).join(' ').trim() || null);

  const birthRaw = base?.birthDate ?? guest?.birth_date;
  const birthDate =
    typeof birthRaw === 'string' && birthRaw.length >= 10 ? birthRaw.slice(0, 10) : birthRaw ?? null;

  const expiryRaw = base?.expiryDate ?? source.expiry_date;
  const expiryDate =
    typeof expiryRaw === 'string' && expiryRaw.length >= 10 ? expiryRaw.slice(0, 10) : expiryRaw ?? null;

  return {
    documentType,
    fullName,
    firstName,
    lastName,
    middleName: base?.middleName ?? null,
    documentNumber: base?.documentNumber ?? str(source.document_number),
    documentSeries: base?.documentSeries ?? null,
    nationalityCode: base?.nationalityCode ?? str(source.nationality_code) ?? str(guest?.nationality_code),
    issuingCountryCode: base?.issuingCountryCode ?? str(source.issuing_country_code),
    birthDate,
    expiryDate,
    gender,
    motherName: base?.motherName ?? null,
    fatherName: base?.fatherName ?? null,
    maritalStatus: base?.maritalStatus ?? null,
    rawMrz: base?.rawMrz ?? null,
    confidence: base?.confidence ?? null,
    checksumsValid: base?.checksumsValid ?? null,
    warnings: base?.warnings ?? [],
  };
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
  push('personalNumber', 'Kişisel / ulusal no', parsed.personalNumber);

  const birthTr = formatKbsTrDate(parsed.birthDate);
  if (birthTr) push('birthDate', 'Doğum tarihi', birthTr);

  push('placeOfBirth', 'Doğum yeri', parsed.placeOfBirth);

  const age = kbsAgeYearsFromBirthDate(parsed.birthDate);
  if (age != null) push('age', 'Yaş', String(age));

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

/** Ekran / PDF — oda ve kayıt tarihi dahil tam liste. */
export function buildKbsReportFields(
  row: KbsCapturedDocumentRow,
  parsed: ParsedDocument | null | undefined
): KbsCopyField[] {
  const identity = buildKbsCopyFields(parsed);
  const out: KbsCopyField[] = [
    { key: 'room', label: 'Oda', value: row.room_number?.trim() || '—' },
    ...identity,
    {
      key: 'captured',
      label: 'Kayıt',
      value: new Date(row.captured_at ?? row.created_at).toLocaleString('tr-TR'),
    },
  ];
  if (parsed) {
    const missing = listMissingIdFields(parsed);
    if (missing.length > 0 && !kbsCaptureHasReadableData(parsed)) {
      out.push({ key: 'missing', label: 'Eksik alanlar', value: missing.join(', ') });
    }
  }
  return out;
}

export function isKbsTcOnlyCapture(
  payload: ParsedDocument | Record<string, unknown> | null | undefined
): boolean {
  const w = (payload as ParsedDocument | null)?.warnings;
  return Array.isArray(w) && w.includes('tc_only');
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
  const missing = listCoreMissingIdFields(parsed);
  if (!parsed.gender) missing.push('Cinsiyet');
  return missing;
}

/** OCR tamamlanma / yeniden deneme — cinsiyet hariç zorunlu alanlar. */
export function listCoreMissingIdFields(parsed: ParsedDocument): string[] {
  const missing: string[] = [];
  if (!isUsablePersonName(parsed.firstName)) missing.push('Ad');
  if (!isUsablePersonName(parsed.lastName)) missing.push('Soyad');
  if (!hasPlausibleKbsDocumentNumber(parsed.documentNumber, parsed.documentType)) {
    missing.push('Kimlik / pasaport no');
  }
  if (!parsed.birthDate) missing.push('Doğum tarihi');
  if (!parsed.nationalityCode) missing.push('Uyruk');
  if (!parsed.expiryDate) missing.push('Son kullanım tarihi');
  return missing;
}

export function isKbsCaptureOcrCoreComplete(
  payload: ParsedDocument | Record<string, unknown> | null | undefined
): boolean {
  if (!payload || typeof payload !== 'object') return false;
  return listCoreMissingIdFields(payload as ParsedDocument).length === 0;
}

export function isKbsCaptureOcrComplete(
  payload: ParsedDocument | Record<string, unknown> | null | undefined
): boolean {
  if (!payload || typeof payload !== 'object') return false;
  if (isKbsOcrInProgress(payload)) return false;
  return listMissingIdFields(payload as ParsedDocument).length === 0;
}

export function isKbsOcrFailed(payload: ParsedDocument | Record<string, unknown> | null | undefined): boolean {
  const w = (payload as ParsedDocument | null)?.warnings;
  return Array.isArray(w) && w.includes('ocr_failed');
}

export function isKbsOcrInProgress(
  payload: ParsedDocument | Record<string, unknown> | null | undefined
): boolean {
  return isKbsOcrPending(payload) || isKbsOcrProcessing(payload);
}

/** Ekranda gösterilecek en az bir kimlik alanı var mı. */
export function kbsCaptureHasReadableData(
  payload: ParsedDocument | Record<string, unknown> | null | undefined
): boolean {
  if (!payload || typeof payload !== 'object') return false;
  return buildKbsCopyFields(payload as ParsedDocument).length >= 1;
}

export type KbsCaptureCardStatus = {
  label: string;
  tone: 'ok' | 'muted';
};

/** Liste/detay rozeti — herhangi bir alan okunduysa yeşil; tam çekirdek alanlarda Tamam. */
export function kbsCaptureCardStatus(
  parsed: ParsedDocument | null | undefined
): KbsCaptureCardStatus | null {
  if (!parsed) return null;
  if (isKbsTcOnlyCapture(parsed) && parsed.documentNumber) {
    return { label: 'T.C.', tone: 'ok' };
  }
  if (isKbsOcrInProgress(parsed)) return null;

  if (kbsCaptureHasReadableData(parsed)) {
    return {
      label: isKbsCaptureOcrCoreComplete(parsed) ? 'Tamam' : 'Okundu',
      tone: 'ok',
    };
  }
  if (isKbsOcrFailed(parsed)) {
    return { label: 'Okunamadı', tone: 'muted' };
  }
  return null;
}

export function kbsOcrStatusLabel(
  payload: ParsedDocument | Record<string, unknown> | null | undefined
): 'pending' | 'processing' | 'ready' | 'empty' {
  if (!payload || typeof payload !== 'object') return 'empty';
  if (isKbsOcrProcessing(payload)) return 'processing';
  if (isKbsOcrPending(payload)) return 'pending';
  if (isKbsCaptureOcrCoreComplete(payload) || kbsCaptureHasReadableData(payload)) return 'ready';
  return 'empty';
}
