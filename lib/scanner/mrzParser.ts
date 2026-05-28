import { parse } from 'mrz';
import type { ParsedDocument } from './types';
import { mrzSixDigitsToIso } from './mrzDates';
import { finalizeMrzPersonNames } from '@/lib/scanner/mrzPersonNames';

function cleanMrz(raw: string): string {
  return raw
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

function mapMrzSex(v: unknown): 'M' | 'F' | 'X' | null {
  if (v == null) return null;
  const s = String(v).toLowerCase();
  if (s === 'm' || s === 'male') return 'M';
  if (s === 'f' || s === 'female') return 'F';
  if (s === 'x' || s === '<' || s === 'nonspecified') return 'X';
  return null;
}

function digitsOnly(v: string | null | undefined): string {
  return v ? String(v).replace(/\D/g, '') : '';
}

function isTurkishTc(d: string): boolean {
  if (!/^[1-9]\d{10}$/.test(d)) return false;
  const digits = d.split('').map((c) => Number(c));
  if (digits.some((n) => Number.isNaN(n))) return false;
  let odd = 0;
  let even = 0;
  for (let i = 0; i < 9; i++) {
    if (i % 2 === 0) odd += digits[i]!;
    else even += digits[i]!;
  }
  const tenth = ((odd * 7 - even) % 10 + 10) % 10;
  if (digits[9] !== tenth) return false;
  const eleventh = digits.slice(0, 10).reduce((sum, n) => sum + n, 0) % 10;
  return digits[10] === eleventh;
}

function isYkn(d: string): boolean {
  return /^99\d{9}$/.test(d);
}

/** T.C. kimlik MRZ satırındaki kart seri no (harf+rakam); birleşik OCR alanını ayırır. */
/** TD1 satır 1: I<TUR sonrası 9 karakterlik kart seri no. */
function serialFromTd1MrzLine(rawMrz: string): string | null {
  const line1 = rawMrz.split('\n')[0]?.trim() ?? '';
  const m =
    line1.match(/^I<[A-Z]{3}([A-Z0-9]{9})/i) ??
    line1.replace(/</g, '').match(/^I[A-Z]{3}([A-Z0-9]{9})/i);
  return m?.[1]?.toUpperCase() ?? null;
}

function turkishIdCardSerial(mrzDocNo: string | null, tc: string | null, rawMrz?: string): string | null {
  if (rawMrz) {
    const fromLine = serialFromTd1MrzLine(rawMrz);
    if (fromLine) return fromLine;
  }
  if (!mrzDocNo) return null;
  const compact = mrzDocNo.replace(/</g, '').trim();
  if (!compact) return null;
  if (tc) {
    const idx = compact.indexOf(tc);
    if (idx > 0) {
      const prefix = compact.slice(0, idx);
      const m = prefix.match(/^[A-Z]{1,3}\d{5,11}/i);
      if (m) return m[0]!.toUpperCase();
    }
  }
  const serialMatch = compact.match(/^[A-Z]{1,3}\d{5,9}/i);
  if (serialMatch) return serialMatch[0]!.toUpperCase();
  return compact.length <= 12 && /[A-Z]/i.test(compact) ? compact.toUpperCase() : null;
}

function collectElevenDigitCandidates(...blobs: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const blob of blobs) {
    if (!blob) continue;
    const digits = String(blob).replace(/</g, '').replace(/\D/g, '');
    for (let i = 0; i + 11 <= digits.length; i++) {
      out.add(digits.slice(i, i + 11));
    }
  }
  return [...out];
}

