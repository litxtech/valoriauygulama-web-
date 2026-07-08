import type { ParsedDocument } from '@/lib/scanner/types';
import { finalizeMrzPersonNames } from '@/lib/scanner/mrzPersonNames';
import { finalizeNfcParsedDocument } from '@/lib/nfcFinalizeParsed';

function filled(v: string | null | undefined): v is string {
  return v != null && String(v).trim().length > 0;
}

/** NFC çip verisi eksikse kamera MRZ kilidinden alanları tamamlar. */
export function mergeParsedDocuments(
  primary: ParsedDocument,
  fallback: ParsedDocument,
  opts?: { rawMrzFallback?: string | null }
): ParsedDocument {
  const rawMrz = primary.rawMrz ?? fallback.rawMrz ?? opts?.rawMrzFallback ?? null;
  const nationalityCode = filled(primary.nationalityCode) ? primary.nationalityCode : fallback.nationalityCode;
  const issuingCountryCode = filled(primary.issuingCountryCode)
    ? primary.issuingCountryCode
    : fallback.issuingCountryCode;

  const names = finalizeMrzPersonNames({
    firstNameRaw: filled(primary.firstName) ? primary.firstName : fallback.firstName,
    lastNameRaw: filled(primary.lastName) ? primary.lastName : fallback.lastName,
    fullNameRaw: filled(primary.fullName) ? primary.fullName : fallback.fullName,
    rawMrz,
    nationalityCode,
    issuingCountryCode,
  });

  const warnings = [...new Set([...(primary.warnings ?? []), ...(fallback.warnings ?? [])])];
  const usedFallback =
    (!filled(primary.firstName) && filled(fallback.firstName)) ||
    (!filled(primary.documentNumber) && filled(fallback.documentNumber));
  if (usedFallback && !warnings.includes('nfc_mrz_lock_fill')) {
    warnings.push('nfc_mrz_lock_fill');
  }

  return finalizeNfcParsedDocument({
    documentType: primary.documentType !== 'other' ? primary.documentType : fallback.documentType,
    fullName: names.fullName ?? primary.fullName ?? fallback.fullName,
    firstName: names.firstName ?? primary.firstName ?? fallback.firstName,
    lastName: names.lastName ?? primary.lastName ?? fallback.lastName,
    middleName: primary.middleName ?? fallback.middleName,
    documentNumber: filled(primary.documentNumber) ? primary.documentNumber : fallback.documentNumber,
    documentSeries: primary.documentSeries ?? fallback.documentSeries,
    nationalityCode,
    issuingCountryCode,
    birthDate: filled(primary.birthDate) ? primary.birthDate : fallback.birthDate,
    expiryDate: filled(primary.expiryDate) ? primary.expiryDate : fallback.expiryDate,
    gender: primary.gender ?? fallback.gender,
    motherName: primary.motherName ?? fallback.motherName,
    fatherName: primary.fatherName ?? fallback.fatherName,
    placeOfBirth: filled(primary.placeOfBirth) ? primary.placeOfBirth : fallback.placeOfBirth,
    personalNumber: filled(primary.personalNumber) ? primary.personalNumber : fallback.personalNumber,
    maritalStatus: primary.maritalStatus ?? fallback.maritalStatus,
    rawMrz,
    confidence: Math.max(primary.confidence ?? 0, fallback.confidence ?? 0) || null,
    checksumsValid: primary.checksumsValid ?? fallback.checksumsValid,
    warnings,
  });
}
