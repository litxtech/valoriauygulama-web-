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
    returningGuest:
      inner.returningGuest && typeof inner.returningGuest === 'object'
        ? (inner.returningGuest as ParsedDocument['returningGuest'])
        : undefined,
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
    (base?.firstName && !baseIsPlaceholder ? base.firstName : str(guest?.first_name) ?? base?.firstName) ?? null;
  const lastName =
    (base?.lastName && !baseIsPlaceholder ? base.lastName : str(guest?.last_name) ?? base?.lastName) ?? null;
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

/**
 * Kimlik bilgileri — tüm alanlar etiket + değer.
 * @param showEmpty true ise boş alanlar da "—" ile listelenir (detay ekranı).
 */
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

  push('nationalityCode', 'Ülke / Uyruk', formatKbsNationality(parsed.nationalityCode) ?? parsed.nationalityCode);
  push(
    'issuingCountryCode',
    'Veren ülke',
    formatKbsNationality(parsed.issuingCountryCode) ?? parsed.issuingCountryCode
  );
  push('expiryDate', 'Son geçerlilik', formatKbsTrDate(parsed.expiryDate) ?? parsed.expiryDate);

  push(
    'gender',
    'Cinsiyet',
    parsed.gender ? GENDER_LABEL[parsed.gender] ?? parsed.gender : null
  );
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

export function isKbsOcrManualReview(
  payload: ParsedDocument | Record<string, unknown> | null | undefined
): boolean {
  const w = (payload as ParsedDocument | null)?.warnings;
  return Array.isArray(w) && w.includes('ocr_manual_review');
}

export function isKbsOcrPartial(
  payload: ParsedDocument | Record<string, unknown> | null | undefined
): boolean {
  const w = (payload as ParsedDocument | null)?.warnings;
  return Array.isArray(w) && w.includes('ocr_partial');
}

export function isKbsOcrInProgress(
  payload: ParsedDocument | Record<string, unknown> | null | undefined
): boolean {
  // Çekirdek tamamsa bayrak bayat — "Okunuyor" göstermeyelim.
  if (isKbsCaptureOcrCoreComplete(payload)) return false;
  return isKbsOcrPending(payload) || isKbsOcrProcessing(payload);
}

/** Eksik alan listesini payload uyarılarına yaz (UI / recovery). */
export function withMissingFieldWarnings(parsed: ParsedDocument): ParsedDocument {
  const missing = listCoreMissingIdFields(parsed);
  const cleaned = (parsed.warnings ?? []).filter(
    (w) =>
      w !== 'ocr_pending' &&
      w !== 'ocr_processing' &&
      !w.startsWith('missing_fields:')
  );
  if (missing.length === 0) {
    return { ...parsed, warnings: cleaned };
  }
  return {
    ...parsed,
    warnings: [...cleaned, `missing_fields:${missing.join('|')}`],
  };
}

export function readMissingFieldsFromWarnings(
  payload: ParsedDocument | Record<string, unknown> | null | undefined
): string[] {
  const w = (payload as ParsedDocument | null)?.warnings;
  if (!Array.isArray(w)) return [];
  const tag = w.find((x) => typeof x === 'string' && x.startsWith('missing_fields:'));
  if (!tag) return [];
  return tag
    .slice('missing_fields:'.length)
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Gerçek kimlik alanı var mı — documentType tek başına yeterli sayılmaz.
 * Ad, soyad, belge no, doğum, uyruk, son geçerlilik, MRZ veya ebeveyn adı.
 */
export function kbsCaptureHasReadableData(
  payload: ParsedDocument | Record<string, unknown> | null | undefined
): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as ParsedDocument;
  if (isUsablePersonName(p.firstName) || isUsablePersonName(p.lastName)) return true;
  if (hasPlausibleKbsDocumentNumber(p.documentNumber, p.documentType)) return true;
  if (p.birthDate || p.expiryDate || p.nationalityCode) return true;
  if (p.rawMrz) return true;
  if (isUsablePersonName(p.motherName) || isUsablePersonName(p.fatherName)) return true;
  if (p.gender === 'M' || p.gender === 'F' || p.gender === 'X') return true;
  return false;
}

