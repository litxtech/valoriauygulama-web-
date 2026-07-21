// Mobil uygulamanın OCR okuma mantığının web portu:
//   lib/kbsCaptureParsedFields.ts + lib/kbsDisplayFormat.ts + lib/kbsCaptureOcrMerge.ts
// Amaç: parsed_payload + belge/misafir sütunlarından TÜM bilgileri temiz okumak.

import type { KbsCapturedDocumentRow, KbsCopyField, ParsedDocument } from './types';
import { isUsablePersonName, sanitizePersonName } from './personName';
import { formatIcao3ForTr } from './nationality';

const GENDER_LABEL: Record<string, string> = { M: 'Erkek', F: 'Kadın', X: 'Diğer' };
const MARITAL_LABEL: Record<string, string> = { married: 'Evli', single: 'Bekâr' };
const PLACEHOLDER_FIRST = 'MISAFIR';

function str(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  return s || null;
}

function pickPayloadString(obj: Record<string, unknown>, camel: string, snake: string): string | null {
  const v = obj[camel] ?? obj[snake];
  return typeof v === 'string' ? str(v) : null;
}

export function formatKbsTrDate(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso.trim();
  return `${m[3]}.${m[2]}.${m[1]}`;
}

export function formatKbsNationality(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  return formatIcao3ForTr(code);
}

export function kbsAgeYearsFromBirthDate(iso: string | null | undefined): number | null {
  if (!iso?.trim() || iso.length < 10) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const years = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  return years >= 0 && years <= 120 ? years : null;
}

export function kbsDisplayFullName(parsed: ParsedDocument | null | undefined): string | null {
  if (!parsed) return null;
  const fn = sanitizePersonName(parsed.firstName);
  const ln = sanitizePersonName(parsed.lastName);
  if (isUsablePersonName(fn) && isUsablePersonName(ln)) return `${fn} ${ln}`.trim();
  const raw = sanitizePersonName(parsed.fullName);
  if (raw && isUsablePersonName(raw.split(/\s+/)[0]) && raw.length <= 48) return raw;
  return fn || ln || null;
}

function normNameKey(v: string | null | undefined): string {
  return sanitizePersonName(v)?.replace(/\s+/g, ' ') ?? '';
}

export function isKbsPlaceholderName(parsed: ParsedDocument | null | undefined): boolean {
  if (!parsed) return false;
  const fn = normNameKey(parsed.firstName);
  const ln = (parsed.lastName ?? '').trim();
  return fn === PLACEHOLDER_FIRST && /^\S+-\d+$/.test(ln);
}

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
  const gender = genderRaw === 'M' || genderRaw === 'F' || genderRaw === 'X' ? genderRaw : null;

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

  const returningRaw = inner.returningGuest ?? inner.returning_guest;
  let returningGuest: ParsedDocument['returningGuest'];
  if (returningRaw && typeof returningRaw === 'object') {
    const m = returningRaw as Record<string, unknown>;
    const previousDocumentId =
      typeof m.previousDocumentId === 'string'
        ? m.previousDocumentId
        : typeof m.previous_document_id === 'string'
          ? m.previous_document_id
          : null;
    if (previousDocumentId) {
      returningGuest = {
        previousDocumentId,
        previousGuestId:
          typeof m.previousGuestId === 'string'
            ? m.previousGuestId
            : typeof m.previous_guest_id === 'string'
              ? m.previous_guest_id
              : null,
        previousCapturedAt:
          typeof m.previousCapturedAt === 'string'
            ? m.previousCapturedAt
            : typeof m.previous_captured_at === 'string'
              ? m.previous_captured_at
              : null,
        previousGuestName:
          typeof m.previousGuestName === 'string'
            ? m.previousGuestName
            : typeof m.previous_guest_name === 'string'
              ? m.previous_guest_name
              : null,
        documentNumber:
          typeof m.documentNumber === 'string'
            ? m.documentNumber
            : typeof m.document_number === 'string'
              ? m.document_number
              : null,
      };
    }
  }

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
    returningGuest,
  };
}

type EnrichSource = {
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

export function enrichKbsParsedFromSources(
  raw: ParsedDocument | Record<string, unknown> | null | undefined,
  source?: EnrichSource | null
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
    base?.firstName && !baseIsPlaceholder ? base.firstName : str(guest?.first_name) ?? base?.firstName ?? null;
  const lastName =
    base?.lastName && !baseIsPlaceholder ? base.lastName : str(guest?.last_name) ?? base?.lastName ?? null;
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
    returningGuest: base?.returningGuest,
  };
}

export function isKbsReturningGuest(parsed: ParsedDocument | null | undefined): boolean {
  if (!parsed) return false;
  if (parsed.returningGuest) return true;
  const w = parsed.warnings;
  return Array.isArray(w) && (w.includes('returning_guest') || w.includes('duplicate_identity'));
}

