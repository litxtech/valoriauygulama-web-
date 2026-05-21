/** MRZ / OCR kişi adı — boş, filler ve gürültü temizliği. */
export function sanitizePersonName(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let t = String(raw)
    .replace(/</g, ' ')
    .replace(/>/g, ' ')
    .replace(/[|/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || /^<+$/.test(t.replace(/\s/g, ''))) return null;
  t = t.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü\s'.-]/g, '').trim();
  if (t.length < 2) return null;
  if (/^\d+$/.test(t.replace(/\s/g, ''))) return null;
  return t.toUpperCase();
}

export function isUsablePersonName(raw: string | null | undefined): boolean {
  const s = sanitizePersonName(raw);
  return !!s && s.length >= 2;
}

export function coalescePersonName(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    const s = sanitizePersonName(c);
    if (s) return s;
  }
  return null;
}

/** "AHMET MEHMET YILMAZ" → ad + soyad (son kelime soyad). */
export function splitFullNameToFirstLast(full: string | null | undefined): {
  firstName: string | null;
  lastName: string | null;
} {
  const s = sanitizePersonName(full);
  if (!s) return { firstName: null, lastName: null };
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: null, lastName: parts[0]! };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1]!,
  };
}
