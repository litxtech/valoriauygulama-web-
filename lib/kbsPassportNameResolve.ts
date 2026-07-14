import {
  extractPassportNamesFromOcr,
  extractNamesFromOcr,
} from '@/lib/guestScan/idCardOcrParser';
import { coalescePersonName, isUsablePersonName, sanitizePersonName } from '@/lib/guestScan/personNameUtils';
import {
  finalizeMrzPersonNames,
  isGccNationality,
  mrzNameFieldLooksTruncated,
  mrzNamesLookSwapped,
  mrzNamesLookValid,
  parseChevronNamesFromMrz,
  preferCompletePersonName,
  stripSurnameFromGivenNames,
  trimMrzPersonNameTokens,
} from '@/lib/scanner/mrzPersonNames';
import type { ParsedDocument } from '@/lib/scanner/types';

function buildNameResult(
  firstName: string | null,
  lastName: string | null,
  middleName?: string | null
): { firstName: string | null; lastName: string | null; fullName: string | null } {
  const givenJoined = [firstName, middleName].filter(Boolean).join(' ').trim() || firstName;
  const ln = trimMrzPersonNameTokens(lastName, { role: 'surname' }) ?? sanitizePersonName(lastName);
  const fn = trimMrzPersonNameTokens(givenJoined, { role: 'given' }) ?? sanitizePersonName(givenJoined);
  const stripped = stripSurnameFromGivenNames(fn, ln);
  return {
    firstName: stripped.firstName,
    lastName: stripped.lastName,
    fullName: [stripped.firstName, stripped.lastName].filter(Boolean).join(' ').trim() || null,
  };
}

function mergeMrzWithVisualNames(args: {
  mrzFirst: string | null;
  mrzLast: string | null;
  visualFirst: string | null;
  visualLast: string | null;
  preferVisualWhenLonger: boolean;
}): { firstName: string | null; lastName: string | null; fullName: string | null } {
  const firstName = preferCompletePersonName(args.mrzFirst, args.visualFirst);
  const lastName = preferCompletePersonName(args.mrzLast, args.visualLast);

  // Görsel belirgin biçimde daha tam ve MRZ ile uyumlu değilse (Körfez görsel sayfa).
  if (
    args.preferVisualWhenLonger &&
    isUsablePersonName(args.visualFirst) &&
    isUsablePersonName(args.visualLast)
  ) {
    const vf = sanitizePersonName(args.visualFirst)!;
    const vl = sanitizePersonName(args.visualLast)!;
    const mf = sanitizePersonName(args.mrzFirst);
    const ml = sanitizePersonName(args.mrzLast);
    const visualWords = vf.split(/\s+/).length + vl.split(/\s+/).length;
    const mrzWords = (mf?.split(/\s+/).length ?? 0) + (ml?.split(/\s+/).length ?? 0);
    if (visualWords > mrzWords) {
      const firstOk = !mf || preferCompletePersonName(mf, vf) === vf || vf.includes(mf.split(/\s+/)[0]!);
      const lastOk = !ml || preferCompletePersonName(ml, vl) === vl || vl.includes(ml.split(/\s+/)[0]!);
      if (firstOk && lastOk) {
        return buildNameResult(vf, vl);
      }
    }
  }

  return buildNameResult(firstName, lastName);
}

/** Pasaport / MRZ — MRZ çekirdek; görsel OCR ile eksik/kesik adları tamamla (ezber yok). */
export function resolveBestPassportNames(args: {
  parsed: ParsedDocument;
  ocrLines: string[];
}): { firstName: string | null; lastName: string | null; fullName: string | null } {
  const chevron = parseChevronNamesFromMrz(args.parsed.rawMrz);
  const gcc =
    isGccNationality(args.parsed.nationalityCode) ||
    isGccNationality(args.parsed.issuingCountryCode);
  const truncated = mrzNameFieldLooksTruncated(args.parsed.rawMrz);
  const visualPassport = extractPassportNamesFromOcr(args.ocrLines);
  const visualId = extractNamesFromOcr(args.ocrLines);
  const visualFirst = coalescePersonName(visualPassport.firstName, visualId.firstName);
  const visualLast = coalescePersonName(visualPassport.lastName, visualId.lastName);
  const preferVisual = gcc || truncated;

  if (isUsablePersonName(chevron.surname) && isUsablePersonName(chevron.given)) {
    return mergeMrzWithVisualNames({
      mrzFirst: chevron.given,
      mrzLast: chevron.surname,
      visualFirst,
      visualLast,
      preferVisualWhenLonger: preferVisual,
    });
  }

  const finalized = finalizeMrzPersonNames({
    firstNameRaw: args.parsed.firstName,
    lastNameRaw: args.parsed.lastName,
    fullNameRaw: args.parsed.fullName,
    rawMrz: args.parsed.rawMrz,
    nationalityCode: args.parsed.nationalityCode,
    issuingCountryCode: args.parsed.issuingCountryCode,
  });

  const finalizedGiven = [finalized.firstName, finalized.middleName].filter(Boolean).join(' ').trim() ||
    finalized.firstName;

  if (isUsablePersonName(chevron.surname)) {
    const firstName = preferCompletePersonName(
      coalescePersonName(chevron.given, finalizedGiven),
      visualFirst
    );
    const lastName = preferCompletePersonName(chevron.surname, visualLast);
    return buildNameResult(firstName, lastName);
  }

  if (mrzNamesLookValid(finalizedGiven, finalized.lastName) || isUsablePersonName(finalizedGiven)) {
    const merged = mergeMrzWithVisualNames({
      mrzFirst: finalizedGiven,
      mrzLast: finalized.lastName,
      visualFirst,
      visualLast,
      preferVisualWhenLonger: preferVisual,
    });
    if (isUsablePersonName(merged.firstName) && isUsablePersonName(merged.lastName)) {
      return merged;
    }
    if (mrzNamesLookValid(finalizedGiven, finalized.lastName)) {
      return buildNameResult(finalizedGiven, finalized.lastName);
    }
  }

  if (isUsablePersonName(visualPassport.firstName) && isUsablePersonName(visualPassport.lastName)) {
    return buildNameResult(visualPassport.firstName, visualPassport.lastName);
  }

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

  const best = resolveBestPassportNames({ parsed, ocrLines: lines });
  if (!isUsablePersonName(best.firstName) || !isUsablePersonName(best.lastName)) {
    return parsed;
  }
  return {
    ...parsed,
    firstName: best.firstName,
    lastName: best.lastName,
    fullName: best.fullName,
    // Verilen adlar firstName’de birleşik — middle kaybolmasın / çiftlenmesin.
    middleName: null,
  };
}
