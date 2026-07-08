import type { ParsedDocument } from '@/lib/scanner/types';
import { applyBestPassportNamesToParsed } from '@/lib/kbsPassportNameResolve';
import { extractIssuingCountryFromMrz } from '@/lib/scanner/mrzIssuingExtract';
import { finalizeMrzPersonNames } from '@/lib/scanner/mrzPersonNames';

function filled(v: string | null | undefined): v is string {
  return v != null && String(v).trim().length > 0;
}

/** NFC / MRZ birleşimi sonrası eksik alanları tamamla ve adları chevron ile düzelt. */
export function finalizeNfcParsedDocument(parsed: ParsedDocument): ParsedDocument {
  const rawMrz = parsed.rawMrz;
  const issuingCountryCode =
    parsed.issuingCountryCode ?? extractIssuingCountryFromMrz(rawMrz) ?? null;

  let out: ParsedDocument = {
    ...parsed,
    issuingCountryCode,
  };

  if (rawMrz) {
    const names = finalizeMrzPersonNames({
      firstNameRaw: out.firstName,
      lastNameRaw: out.lastName,
      fullNameRaw: out.fullName,
      rawMrz,
      nationalityCode: out.nationalityCode,
      issuingCountryCode,
    });
    out = {
      ...out,
      firstName: names.firstName ?? out.firstName,
      lastName: names.lastName ?? out.lastName,
      middleName: names.middleName ?? out.middleName,
      fullName: names.fullName ?? out.fullName,
    };
  }

  const ocrLines = rawMrz ? rawMrz.split('\n').filter(Boolean) : [];
  out = applyBestPassportNamesToParsed(out, ocrLines);

  if (!filled(out.personalNumber) && filled(out.documentNumber) && out.documentType === 'id_card') {
    const digits = out.documentNumber.replace(/\D/g, '');
    if (digits.length >= 8) {
      out = { ...out, personalNumber: digits };
    }
  }

  return out;
}
