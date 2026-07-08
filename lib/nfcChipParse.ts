/**
 * ePasaport NFC çip verisini ParsedDocument'e dönüştürür.
 * Android native `mrz` alanı çoğu zaman tam MRZ değil; DG1 ham verisinden MRZ çıkarılır.
 */
import { decode as decodeBase64 } from 'base64-arraybuffer';
import type { ParsedDocument } from '@/lib/scanner/types';
import { parseMrzToNormalized } from '@/lib/scanner/mrzParser';
import { isoDateToMrzSix, mrzSixDigitsToIso } from '@/lib/scanner/mrzDates';
import { finalizeMrzPersonNames } from '@/lib/scanner/mrzPersonNames';
import { extractMrzFromLinesBest } from '@/lib/scanner/mrzExtractLines';
import { extractIssuingCountryFromMrz } from '@/lib/scanner/mrzIssuingExtract';

export type NfcBacKeyInput = {
  documentNumber: string;
  birthDate: string;
  expiryDate: string;
};

export type EIdChipData = {
  birthDate?: string;
  placeOfBirth?: string;
  documentNo?: string;
  expiryDate?: string;
  firstName?: string;
  gender?: string;
  identityNo?: string;
  lastName?: string;
  mrz?: string;
  nationality?: string;
  /** DG11 veya native ek alanlar */
  issuingAuthority?: string;
  fullName?: string;
};

function mapGender(g?: string): ParsedDocument['gender'] {
  const s = String(g ?? '').trim().toUpperCase();
  if (s === 'M' || s === 'MALE') return 'M';
  if (s === 'F' || s === 'FEMALE') return 'F';
  if (s) return 'X';
  return null;
}

function isoFromChipDate(raw: string | undefined, kind: 'birth' | 'expiry'): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  if (/^\d{6}$/.test(s)) return mrzSixDigitsToIso(s, kind);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('.');
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function isoFromBacDate(raw: string, kind: 'birth' | 'expiry'): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{6}$/.test(trimmed)) return mrzSixDigitsToIso(trimmed, kind);
  return isoDateToMrzSix(trimmed) ? mrzSixDigitsToIso(isoDateToMrzSix(trimmed)!, kind) : null;
}

function collectMrzLikeLines(bytes: Uint8Array): string[] {
  const out: string[] = [];
  let current = '';
  const flush = () => {
    if (current.length >= 26) out.push(current);
    current = '';
  };

  for (const b of bytes) {
    const isMrzChar =
      (b >= 0x41 && b <= 0x5a) || (b >= 0x30 && b <= 0x39) || b === 0x3c;
    if (isMrzChar) {
      current += String.fromCharCode(b);
    } else if (b === 0x0a || b === 0x0d) {
      flush();
    } else {
      flush();
    }
  }
  flush();
  return out;
}

/** DG1 (base64) içinden ICAO MRZ satırlarını çıkarır. */
export function extractMrzFromDg1Base64(dg1Base64: string | null | undefined): string | null {
  const b64 = dg1Base64?.trim();
  if (!b64) return null;
  try {
    const bytes = new Uint8Array(decodeBase64(b64));
    const lines = collectMrzLikeLines(bytes);
    const best = extractMrzFromLinesBest(lines, { kbsRelaxed: true });
    return best?.mrz ?? null;
  } catch {
    return null;
  }
}

export function isPlausibleNfcMrz(raw: string | null | undefined): boolean {
  const s = raw?.trim() ?? '';
  if (!s) return false;
  if (!s.includes('<') && s.length < 50) return false;
  const parsed = parseMrzToNormalized(s);
  return !parsed.warnings?.some((w) => w === 'MRZ parse failed' || w.includes('parse failed'));
}

export function resolveNfcRawMrz(
  chipMrz: string | null | undefined,
  dg1Base64?: string | null
): string | null {
  const candidates = [chipMrz?.trim(), extractMrzFromDg1Base64(dg1Base64)].filter(Boolean) as string[];
  for (const raw of candidates) {
    if (isPlausibleNfcMrz(raw)) return raw;
  }
  for (const raw of candidates) {
    const parsed = parseMrzToNormalized(raw);
    if (parsed.documentNumber || parsed.firstName || parsed.lastName) return raw;
  }
  return null;
}