export function formatKbsReturningGuestWarning(
  parsed: ParsedDocument | null | undefined
): string | null {
  if (!isKbsReturningGuest(parsed)) return null;
  const meta = parsed?.returningGuest;
  const when = meta?.previousCapturedAt
    ? new Date(meta.previousCapturedAt).toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;
  const who = meta?.previousGuestName?.trim() || null;
  const doc = meta?.documentNumber?.trim() || null;
  const parts = ['Bu pasaport / kimlik daha önce sisteme eklendi — daha önce geldi.'];
  if (who) parts.push(`Önceki kayıt: ${who}`);
  if (when) parts.push(`Tarih: ${when}`);
  if (doc) parts.push(`Belge no: ${doc}`);
  return parts.join(' ');
}

export function buildKbsCopyFields(
  parsed: ParsedDocument | null | undefined,
  opts?: { showEmpty?: boolean }
): KbsCopyField[] {
  if (!parsed) return [];
  const showEmpty = opts?.showEmpty === true;
  const out: KbsCopyField[] = [];
  const push = (key: string, label: string, raw: string | null | undefined) => {
    const value = str(raw);
    if (value) out.push({ key, label, value });
    else if (showEmpty) out.push({ key, label, value: '—' });
  };

  push('lastName', 'Soyad', isUsablePersonName(parsed.lastName) ? parsed.lastName : null);
  push('firstName', 'Ad', isUsablePersonName(parsed.firstName) ? parsed.firstName : null);
  push('middleName', 'İkinci ad', parsed.middleName);
  push('fullName', 'Tam ad', kbsDisplayFullName(parsed));

  push('documentNumber', 'Kimlik / pasaport no', parsed.documentNumber);
  push('documentSeries', 'Seri no', parsed.documentSeries);
  push('personalNumber', 'Kişisel / ulusal no', parsed.personalNumber);

  push('birthDate', 'Doğum tarihi', formatKbsTrDate(parsed.birthDate) ?? parsed.birthDate);
  push('placeOfBirth', 'Doğum yeri', parsed.placeOfBirth);

  const age = kbsAgeYearsFromBirthDate(parsed.birthDate);
  push('age', 'Yaş', age != null ? String(age) : null);

  push(
    'nationalityCode',
    'Ülke / Uyruk',
    formatKbsNationality(parsed.nationalityCode) ?? parsed.nationalityCode
  );
  push(
    'issuingCountryCode',
    'Veren ülke',
    formatKbsNationality(parsed.issuingCountryCode) ?? parsed.issuingCountryCode
  );
  push('expiryDate', 'Son geçerlilik', formatKbsTrDate(parsed.expiryDate) ?? parsed.expiryDate);

  push('gender', 'Cinsiyet', parsed.gender ? GENDER_LABEL[parsed.gender] ?? parsed.gender : null);
  push(
    'maritalStatus',
    'Medeni hal',
    parsed.maritalStatus ? MARITAL_LABEL[parsed.maritalStatus] ?? parsed.maritalStatus : null
  );
  push('motherName', 'Anne adı', isUsablePersonName(parsed.motherName) ? parsed.motherName : null);
  push('fatherName', 'Baba adı', isUsablePersonName(parsed.fatherName) ? parsed.fatherName : null);

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

  return out;
}

function isPlausibleDocNo(docNumber: string | null | undefined, documentType?: string | null): boolean {
  const raw = (docNumber ?? '').trim().toUpperCase();
  if (!raw) return false;
  const digits = raw.replace(/\D/g, '');
  if (/^[1-9]\d{10}$/.test(digits) && !/[A-Z]/.test(raw.replace(/[^A-Z0-9]/g, ''))) return true;
  if (/^99\d{9}$/.test(digits) && !/[A-Z]/.test(raw.replace(/[^A-Z0-9]/g, ''))) return true;
  const alnum = raw.replace(/[^A-Z0-9]/g, '');
  if (alnum.length < 5 || alnum.length > 14) return false;
  if (/[A-Z]/.test(alnum) && /\d/.test(alnum) && alnum.length >= 5) return true;
  if (/^\d{6,14}$/.test(digits)) return true;
  if (documentType === 'passport' && alnum.length >= 5) return true;
  return false;
}

export function listCoreMissingIdFields(parsed: ParsedDocument): string[] {
  const missing: string[] = [];
  if (!isUsablePersonName(parsed.firstName)) missing.push('Ad');
  if (!isUsablePersonName(parsed.lastName)) missing.push('Soyad');
  if (!isPlausibleDocNo(parsed.documentNumber, parsed.documentType)) {
    missing.push('Kimlik / pasaport no');
  }
  if (!parsed.birthDate) missing.push('Doğum tarihi');
  if (!parsed.nationalityCode) missing.push('Uyruk');
  if (!parsed.expiryDate) missing.push('Son kullanım tarihi');
  return missing;
}

export function isKbsCaptureOcrCoreComplete(parsed: ParsedDocument | null | undefined): boolean {
  if (!parsed) return false;
  return listCoreMissingIdFields(parsed).length === 0;
}

