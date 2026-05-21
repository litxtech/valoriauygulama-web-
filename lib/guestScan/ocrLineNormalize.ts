/** OCR satırı MRZ şeridi mi (ad ayrıştırmadan çıkar). */
export function isMostlyMrzLine(line: string): boolean {
  const c = line.replace(/\s/g, '').toUpperCase();
  if (c.length < 22) return false;
  if ((c.match(/</g) || []).length >= 2) return true;
  return /^[A-Z0-9<]{22,}$/.test(c) && c.includes('<');
}

/** Kimlik / pasaport OCR satırlarını normalize et. */
export function normalizeOcrLines(raw: string[]): string[] {
  return raw
    .map((l) =>
      String(l || '')
        .trim()
        .replace(/\s{2,}/g, ' ')
    )
    .filter((l) => l.length > 0)
    .filter((l) => !isMostlyMrzLine(l));
}
