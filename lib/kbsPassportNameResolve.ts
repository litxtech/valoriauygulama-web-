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

/** Pasaport / MRZ — görsel etiket + chevron + MRZ kütüphanesi birleşimi. */
export function resolveBestPassportNames(args: {
  parsed: ParsedDocument;
  ocrLines: string[];
}): { firstName: string | null; lastName: string | null; fullName: string | null } {
  const visualPassport = extractPassportNamesFromOcr(args.ocrLines);
  const visualId = extractNamesFromOcr(args.ocrLines);
  const chevron = parseChevronNamesFromMrz(args.parsed.rawMrz);
  const finalized = finalizeMrzPersonNames({
    firstNameRaw: args.parsed.firstName,
    lastNameRaw: args.parsed.lastName,
    fullNameRaw: args.parsed.fullName,
    rawMrz: args.parsed.rawMrz,
    nationalityCode: args.parsed.nationalityCode,
    issuingCountryCode: args.parsed.issuingCountryCode,
  });

  const visual =
    isUsablePersonName(visualPassport.firstName) && isUsablePersonName(visualPassport.lastName)
      ? visualPassport
      : isUsablePersonName(visualId.firstName) && isUsablePersonName(visualId.lastName)
        ? visualId
        : { firstName: null as string | null, lastName: null as string | null };

  // MRZ soyadı (chevron) — görsel OCR ile uzatılmaz; gürültü tokenları kesilir.
  if (args.parsed.rawMrz && isUsablePersonName(chevron.surname)) {
    const lastName =
      trimMrzPersonNameTokens(chevron.surname, { role: 'surname' }) ?? chevron.surname;

    const firstName = coalescePersonName(
      chevron.given,
      visualPassport.firstName,
      visualId.firstName,
      visual.firstName,
      finalized.firstName
    );

    return buildNameResult(firstName, lastName);
  }

  if (chevron.surname && chevron.given) {
    return buildNameResult(chevron.given, chevron.surname);
  }

  if (isUsablePersonName(visual.firstName) && isUsablePersonName(visual.lastName)) {
    return buildNameResult(visual.firstName, visual.lastName);
  }

  if (mrzNamesLookValid(finalized.firstName, finalized.lastName)) {
    return {
      firstName: finalized.firstName,
      lastName: finalized.lastName,
      fullName: finalized.fullName,
    };
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
  if (parsed.documentType === 'id_card') return parsed;

  const isPassport =
    parsed.documentType === 'passport' || !!parsed.rawMrz || lines.join(' ').toUpperCase().includes('PASSPORT');
  if (!isPassport) return parsed;

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
