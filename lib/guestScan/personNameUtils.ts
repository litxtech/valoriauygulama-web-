/** Kimlik / pasaport OCR etiket kelimeleri — gerçek ad değil. */
const OCR_LABEL_ONLY_NAME_RE =
  /^(?:SURNAME|SURNAMES|GIVEN|GIVEN\s*NAMES?|GIVEN\s*NAME(?:\(S\))?|FORENAMES?|FIRST\s*NAMES?|FAMILY\s*NAMES?|NAME|NAMES|SOYAD[İI]?|SOYADI|AD[İI]|ADI|NOM|PRENOMS?|APELLIDOS?)$/i;

const OCR_LABEL_TOKEN_RE =
  /^(?:SURNAME|SURNAMES|GIVEN|GIVENNAMES?|NAMES?|NAME|FORENAMES?|FIRSTNAMES?|FAMILY|FAMILYNAME|SOYAD[İI]?|SOYADI|AD[İI]|ADI)$/i;

/** "SURNAME", "GIVEN NAMES" vb. — OCR etiketinin değer sanılması. */
export function isOcrLabelOnlyName(raw: string | null | undefined): boolean {
  const s = sanitizePersonName(raw);
  if (!s) return true;
  if (OCR_LABEL_ONLY_NAME_RE.test(s.replace(/\s+/g, ' ').trim())) return true;
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((t) => OCR_LABEL_TOKEN_RE.test(t));
}

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
  return !!s && s.length >= 2 && !isOcrLabelOnlyName(s);
}

export function coalescePersonName(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    if (!isUsablePersonName(c)) continue;
    return sanitizePersonName(c);
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
