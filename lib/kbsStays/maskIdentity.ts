/** Hassas kimlik numarasını listede göstermek için maskele. */
export function maskIdentityNumber(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim().replace(/\s/g, '');
  if (s.length <= 4) return '****';
  return `${s.slice(0, 2)}***${s.slice(-2)}`;
}
