/**
 * MRZ’den alınan kimlik → aynı görüntünün VIZ OCR’ı ile doğrulama.
 * Hızlı yol: alanları değiştirmez (MRZ otoriter); onay / çelişki uyarısı ekler.
 */
import { extractPassportIdentityFromOcr } from '@/lib/guestScan/idCardOcrParser';
import { hasPlausibleKbsDocumentNumber } from '@/lib/kbsDocumentNumberValidate';
import { isPlausibleBirthDate, isPlausibleExpiryDate } from '@/lib/kbsCaptureOcrMerge';
import {
  MRZ_IDENTITY_CONFLICT_WARNING,
  MRZ_NEEDS_REVIEW_WARNING,
  MRZ_VISUAL_PARTIAL_WARNING,
  MRZ_VISUAL_VERIFIED_WARNING,
  isMrzChecksumSuspicious,
  pushParsedWarning,
  withMrzNeedsReviewWarning,
} from '@/lib/kbsMrzSuspicion';
import type { ParsedDocument } from '@/lib/scanner/types';

export {
  MRZ_VISUAL_VERIFIED_WARNING,
  MRZ_VISUAL_PARTIAL_WARNING,
} from '@/lib/kbsMrzSuspicion';

export type MrzVisualVerifyStatus = 'verified' | 'partial' | 'conflict' | 'mrz_only' | 'weak_mrz';

export type MrzVisualVerifyResult = {
  parsed: ParsedDocument;
  status: MrzVisualVerifyStatus;
  /** Görselde karşılaştırılabilen alan sayısı. */
  compared: number;
  /** Uyuşan alan sayısı. */
  matched: number;
};

function normDoc(raw: string | null | undefined): string | null {
  const s = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return s || null;
}

function docsAgree(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normDoc(a);
  const nb = normDoc(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ca = na.replace(/O/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
  const cb = nb.replace(/O/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
  if (ca === cb) return true;
  if (ca.length === cb.length && ca.length >= 6) {
    let diff = 0;
    for (let i = 0; i < ca.length; i++) if (ca[i] !== cb[i]) diff++;
    return diff <= 1;
  }
  return false;
}

function datesAgree(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? '').slice(0, 10);
  const y = (b ?? '').slice(0, 10);
  return !!x && !!y && x === y;
}

function natAgree(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? '').trim().toUpperCase();
  const y = (b ?? '').trim().toUpperCase();
  if (!x || !y) return false;
  if (x === y) return true;
  const aliases: Record<string, string> = { TR: 'TUR', TC: 'TUR', TUR: 'TUR' };
  return (aliases[x] ?? x) === (aliases[y] ?? y);
}

/**
 * Checksum’lu MRZ alanlarını görsel etiketlerden doğrula.
 * Çelişkide MRZ değeri kalır; yalnız uyarı eklenir.
 */
export function verifyMrzWithVisualOcr(
  parsed: ParsedDocument,
  lines: string[]
): MrzVisualVerifyResult {
  if (!parsed.rawMrz) {
    return { parsed, status: 'weak_mrz', compared: 0, matched: 0 };
  }
  if (isMrzChecksumSuspicious(parsed) || parsed.checksumsValid !== true) {
    return {
      parsed: withMrzNeedsReviewWarning(parsed),
      status: 'weak_mrz',
      compared: 0,
      matched: 0,
    };
  }

  if (!lines.length) {
    return { parsed, status: 'mrz_only', compared: 0, matched: 0 };
  }

  const visual = extractPassportIdentityFromOcr(lines);
  let compared = 0;
  let matched = 0;
  let conflict = false;

  if (hasPlausibleKbsDocumentNumber(visual.documentNumber, 'passport')) {
    compared += 1;
    if (docsAgree(parsed.documentNumber, visual.documentNumber)) matched += 1;
    else conflict = true;
  }
  if (visual.birthDate && isPlausibleBirthDate(visual.birthDate)) {
    compared += 1;
    if (datesAgree(parsed.birthDate, visual.birthDate)) matched += 1;
    else if (parsed.birthDate) conflict = true;
  }
  if (visual.expiryDate && isPlausibleExpiryDate(visual.expiryDate)) {
    compared += 1;
    if (datesAgree(parsed.expiryDate, visual.expiryDate)) matched += 1;
    else if (parsed.expiryDate) conflict = true;
  }
  if (visual.nationalityCode) {
    compared += 1;
    if (natAgree(parsed.nationalityCode, visual.nationalityCode)) matched += 1;
    else if (parsed.nationalityCode) conflict = true;
  }
  if (visual.gender && parsed.gender) {
    compared += 1;
    if (visual.gender === parsed.gender) matched += 1;
    else conflict = true;
  }

  let next = parsed;
  let status: MrzVisualVerifyStatus;

  if (compared === 0) {
    status = 'mrz_only';
  } else if (conflict) {
    status = 'conflict';
    next = pushParsedWarning(next, MRZ_IDENTITY_CONFLICT_WARNING);
    next = withMrzNeedsReviewWarning(next);
  } else if (matched === compared && matched >= 2) {
    status = 'verified';
    next = {
      ...next,
      warnings: [
        ...(next.warnings ?? []).filter(
          (w) =>
            w !== MRZ_NEEDS_REVIEW_WARNING &&
            w !== MRZ_IDENTITY_CONFLICT_WARNING &&
            w !== MRZ_VISUAL_PARTIAL_WARNING &&
            w !== MRZ_VISUAL_VERIFIED_WARNING
        ),
        MRZ_VISUAL_VERIFIED_WARNING,
      ],
    };
  } else if (matched >= 1) {
    status = 'partial';
    next = pushParsedWarning(next, MRZ_VISUAL_PARTIAL_WARNING);
  } else {
    status = 'mrz_only';
  }

  return { parsed: next, status, compared, matched };
}

/** Yükleme erken çıkışı: MRZ sağlam + (doğrulandı | görsel yok | kısmi uyum, çelişki yok). */
export function isMrzVisualVerifyReady(result: MrzVisualVerifyResult): boolean {
  if (result.status === 'weak_mrz' || result.status === 'conflict') return false;
  if (result.parsed.checksumsValid !== true || !result.parsed.rawMrz) return false;
  return (
    result.status === 'verified' ||
    result.status === 'mrz_only' ||
    result.status === 'partial'
  );
}