export function kbsCaptureHasReadableData(parsed: ParsedDocument | null | undefined): boolean {
  if (!parsed) return false;
  if (isUsablePersonName(parsed.firstName) || isUsablePersonName(parsed.lastName)) return true;
  if (isPlausibleDocNo(parsed.documentNumber, parsed.documentType)) return true;
  if (parsed.birthDate || parsed.expiryDate || parsed.nationalityCode) return true;
  if (parsed.rawMrz) return true;
  if (isUsablePersonName(parsed.motherName) || isUsablePersonName(parsed.fatherName)) return true;
  if (parsed.gender === 'M' || parsed.gender === 'F' || parsed.gender === 'X') return true;
  return false;
}

function isKbsOcrInProgress(parsed: ParsedDocument | null | undefined): boolean {
  if (isKbsCaptureOcrCoreComplete(parsed)) return false;
  const w = parsed?.warnings;
  return Array.isArray(w) && (w.includes('ocr_pending') || w.includes('ocr_processing'));
}

function isKbsOcrFailed(parsed: ParsedDocument | null | undefined): boolean {
  const w = parsed?.warnings;
  return Array.isArray(w) && w.includes('ocr_failed');
}

function isKbsOcrManualReview(parsed: ParsedDocument | null | undefined): boolean {
  const w = parsed?.warnings;
  return Array.isArray(w) && w.includes('ocr_manual_review');
}

function isKbsOcrPartial(parsed: ParsedDocument | null | undefined): boolean {
  const w = parsed?.warnings;
  return Array.isArray(w) && w.includes('ocr_partial');
}

function listMissingFromWarnings(parsed: ParsedDocument | null | undefined): string[] {
  const w = parsed?.warnings;
  if (!Array.isArray(w)) return [];
  const tag = w.find((x) => typeof x === 'string' && x.startsWith('missing_fields:'));
  if (!tag) return [];
  return tag
    .slice('missing_fields:'.length)
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

export type KbsCaptureCardStatus = { label: string; tone: 'ok' | 'muted' | 'progress' | 'warn' };

export function kbsCaptureCardStatus(
  parsed: ParsedDocument | null | undefined,
  opts?: { ocrStatus?: string | null; activelyReading?: boolean }
): KbsCaptureCardStatus {
  if (!parsed && !opts?.ocrStatus) return { label: 'Okunamadı', tone: 'muted' };
  const ocrStatus = (opts?.ocrStatus ?? '').trim().toLowerCase();
  const missingOf = (p: ParsedDocument) => {
    const fromWarn = listMissingFromWarnings(p);
    return fromWarn.length > 0 ? fromWarn : listCoreMissingIdFields(p);
  };
  const partialLabel = (p: ParsedDocument): KbsCaptureCardStatus => {
    const missing = missingOf(p);
    return {
      label: missing.length ? `Eksik · ${missing.slice(0, 2).join(', ')}` : 'Eksik',
      tone: 'warn',
    };
  };

  if (ocrStatus === 'succeeded' || (parsed && isKbsCaptureOcrCoreComplete(parsed))) {
    return { label: 'Tamam', tone: 'ok' };
  }
  if (ocrStatus === 'manual_review' || (parsed && isKbsOcrManualReview(parsed))) {
    const missing = parsed ? missingOf(parsed) : [];
    return {
      label: missing.length ? `Manuel · ${missing.slice(0, 2).join(', ')}` : 'Manuel kontrol',
      tone: 'warn',
    };
  }
  const dbInProgress =
    ocrStatus === 'queued' || ocrStatus === 'processing' || ocrStatus === 'retry_wait';
  const flagInProgress = parsed ? isKbsOcrInProgress(parsed) : false;
  const looksBusy = dbInProgress || flagInProgress;

  if (looksBusy && opts?.activelyReading === true) {
    if (parsed && kbsCaptureHasReadableData(parsed)) {
      const missing = listCoreMissingIdFields(parsed);
      return {
        label: missing.length ? `Okunuyor · ${missing.slice(0, 2).join(', ')}` : 'Okunuyor…',
        tone: 'progress',
      };
    }
    return { label: 'Okunuyor…', tone: 'progress' };
  }

  if (ocrStatus === 'partial' || (parsed && (kbsCaptureHasReadableData(parsed) || isKbsOcrPartial(parsed)))) {
    return partialLabel(parsed!);
  }
  if (ocrStatus === 'failed_terminal' || (parsed && isKbsOcrFailed(parsed))) {
    return { label: 'Okunamadı', tone: 'muted' };
  }
  if (looksBusy || !parsed || !kbsCaptureHasReadableData(parsed)) {
    return { label: 'Okunamadı', tone: 'muted' };
  }
  return { label: 'Okunamadı', tone: 'muted' };
}

/** Bir satırdan (payload + sütunlar) zenginleştirilmiş temiz parsed üretir. */
export function parseRow(row: KbsCapturedDocumentRow, guest?: EnrichSource['guest']): ParsedDocument | null {
  return enrichKbsParsedFromSources(row.parsed_payload, {
    document_number: row.document_number,
    nationality_code: row.nationality_code,
    issuing_country_code: row.issuing_country_code,
    expiry_date: row.expiry_date,
    document_type: row.document_type,
    guest: guest ?? null,
  });
}
