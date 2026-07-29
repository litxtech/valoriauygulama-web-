/** POS fiş listesi / filtre — tutar metni parse */

export function parseMoneyInput(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, '');
  if (!t) return null;
  let normalized = t;
  if (t.includes(',') && t.includes('.')) {
    if (t.lastIndexOf(',') > t.lastIndexOf('.')) {
      normalized = t.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = t.replace(/,/g, '');
    }
  } else if (t.includes(',')) {
    normalized = t.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = t.replace(/,/g, '');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function amountMatches(
  target: number | null | undefined,
  query: number,
  tol = 0.05
): boolean {
  if (target == null || !Number.isFinite(target)) return false;
  return Math.abs(target - query) <= tol;
}
