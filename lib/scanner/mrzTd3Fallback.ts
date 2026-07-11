import { isKnownIcao3 } from '@/lib/kbsNationalityMap';
import { mrzSixDigitsToIso } from '@/lib/scanner/mrzDates';
import { normalizeMrzOcrLine } from '@/lib/scanner/mrzOcrNormalize';
import { finalizeMrzPersonNames } from '@/lib/scanner/mrzPersonNames';
import type { ParsedDocument } from '@/lib/scanner/types';

const TD3_LEN = 44;

/** Otel resepsiyonunda sık görülen Arap / Orta Doğu ICAO-3 kodları. */
const RECEPTION_ICAO = new Set([
  'SAU', 'ARE', 'QAT', 'OMN', 'KWT', 'BHR', 'IRQ', 'IRN', 'JOR', 'LBN', 'SYR', 'PSE', 'EGY', 'YEM',
  'TUR', 'ISR', 'CYP', 'LBY', 'TUN', 'DZA', 'MAR', 'SDN',
  'DEU', 'GBR', 'FRA', 'RUS', 'UKR', 'USA', 'IND', 'PAK', 'AFG',
]);

function isNameLine(line: string): boolean {
  const u = line.toUpperCase();
  return /^[IPAVC]<?[A-Z]{3}/.test(u) || (u.includes('<<') && /[A-Z]{4,}/.test(u) && !/^\d/.test(u));
}

function isDataLine(line: string): boolean {
  const u = line.toUpperCase();
  if (isNameLine(u)) return false;
  const digits = (u.match(/\d/g) ?? []).length;
  return digits >= 8 && u.length >= 28;
}

function findNationalityInLine(line: string): { code: string; index: number } | null {
  const upper = line.toUpperCase();
  const candidates: Array<{ code: string; index: number }> = [];

  for (let i = 0; i <= upper.length - 3; i++) {
    const tri = upper.slice(i, i + 3);
    if (!RECEPTION_ICAO.has(tri) && !isKnownIcao3(tri)) continue;
    const after = upper.slice(i + 3).replace(/^[^0-9]*/, '');
    if (!/^\d{6}/.test(after)) continue;
    candidates.push({ code: tri, index: i });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.index - b.index);
  return candidates[0]!;
}

function extractDocNumberBeforeNat(line: string, natIndex: number): string | null {
  const prefix = line.slice(0, natIndex).replace(/<+$/, '').replace(/<+/g, '');
  const m = prefix.match(/([A-Z0-9]{6,9})$/i);
  if (m?.[1]) return m[1].toUpperCase();
  const loose = prefix.match(/([A-Z][A-Z0-9]{5,8})/i);
  return loose?.[1]?.toUpperCase() ?? null;
}

function parseTd3DataFields(line: string): {
  documentNumber: string | null;
  nationalityCode: string | null;
  birthDate: string | null;
  gender: 'M' | 'F' | 'X' | null;
  expiryDate: string | null;
} | null {
  const normalized = normalizeMrzOcrLine(line);
  if (normalized.length < 24) return null;

  const natHit = findNationalityInLine(normalized);
  if (!natHit) {
    const padded = normalized.padEnd(TD3_LEN, '<').slice(0, TD3_LEN);
    const nat = padded.slice(10, 13);
    if (!RECEPTION_ICAO.has(nat) && !isKnownIcao3(nat)) return null;
    const docNo = padded.slice(0, 9).replace(/<+$/, '').trim() || null;
    const birthRaw = padded.slice(13, 19);
    const sexRaw = padded.slice(20, 21);
    const expiryRaw = padded.slice(21, 27);
    const birthDate = /^\d{6}$/.test(birthRaw) ? mrzSixDigitsToIso(birthRaw, 'birth') : null;
    const expiryDate = /^\d{6}$/.test(expiryRaw) ? mrzSixDigitsToIso(expiryRaw, 'expiry') : null;
    const gender = sexRaw === 'M' ? 'M' : sexRaw === 'F' ? 'F' : sexRaw === '<' ? 'X' : null;
    return {
      documentNumber: docNo,
      nationalityCode: nat,
      birthDate,
      gender,
      expiryDate,
    };
  }

  const { code: nationalityCode, index: natIndex } = natHit;
  const documentNumber = extractDocNumberBeforeNat(normalized, natIndex);
  const afterNat = normalized.slice(natIndex + 3).replace(/^[^0-9A-Z]*/i, '');

  const dobMatch = afterNat.match(/^(\d{6})/);
  const birthDate = dobMatch ? mrzSixDigitsToIso(dobMatch[1]!, 'birth') : null;

  const afterDob = afterNat.slice(dobMatch?.[0]?.length ?? 0).replace(/^\d/, '');
  const sexMatch = afterDob.match(/^([MFUX<])/i);
  const gender =
    sexMatch?.[1]?.toUpperCase() === 'M'
      ? 'M'
      : sexMatch?.[1]?.toUpperCase() === 'F'
        ? 'F'
        : sexMatch?.[1] === '<'
          ? 'X'
          : null;

  const afterSex = afterDob.slice(sexMatch?.[0]?.length ?? 0);
  const expMatch = afterSex.match(/(\d{6})/);
  const expiryDate = expMatch ? mrzSixDigitsToIso(expMatch[1]!, 'expiry') : null;

  return { documentNumber, nationalityCode, birthDate, gender, expiryDate };
}

