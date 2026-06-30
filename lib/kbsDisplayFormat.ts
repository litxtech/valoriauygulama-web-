import { isUsablePersonName, sanitizePersonName } from '@/lib/guestScan/personNameUtils';
import { formatIcao3ForTr } from '@/lib/scanner/mrzIssuingLabel';
import type { ParsedDocument } from '@/lib/scanner/types';

/** ISO (YYYY-MM-DD) → Türkiye gösterimi GG.AA.YYYY */
export function formatKbsTrDate(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso.trim();
  const y = m[1]!;
  const mo = m[2]!;
  const d = m[3]!;
  return `${d}.${mo}.${y}`;
}

export function formatKbsNationality(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  return formatIcao3ForTr(code);
}

/** Doğum tarihinden yaş (tam yıl). */
export function kbsAgeYearsFromBirthDate(iso: string | null | undefined): number | null {
  if (!iso?.trim() || iso.length < 10) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const years = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  return years >= 0 && years <= 120 ? years : null;
}

/** Tam ad yalnızca ad + soyaddan; OCR gürültüsünü gösterme. */
export function kbsDisplayFullName(parsed: ParsedDocument | null | undefined): string | null {
  if (!parsed) return null;
  const fn = sanitizePersonName(parsed.firstName);
  const ln = sanitizePersonName(parsed.lastName);
  if (isUsablePersonName(fn) && isUsablePersonName(ln)) {
    return `${fn} ${ln}`.trim();
  }
  const raw = sanitizePersonName(parsed.fullName);
  if (raw && isUsablePersonName(raw.split(/\s+/)[0]) && raw.length <= 48) return raw;
  return fn || ln || null;
}
