import {
  extractPassportNamesFromOcr,
  extractNamesFromOcr,
} from '@/lib/guestScan/idCardOcrParser';
import { coalescePersonName, isUsablePersonName, sanitizePersonName } from '@/lib/guestScan/personNameUtils';
import {
  finalizeMrzPersonNames,
  mrzNamesLookSwapped,
  mrzNamesLookValid,
  parseChevronNamesFromMrz,
  stripSurnameFromGivenNames,
  trimMrzPersonNameTokens,
} from '@/lib/scanner/mrzPersonNames';
import type { ParsedDocument } from '@/lib/scanner/types';

function buildNameResult(
  firstName: string | null,
  lastName: string | null
): { firstName: string | null; lastName: string | null; fullName: string | null } {
  const ln = trimMrzPersonNameTokens(lastName, { role: 'surname' }) ?? sanitizePersonName(lastName);
  const fn = trimMrzPersonNameTokens(firstName, { role: 'given' }) ?? sanitizePersonName(firstName);
  const stripped = stripSurnameFromGivenNames(fn, ln);
  return {
    firstName: stripped.firstName,
    lastName: stripped.lastName,
    fullName: [stripped.firstName, stripped.lastName].filter(Boolean).join(' ').trim() || null,
  };
}

/** Pasaport / MRZ — MRZ chevron öncelikli; görsel OCR yalnızca yedek. */
export function resolveBestPassportNames(args: {
  parsed: ParsedDocument;
  ocrLines: string[];
}): { firstName: string | null; lastName: string | null; fullName: string | null } {
  const chevron = parseChevronNamesFromMrz(args.parsed.rawMrz);

  if (isUsablePersonName(chevron.surname) && isUsablePersonName(chevron.given)) {
    return buildNameResult(chevron.given, chevron.surname);
  }

  const finalized = finalizeMrzPersonNames({
    firstNameRaw: args.parsed.firstName,
    lastNameRaw: args.parsed.lastName,
    fullNameRaw: args.parsed.fullName,
    rawMrz: args.parsed.rawMrz,
    nationalityCode: args.parsed.nationalityCode,
    issuingCountryCode: args.parsed.issuingCountryCode,
  });

  if (isUsablePersonName(chevron.surname)) {
    const firstName = coalescePersonName(chevron.given, finalized.firstName);
    return buildNameResult(firstName, chevron.surname);
  }

  if (mrzNamesLookValid(finalized.firstName, finalized.lastName)) {
    return {
      firstName: finalized.firstName,
      lastName: finalized.lastName,
      fullName: finalized.fullName,
    };
  }

  const visualPassport = extractPassportNamesFromOcr(args.ocrLines);
  if (isUsablePersonName(visualPassport.firstName) && isUsablePersonName(visualPassport.lastName)) {
    return buildNameResult(visualPassport.firstName, visualPassport.lastName);
  }

  const visualId = extractNamesFromOcr(args.ocrLines);
  if (isUsablePersonName(visualId.firstName) && isUsablePersonName(visualId.lastName)) {
    return buildNameResult(visualId.firstName, visualId.lastName);
  }

  if (
    mrzNamesLookSwapped(finalized.firstName, finalized.lastName) &&
    isUsablePersonName(finalized.lastName) &&
    isUsablePersonName(finalized.firstName)
  ) {
    return buildNameResult(finalized.lastName, finalized.firstName);
  }

  return {
    firstName: finalized.firstName,
    lastName: finalized.lastName,
    fullName: finalized.fullName,
  };
}

export function applyBestPassportNamesToParsed(
  parsed: ParsedDocument,
  lines: string[]
): ParsedDocument {
  const hasMrzChevron = !!parsed.rawMrz?.includes('<<');
  const isPassport =
    parsed.documentType === 'passport' || !!parsed.rawMrz || lines.join(' ').toUpperCase().includes('PASSPORT');
  const isMrzIdCard = parsed.documentType === 'id_card' && hasMrzChevron;
  if (!isPassport && !isMrzIdCard) return parsed;

  const chevron = parseChevronNamesFromMrz(parsed.rawMrz);
  if (isUsablePersonName(chevron.surname) && isUsablePersonName(chevron.given)) {
    const best = buildNameResult(chevron.given, chevron.surname);
    return {
      ...parsed,
      firstName: best.firstName,
      lastName: best.lastName,
      fullName: best.fullName,
    };
  }

  const best = resolveBestPassportNames({ parsed, ocrLines: lines });
  if (!isUsablePersonName(best.firstName) || !isUsablePersonName(best.lastName)) {
    return parsed;
  }
  return {
    ...parsed,
    firstName: best.firstName,
    lastName: best.lastName,
    fullName: best.fullName,
  };
}