function orderTd3Lines(lines: string[]): [string, string] | null {
  if (lines.length < 2) return null;
  const a = normalizeMrzOcrLine(lines[0]!);
  const b = normalizeMrzOcrLine(lines[1]!);

  if (isNameLine(a) && isDataLine(b)) return [a, b];
  if (isNameLine(b) && isDataLine(a)) return [b, a];
  if (a.includes('<<') && !b.includes('<<')) return [a, b];
  if (b.includes('<<') && !a.includes('<<')) return [b, a];
  return [a, b];
}

/**
 * OCR bozulmuş TD3 pasaport MRZ — checksum olmadan alan çıkarımı.
 * Suudi, BAE, Katar vb. Körfez pasaportlarında ML Kit boşluk/K/« hataları için.
 */
export function parseTd3MrzFallback(rawMrz: string): ParsedDocument | null {
  const lines = rawMrz
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => normalizeMrzOcrLine(l))
    .filter((l) => l.length >= 18);

  if (lines.length < 2) return null;

  const ordered = orderTd3Lines(lines);
  if (!ordered) return null;

  const [nameLine, dataLine] = ordered;
  const data = parseTd3DataFields(dataLine);
  if (!data?.documentNumber && !data?.nationalityCode) return null;

  const names = finalizeMrzPersonNames({
    firstNameRaw: null,
    lastNameRaw: null,
    rawMrz: `${nameLine}\n${dataLine}`,
    nationalityCode: data.nationalityCode,
    issuingCountryCode: data.nationalityCode,
  });

  const warnings: string[] = ['mrz_fallback_parse'];
  if (!data.documentNumber) warnings.push('document_number_uncertain');
  if (!data.birthDate) warnings.push('birth_date_uncertain');
  if (!data.expiryDate) warnings.push('expiry_date_uncertain');

  return {
    documentType: 'passport',
    fullName: names.fullName,
    firstName: names.firstName,
    lastName: names.lastName,
    middleName: names.middleName,
    documentNumber: data.documentNumber,
    nationalityCode: data.nationalityCode,
    issuingCountryCode: data.nationalityCode,
    birthDate: data.birthDate,
    expiryDate: data.expiryDate,
    gender: data.gender,
    personalNumber: null,
    rawMrz: `${nameLine}\n${dataLine}`,
    confidence: 0.55,
    checksumsValid: null,
    warnings,
    documentSeries: null,
  };
}

/** MRZ kütüphanesi sonucuna eksik pasaport alanlarını tamamlar. */
export function mergeTd3FallbackFields(
  parsed: ParsedDocument,
  rawMrz: string
): ParsedDocument {
  const needs =
    parsed.documentType === 'passport' &&
    (!parsed.documentNumber || !parsed.birthDate || !parsed.expiryDate || !parsed.nationalityCode);
  if (!needs) return parsed;

  const fallback = parseTd3MrzFallback(rawMrz);
  if (!fallback) return parsed;

  const warnings = [...new Set([...(parsed.warnings ?? []), ...(fallback.warnings ?? [])])];

  return {
    ...parsed,
    documentType: 'passport',
    documentNumber: parsed.documentNumber ?? fallback.documentNumber,
    nationalityCode: parsed.nationalityCode ?? fallback.nationalityCode,
    issuingCountryCode: parsed.issuingCountryCode ?? fallback.issuingCountryCode ?? fallback.nationalityCode,
    birthDate: parsed.birthDate ?? fallback.birthDate,
    expiryDate: parsed.expiryDate ?? fallback.expiryDate,
    gender: parsed.gender ?? fallback.gender,
    firstName: parsed.firstName ?? fallback.firstName,
    lastName: parsed.lastName ?? fallback.lastName,
    fullName: parsed.fullName ?? fallback.fullName,
    middleName: parsed.middleName ?? fallback.middleName,
    checksumsValid: parsed.checksumsValid,
    warnings,
  };
}
