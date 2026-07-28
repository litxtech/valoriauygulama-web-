// Mobil uygulamadan (lib/guestScan/personNameUtils.ts) birebir port.

const OCR_LABEL_ONLY_NAME_RE =
  /^(?:SURNAME|SURNAMES|GIVEN|GIVEN\s*NAMES?|GIVEN\s*NAME(?:\(S\))?|FORENAMES?|FIRST\s*NAMES?|FAMILY\s*NAMES?|NAME|NAMES|SOYAD[İI]?|SOYADI|AD[İI]|ADI|NOM|PRENOMS?|APELLIDOS?)$/i;

const OCR_LABEL_TOKEN_RE =
  /^(?:SURNAME|SURNAMES|GIVEN|GIVENNAMES?|NAMES?|NAME|FORENAMES?|FIRSTNAMES?|FAMILY|FAMILYNAME|SOYAD[İI]?|SOYADI|AD[İI]|ADI)$/i;

const HOTEL_NOISE_NAME_RE =
  /^(?:VALORIA|HOTEL|OTEL|WIFI|RECEPTION|RESEPSİYON|TABLE|MASA|MENU|MENÜ|WHATSAPP|INSTAGRAM|SPECIMEN|DOCUMENT|IDENTITY|CARD)$/i;

export function sanitizePersonName(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let t = String(raw)
    .normalize('NFKC')
    .replace(/</g, ' ')
    .replace(/>/g, ' ')
    .replace(/[|/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || /^<+$/.test(t.replace(/\s/g, ''))) return null;

  t = t.replace(/([A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü])0([A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü])/g, '$1O$2');
  t = t.replace(/([A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü])1([A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü])/g, '$1I$2');
  t = t.replace(/([A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü])5([A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü])/g, '$1S$2');
  if (/\d/.test(t)) return null;

  const beforeLen = t.replace(/\s/g, '').length;
  t = t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\s'.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const afterLen = t.replace(/\s/g, '').length;
  if (afterLen < 2) return null;
  if (beforeLen >= 4 && afterLen / beforeLen < 0.6) return null;
  return t.toLocaleUpperCase('tr-TR');
}

export function isOcrLabelOnlyName(raw: string | null | undefined): boolean {
  const s = sanitizePersonName(raw);
  if (!s) return true;
  if (OCR_LABEL_ONLY_NAME_RE.test(s.replace(/\s+/g, ' ').trim())) return true;
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((t) => OCR_LABEL_TOKEN_RE.test(t));
}

export function isUsablePersonName(raw: string | null | undefined): boolean {
  const s = sanitizePersonName(raw);
  if (!s || s.length < 2) return false;
  if (isOcrLabelOnlyName(s)) return false;
  if (HOTEL_NOISE_NAME_RE.test(s)) return false;
  if (/^[A-ZÇĞİÖŞÜ]\.?$/i.test(s)) return false;
  const letters = (s.match(/\p{L}/gu) ?? []).length;
  if (letters < 2) return false;
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.some((tok) => tok.replace(/[.'-]/g, '').length > 24)) return false;
  if (tokens.filter((tok) => tok.replace(/[.'-]/g, '').length === 1).length > 1) return false;
  return true;
}