function detectDocumentType(res: { format?: string; fields?: Record<string, unknown> }): ParsedDocument['documentType'] {
  const docTypeRaw = String(res?.format ?? '').toLowerCase();
  const code = String(res?.fields?.documentCode ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');

  if (docTypeRaw.includes('td3') || code === 'P') return 'passport';
  if (docTypeRaw.includes('td1') || docTypeRaw.includes('td2') || code === 'I' || code === 'A' || code === 'C') {
    return 'id_card';
  }
  return 'other';
}

function isTurkishDocument(nationality: string | null, issuing: string | null): boolean {
  const nat = (nationality ?? '').toUpperCase();
  const iss = (issuing ?? '').toUpperCase();
  return nat === 'TUR' || nat === 'TR' || iss === 'TUR' || iss === 'TR';
}

/** MRZ kimlik no: pasaport → belge no; T.C. kimlik → TC; yabancı kimlik → belge no. */
function resolveMrzDocumentNumber(args: {
  documentType: ParsedDocument['documentType'];
  fields: Record<string, unknown>;
  nationalityCode: string | null;
  issuingCountryCode: string | null;
  rawMrz: string;
}): { documentNumber: string | null; documentSeries: string | null } {
  const { documentType, fields, nationalityCode, issuingCountryCode, rawMrz } = args;
  const mrzDocNo = fields.documentNumber ? String(fields.documentNumber).replace(/</g, '').trim() : null;
  const mrzDocDigits = digitsOnly(mrzDocNo);
  const mrzDocHasLetters = mrzDocNo ? /[A-Z]/i.test(mrzDocNo) : false;

  const optionalBlobs = [fields.optional1, fields.optional2, fields.personalNumber].map((v) =>
    v == null ? null : String(v)
  );
  const rawEleven = collectElevenDigitCandidates(rawMrz);
  const optionalEleven = collectElevenDigitCandidates(...optionalBlobs);
  const docEleven = mrzDocHasLetters ? [] : collectElevenDigitCandidates(mrzDocNo);
  const tcCandidates = [...optionalEleven, ...rawEleven, ...docEleven].filter(isTurkishTc);
  const yknCandidates = [...optionalEleven, ...rawEleven, ...docEleven].filter(isYkn);

  if (documentType === 'passport') {
    return { documentNumber: mrzDocNo, documentSeries: null };
  }

  const turkish = isTurkishDocument(nationalityCode, issuingCountryCode);

  if (documentType === 'id_card') {
    const ykn = yknCandidates[0] ?? (isYkn(mrzDocDigits) ? mrzDocDigits : null);
    if (ykn) {
      return { documentNumber: ykn, documentSeries: mrzDocNo && mrzDocDigits !== ykn ? mrzDocNo : null };
    }

    if (turkish) {
      const tc = tcCandidates[0] ?? (!mrzDocHasLetters && isTurkishTc(mrzDocDigits) ? mrzDocDigits : null);
      const serial = turkishIdCardSerial(mrzDocNo, tc, rawMrz);
      return {
        documentNumber: tc ?? (mrzDocHasLetters ? null : mrzDocNo),
        documentSeries: serial,
      };
    }

    return { documentNumber: mrzDocNo, documentSeries: null };
  }

  const tc = tcCandidates[0];
  if (tc) return { documentNumber: tc, documentSeries: mrzDocNo };
  const ykn = yknCandidates[0];
  if (ykn) return { documentNumber: ykn, documentSeries: null };

  return { documentNumber: mrzDocNo, documentSeries: null };
}

export function parseMrzToNormalized(rawMrz: string): ParsedDocument {
  const raw = cleanMrz(rawMrz);
  const warnings: string[] = [];

  try {
    const res: any = parse(raw);
    const fields = (res?.fields ?? {}) as Record<string, unknown>;

    const documentType = detectDocumentType(res);

    const firstNameRaw = fields.firstName ?? fields.givenNames ?? null;
    const lastNameRaw = fields.lastName ?? fields.surname ?? null;
    const fullNameRaw = fields.name ? String(fields.name) : null;

    const issuingRaw =
      fields.issuingState ?? fields.issuingCountry ?? fields.issuer ?? null;
    const issuingCountryCode = issuingRaw ? String(issuingRaw).toUpperCase() : null;
    const nationalityCode = fields.nationality ? String(fields.nationality).toUpperCase() : null;

    const names = finalizeMrzPersonNames({
      firstNameRaw: firstNameRaw ? String(firstNameRaw) : null,
      lastNameRaw: lastNameRaw ? String(lastNameRaw) : null,
      fullNameRaw,
      rawMrz: raw,
      nationalityCode,
      issuingCountryCode,
    });

    const { documentNumber, documentSeries } = resolveMrzDocumentNumber({
      documentType,
      fields,
      nationalityCode,
      issuingCountryCode,
      rawMrz: raw,
    });

    if (documentType === 'id_card' && isTurkishDocument(nationalityCode, issuingCountryCode)) {
      const tcDigits = digitsOnly(documentNumber);
      if (!isTurkishTc(tcDigits)) {
        warnings.push('T.C. kimlik MRZ’de bulunamadı; belge numarasını kontrol edin.');
      }
    }

    const checksumsValid =
      typeof res?.valid === 'boolean' ? res.valid : typeof res?.validCheckDigits === 'boolean' ? res.validCheckDigits : null;
    if (checksumsValid === false) warnings.push('MRZ checksum validation failed');

    const nat = String(fields.nationality ?? '').toUpperCase();
    const gcc = new Set(['OMN', 'SAU', 'QAT', 'KWT', 'ARE', 'BHR', 'YEM', 'IRQ', 'IRN', 'JOR', 'LBN', 'SYR', 'PSE']);
    if (nat && gcc.has(nat)) {
      warnings.push(
        'Körfez / Arap pasaportu: MRZ ad sırası farklı olabilir; KBS’e göndermeden ad-soyadı ekranda kontrol edin.'
      );
    }

    const birthRaw = fields.birthDate ? String(fields.birthDate) : null;
    const expiryRaw = fields.expirationDate ? String(fields.expirationDate) : null;

    const birthDate = birthRaw && /^\d{6}$/.test(birthRaw) ? mrzSixDigitsToIso(birthRaw, 'birth') : birthRaw;
    const expiryDate = expiryRaw && /^\d{6}$/.test(expiryRaw) ? mrzSixDigitsToIso(expiryRaw, 'expiry') : expiryRaw;

    return {
      documentType,
      fullName: names.fullName,
      firstName: names.firstName,
      lastName: names.lastName,
      middleName: names.middleName,
      documentNumber,
      nationalityCode,
      issuingCountryCode,
      birthDate,
      expiryDate,
      gender: mapMrzSex(fields.sex),
      rawMrz: raw,
      confidence: null,
      checksumsValid,
      warnings,
      documentSeries,
    };
  } catch {
    return {
      documentType: 'other',
      fullName: null,
      firstName: null,
      lastName: null,
      middleName: null,
      documentNumber: null,
      nationalityCode: null,
      issuingCountryCode: null,
      birthDate: null,
      expiryDate: null,
      gender: null,
      rawMrz: raw,
      confidence: null,
      checksumsValid: null,
      warnings: ['MRZ parse failed'],
      documentSeries: null,
    };
  }
}
