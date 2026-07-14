import { isUsablePersonName, sanitizePersonName } from '@/lib/guestScan/personNameUtils';
import { formatIcao3ForTr } from '@/lib/scanner/mrzIssuingLabel';
import type { ParsedDocument } from '@/lib/scanner/types';

/**
 * ISO (YYYY-MM-DD) → gösterim GG.AA.YYYY (ör. 01.01.2020 — KBS / Jandarma).
 * Yıl önde olmaz (2020.01.01 değil).
 */
export function formatKbsTrDate(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const parsed = parseKbsDateInputToIso(iso);
  if (!parsed) return iso.trim();
  const m = parsed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso.trim();
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function isValidYmd(yyyy: string, mm: string, dd: string): boolean {
  const y = Number(yyyy);
  const mo = Number(mm);
  const d = Number(dd);
  if (!Number.isFinite(y) || y < 1900 || y > 2100) return false;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === mo && dt.getUTCDate() === d;
}

/**
 * Giriş/görünen: GG.AA.YYYY (tercih) | GG-AA-YYYY | GG AA YYYY
 * Depo/SOAP gün: YYYY-MM-DD
 * Yıl-ay-gün yalnızca ISO tireli (2020-01-01) kabul edilir.
 */
export function parseKbsDateInputToIso(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim().replace(/\s+/g, ' ');

  // Depodan gelen kesin ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const iso = s.slice(0, 10);
    const [y, m, d] = iso.split('-');
    if (y && m && d && isValidYmd(y, m, d)) return iso;
    return null;
  }

  // GG AA YYYY / GG-AA-YYYY / GG.AA.YYYY (boşluk, nokta, tire)
  const dmy = s.match(/^(\d{1,2})[\s./-](\d{1,2})[\s./-](\d{4})$/);
  if (dmy) {
    const dd = dmy[1]!.padStart(2, '0');
    const mm = dmy[2]!.padStart(2, '0');
    const yyyy = dmy[3]!;
    if (isValidYmd(yyyy, mm, dd)) return `${yyyy}-${mm}-${dd}`;
    return null;
  }

  // 8 hane: GGAAYYYY
  const digits = s.replace(/\D/g, '');
  if (digits.length === 8) {
    const dd = digits.slice(0, 2);
    const mm = digits.slice(2, 4);
    const yyyy = digits.slice(4, 8);
    if (isValidYmd(yyyy, mm, dd)) return `${yyyy}-${mm}-${dd}`;
  }

  return null;
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