/** DG11 ham verisinden okunabilir metin parçaları (doğum yeri, tam ad yedek). */
function extractDg11Hints(dg11Base64: string | null | undefined): {
  placeOfBirth?: string;
  fullName?: string;
} {
  const b64 = dg11Base64?.trim();
  if (!b64) return {};
  try {
    const bytes = new Uint8Array(decodeBase64(b64));
    const chunks: string[] = [];
    let buf = '';
    for (const b of bytes) {
      const ok = (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a) || b === 0x20 || b === 0x2d || b === 0x27;
      if (ok) {
        buf += String.fromCharCode(b);
      } else if (buf.length >= 4) {
        chunks.push(buf.trim());
        buf = '';
      } else {
        buf = '';
      }
    }
    if (buf.length >= 4) chunks.push(buf.trim());

    const place =
      chunks.find((c) => /^[A-Z][A-Z\s'-]{3,40}$/.test(c) && !c.includes('<<')) ??
      chunks.find((c) => c.length >= 4 && c.length <= 48 && /[A-Z]/.test(c));
    const fullName = chunks.find((c) => c.includes(' ') && c.length >= 8 && c.length <= 64);

    return {
      placeOfBirth: place,
      fullName,
    };
  } catch {
    return {};
  }
}

function mergeChipExtras(parsed: ParsedDocument, data: EIdChipData): ParsedDocument {
  const warnings = [...(parsed.warnings ?? [])];
  if (!warnings.includes('nfc_chip')) warnings.push('nfc_chip');

  const nationalityCode = parsed.nationalityCode ?? data.nationality?.trim().toUpperCase().slice(0, 3) ?? null;
  const issuingCountryCode =
    parsed.issuingCountryCode ?? extractIssuingCountryFromMrz(parsed.rawMrz) ?? null;
  const names = finalizeMrzPersonNames({
    firstNameRaw: parsed.firstName ?? data.firstName?.trim() ?? null,
    lastNameRaw: parsed.lastName ?? data.lastName?.trim() ?? null,
    fullNameRaw: parsed.fullName ?? data.fullName?.trim() ?? null,
    rawMrz: parsed.rawMrz,
    nationalityCode,
    issuingCountryCode,
  });

  return {
    ...parsed,
    documentType: parsed.documentType !== 'other' ? parsed.documentType : 'passport',
    firstName: names.firstName ?? parsed.firstName ?? data.firstName?.trim() ?? null,
    lastName: names.lastName ?? parsed.lastName ?? data.lastName?.trim() ?? null,
    middleName: names.middleName ?? parsed.middleName,
    fullName:
      names.fullName ??
      parsed.fullName ??
      data.fullName?.trim() ??
      null,
    nationalityCode,
    issuingCountryCode,
    birthDate: parsed.birthDate ?? isoFromChipDate(data.birthDate, 'birth'),
    expiryDate: parsed.expiryDate ?? isoFromChipDate(data.expiryDate, 'expiry'),
    documentNumber:
      parsed.documentNumber ?? data.documentNo?.replace(/</g, '').trim() ?? null,
    gender: parsed.gender ?? mapGender(data.gender),
    placeOfBirth: data.placeOfBirth?.trim() || parsed.placeOfBirth || null,
    personalNumber:
      data.identityNo?.replace(/</g, '').trim() || parsed.personalNumber || null,
    confidence: Math.max(parsed.confidence ?? 0, 0.99),
    checksumsValid: parsed.checksumsValid ?? true,
    warnings,
  };
}

function parsedFromEIdChip(
  data: EIdChipData,
  bac?: NfcBacKeyInput,
  dg11?: { placeOfBirth?: string; fullName?: string }
): ParsedDocument {
  const nationalityCode = data.nationality?.trim().toUpperCase().slice(0, 3) || null;
  const names = finalizeMrzPersonNames({
    firstNameRaw: data.firstName?.trim() ?? null,
    lastNameRaw: data.lastName?.trim() ?? null,
    fullNameRaw: dg11?.fullName ?? data.fullName?.trim() ?? null,
    rawMrz: null,
    nationalityCode,
    issuingCountryCode: null,
  });

  const birthDate =
    isoFromChipDate(data.birthDate, 'birth') ??
    (bac ? isoFromBacDate(bac.birthDate, 'birth') : null);
  const expiryDate =
    isoFromChipDate(data.expiryDate, 'expiry') ??
    (bac ? isoFromBacDate(bac.expiryDate, 'expiry') : null);

  return {
    documentType: 'passport',
    fullName:
      names.fullName ||
      [names.firstName ?? data.firstName, names.lastName ?? data.lastName].filter(Boolean).join(' ').trim() ||
      null,
    firstName: names.firstName ?? data.firstName?.trim() ?? null,
    lastName: names.lastName ?? data.lastName?.trim() ?? null,
    middleName: names.middleName,
    documentNumber:
      data.documentNo?.replace(/</g, '').trim() || bac?.documentNumber.replace(/</g, '').trim() || null,
    nationalityCode,
    issuingCountryCode: null,
    birthDate,
    expiryDate,
    gender: mapGender(data.gender),
    placeOfBirth: data.placeOfBirth?.trim() || dg11?.placeOfBirth?.trim() || null,
    personalNumber: data.identityNo?.replace(/</g, '').trim() || null,
    rawMrz: null,
    confidence: 0.98,
    checksumsValid: null,
    warnings: ['nfc_chip'],
  };
}

export function mapEIdChipToParsed(
  data: EIdChipData,
  opts?: { dg1Base64?: string | null; dg11Base64?: string | null; bac?: NfcBacKeyInput }
): { parsed: ParsedDocument; rawMrz: string | null } {
  const dg11Hints = extractDg11Hints(opts?.dg11Base64);
  const rawMrz = resolveNfcRawMrz(data.mrz, opts?.dg1Base64);

  if (rawMrz) {
    const parsed = mergeChipExtras(parseMrzToNormalized(rawMrz), data);
    if (!parsed.placeOfBirth && dg11Hints.placeOfBirth) {
      parsed.placeOfBirth = dg11Hints.placeOfBirth;
    }
    return {
      parsed: { ...parsed, rawMrz },
      rawMrz,
    };
  }

  return {
    parsed: parsedFromEIdChip(data, opts?.bac, dg11Hints),
    rawMrz: null,
  };
}