/** Kısmi okuma: en az bir alan var ama çekirdek tamam değil. */
export function kbsCaptureIsPartialReadable(
  payload: ParsedDocument | Record<string, unknown> | null | undefined
): boolean {
  if (!payload || typeof payload !== 'object') return false;
  if (isKbsCaptureOcrCoreComplete(payload)) return false;
  return kbsCaptureHasReadableData(payload);
}

export type KbsCaptureCardStatus = {
  label: string;
  tone: 'ok' | 'muted' | 'warn' | 'progress';
};

/**
 * Liste/detay rozeti — Tamam / Eksik / Manuel kontrol / Okunuyor / Okunamadı.
 * `activelyReading`: yalnız gerçek cihaz kuyruğundayken "Okunuyor" göster (bayat bayrakta takılı kalmasın).
 */
export function kbsCaptureCardStatus(
  parsed: ParsedDocument | null | undefined,
  opts?: { ocrStatus?: string | null; activelyReading?: boolean }
): KbsCaptureCardStatus | null {
  if (!parsed && !opts?.ocrStatus) return null;
  const ocrStatus = (opts?.ocrStatus ?? '').trim().toLowerCase();
  const missingOf = (p: ParsedDocument) => {
    const fromWarn = readMissingFieldsFromWarnings(p);
    return fromWarn.length > 0 ? fromWarn : listCoreMissingIdFields(p);
  };
  const partialLabel = (p: ParsedDocument): KbsCaptureCardStatus => {
    const missing = missingOf(p);
    return {
      label: missing.length ? `Eksik · ${missing.slice(0, 2).join(', ')}` : 'Eksik',
      tone: 'warn',
    };
  };

  if (parsed && isKbsTcOnlyCapture(parsed) && parsed.documentNumber) {
    return { label: 'T.C.', tone: 'ok' };
  }

  const coreOk = parsed ? isKbsCaptureOcrCoreComplete(parsed) : false;
  if (ocrStatus === 'succeeded' || coreOk) {
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

  // "Okunuyor" yalnız gerçekten kuyruktayken — aksi halde kesin durum.
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

  // Bayat queued/processing bayrağı veya hiç okunmamış boş kayıt
  if (looksBusy || !parsed || !kbsCaptureHasReadableData(parsed)) {
    return { label: 'Okunamadı', tone: 'muted' };
  }

  return null;
}

/** Boş / eksik / takılı — otomatik okuma adayı mı? */
export function needsKbsCaptureOcrRead(
  parsed: ParsedDocument | null | undefined,
  opts?: { ocrStatus?: string | null }
): boolean {
  if (isKbsCaptureOcrCoreComplete(parsed) || isKbsOcrManualReview(parsed)) return false;
  const ocrStatus = (opts?.ocrStatus ?? '').trim().toLowerCase();
  if (ocrStatus === 'succeeded' || ocrStatus === 'manual_review') return false;
  if (!kbsCaptureHasReadableData(parsed)) return true;
  if (isKbsOcrFailed(parsed) || isKbsOcrPartial(parsed) || isKbsOcrInProgress(parsed)) return true;
  if (
    ocrStatus === 'queued' ||
    ocrStatus === 'processing' ||
    ocrStatus === 'retry_wait' ||
    ocrStatus === 'partial' ||
    ocrStatus === 'failed_terminal'
  ) {
    return true;
  }
  return !isKbsCaptureOcrCoreComplete(parsed) && kbsCaptureIsPartialReadable(parsed);
}

export function kbsOcrStatusLabel(
  payload: ParsedDocument | Record<string, unknown> | null | undefined
): 'pending' | 'processing' | 'ready' | 'partial' | 'manual_review' | 'failed' | 'empty' {
  if (!payload || typeof payload !== 'object') return 'empty';
  if (isKbsOcrProcessing(payload)) return 'processing';
  if (isKbsOcrPending(payload)) return 'pending';
  if (isKbsOcrManualReview(payload)) return 'manual_review';
  if (isKbsCaptureOcrCoreComplete(payload)) return 'ready';
  if (kbsCaptureHasReadableData(payload) || isKbsOcrPartial(payload)) return 'partial';
  if (isKbsOcrFailed(payload)) return 'failed';
  return 'empty';
}
