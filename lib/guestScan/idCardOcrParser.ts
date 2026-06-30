import type { ParsedDocument } from '@/lib/scanner/types';
import { normalizeOcrLines } from '@/lib/guestScan/ocrLineNormalize';
import {
  coalescePersonName,
  isUsablePersonName,
  sanitizePersonName,
  splitFullNameToFirstLast,
} from '@/lib/guestScan/personNameUtils';
import {
  correctSwappedMrzNames,
  isTurkishMrzDocument,
  mrzNamesLookSwapped,
  mrzNamesLookValid,
  stripSurnameFromGivenNames,
  trimMrzPersonNameTokens,
} from '@/lib/scanner/mrzPersonNames';
import {
  isKnownIcao3,
  isNationalityLikeText,
  mapNationalityTextToCode,
} from '@/lib/kbsNationalityMap';
import { resolveBestPassportNames } from '@/lib/kbsPassportNameResolve';

const TC_RE = /\b([1-9]\d{10})\b/;
const DATE_RE = /\b(\d{2})[./](\d{2})[./](\d{4})\b/;
const DATE_RE_GLOBAL = /\b(\d{2})[./](\d{2})[./](\d{4})\b/g;
const YKN_RE = /\b(99\d{9})\b/;
const SERIAL_TOKEN_RE = /\b([A-Z]{1,3}\s*\d{5,9})\b/i;
const SERIAL_FALLBACK_RE = /\b([A-Z]{1,3}\d{5,9})\b/i;

const MOTHER_LABEL_RE =
  /(?:^|\b)(?:anne(?:\s*n[iı]n)?\s*ad[ıi]|ana\s*ad[ıi]|mother(?:'s)?\s*name?)(?:\s*[:\-]\s*|\s+)(.*)$/i;
const FATHER_LABEL_RE =
  /(?:^|\b)(?:baba(?:\s*n[iı]n)?\s*ad[ıi]|father(?:'s)?\s*name?)(?:\s*[:\-]\s*|\s+)(.*)$/i;
const MOTHER_LINE_LABEL_RE = /^(?:anne(?:\s*n[iı]n)?\s*ad[ıi]|ana\s*ad[ıi]|mother)/i;
const FATHER_LINE_LABEL_RE = /^(?:baba(?:\s*n[iı]n)?\s*ad[ıi]|father)/i;
const SERIAL_LINE_LABEL_RE = /seri\s*(?:no|n[°o]|s[ıi]ra)|belge\s*seri/i;

const SURNAME_INLINE_RE =
  /(?:^|\b)(?:soyad[ıi]?|soyadi|surname|family\s*name|last\s*name|nom)(?:\s*[:\-]\s*|\s+)(.*)$/i;
const GIVEN_INLINE_RE =
  /(?:^|\b)(?:ad[ıi]?|adi|given\s*names?|first\s*names?|forename|prenom)(?:\s*[:\-]\s*|\s+)(.*)$/i;
const SURNAME_LINE_LABEL_RE = /^(?:soyad[ıi]?|soyadi|surname|family\s*name|last\s*name|nom)\s*$/i;
const GIVEN_LINE_LABEL_RE = /^(?:ad[ıi]?|adi|given\s*names?|first\s*names?|forename)\s*$/i;
/** T.C. kimlik kartı — "Soyadı / Surname", "Adı / Given Name(s)" çift dilli etiketler. */
const TR_ID_SURNAME_LABEL_RE = /^(?:soyad[ıi]?|soyadi)(?:\s*\/\s*surname)?\s*$/i;
const TR_ID_GIVEN_LABEL_RE =
  /^(?:ad[ıi]?|adi)(?:\s*\/\s*(?:given\s*names?(?:\(s\))?|name(?:\(s\)|s)?))?\s*$/i;

/** Yalnızca etiket kelimelerinden oluşan token (değer değil). */
const LABEL_TOKEN_RE =
  /^(?:surname|surnames|family|familyname|name|names|given|givenname|givennames|first|firstname|forename|forenames|prenom|prenoms|nom|noms|apellidos?|soyad[ıi]?|soyadi|ad[ıi]|adi|identity|kimlik|number|numara|document|belge|seri|serial|no|nr|valid|until|thru|expiry|expires|date|birth|dob|of|nationality|uyru[gğ]u?|vatanda[sş]l[ıi][gğ][ıi]?|tr|tc|cinsiyet|sex|gender)$/i;

/** Sanitize sonrası kalan tüm kelimeler etiket mi (ör. "GIVEN NAMES", "SURNAME"). */
function allTokensAreLabels(value: string): boolean {
  const tokens = value
    .replace(/[().]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((t) => LABEL_TOKEN_RE.test(t));
}
const TC_LABEL_LINE_RE =
  /(?:t\.?\s*c\.?\s*(?:kimlik)?|kimlik)\s*(?:no|numara|number)|identity\s*(?:no|number)|id\s*no/i;

const BIRTH_LINE_LABEL_RE = /(?:do[gğ]um\s*tarih|date\s*of\s*birth|birth\s*date)/i;
const BIRTH_INLINE_RE =
  /(?:do[gğ]um\s*tarihi?|date\s*of\s*birth|birth\s*date)\s*[:\/\s-]*(\d{2}[./]\d{2}[./]\d{4})/i;
const EXPIRY_LINE_LABEL_RE =
  /(?:son\s*geçerl|geçerlilik\s*tarih|valid\s*until|date\s*of\s*expiry|expiry\s*date|expires|valid\s*thru)/i;
const EXPIRY_INLINE_RE =
  /(?:son\s*geçerl(?:ilik)?\s*tarihi?|geçerlilik\s*tarihi?|valid\s*until|date\s*of\s*expiry)\s*[:\/\s-]*(\d{2}[./]\d{2}[./]\d{4})/i;
const NATIONALITY_INLINE_RE =
  /(?:^|\b)(?:uyruk|nationality|vatandaşlığı?|vatandasligi?)(?:\s*[:\-]\s*|\s+)([A-Za-zÇĞİÖŞÜçğıöşü]{2,40})/i;
const NATIONALITY_LINE_LABEL_RE = /^(?:uyruk|nationality|vatandaşlığı?)/i;
const GENDER_LINE_RE = /^(?:cinsiyet|sex|gender|erkek|kad[iı]n)\b/i;
const GENDER_M_RE = /\b(?:E\/M|ERKEK|MALE|\bM\b|\bE\b)\b/i;
const GENDER_F_RE = /\b(?:K\/F|KADIN|KADIN|FEMALE|\bF\b|\bK\b)\b/i;

const NOISE_NAME_RE =
  /^(?:türkiye|turkey|republic|cim|cumhuriyeti|cumhuriyet|kimlik|geçici|gecici|koruma|belgesi|identity|card|document|republic\s+of|valid|geçerlilik|uyruk|nationality|vatandas|vatandaş|masa|tezgah|table|desk|hotel|otel|resepsiyon|reception|valoria|wifi|menü|menu|kahve|coffee|restoran|instagram|facebook|whatsapp|pasaport|passport|passeport|pasaporte|specimen|type|turkiye|turk|reise|reisepass)/i;

const PASSPORT_HEADER_RE =
  /(?:cumhuriyet|republic|pasaport|passport|passeport|turkiye|türkiye|turkey|specimen|reisepass|travel\s*document|belge\s*türü|document\s*type)/i;

const PASSPORT_SURNAME_LINE_RE =
  /^(?:soyad[ıi]?|soyadi|surname|family\s*name|last\s*name|nom|apellidos?)\s*$/i;
const PASSPORT_GIVEN_LINE_RE =
  /^(?:ad[ıi]?|adi|given\s*names?|first\s*names?|forename|prenoms?|prenom|names?)\s*$/i;
const PASSPORT_SURNAME_INLINE_RE =
  /(?:^|\b)(?:soyad[ıi]?|soyadi|surname|family\s*name|last\s*name|nom|apellidos?)(?:\s*[:\-]\s*|\s+)(.*)$/i;
const PASSPORT_GIVEN_INLINE_RE =
  /(?:^|\b)(?:ad[ıi]?|adi|given\s*names?|first\s*names?|forename|prenoms?|prenom)(?:\s*[:\-]\s*|\s+)(.*)$/i;

/** Arapça pasaport — اسم العائلة / اللقب etiketleri (Latin satır genelde altında). */
const ARABIC_SURNAME_LABEL_RE =
  /(?:اسم\s*العائلة|اللقب|اسم\s*العائلة\s*\/|family\s*name\s*\/\s*اسم)/i;
const ARABIC_GIVEN_LABEL_RE = /(?:^|\b)(?:الاسم|الاسم\s*الأول|given\s*names?\s*\/\s*الاسم)/i;
const ARABIC_FATHER_LABEL_RE = /(?:اسم\s*الأب|اسم\s*الاب|father(?:'s)?\s*name)/i;
const LATIN_NAME_LINE_RE = /^[A-Z][A-Z\s'.-]{2,48}$/;

const MONTH_TO_NUM: Record<string, string> = {
  JAN: '01',
  FEB: '02',
  MAR: '03',
  APR: '04',
  MAY: '05',
  JUN: '06',
  JUL: '07',
  AUG: '08',
  SEP: '09',
  OCT: '10',
  NOV: '11',
  DEC: '12',
  OCA: '01',
  ŞUB: '02',
  SUB: '02',
  NIS: '04',
  NİS: '04',
  HAZ: '06',
  TEM: '07',
  AĞU: '08',
  AGU: '08',
  EYL: '09',
  EKI: '10',
  EKİ: '10',
  KAS: '11',
  ARA: '12',
};

const PASSPORT_ALPHA_DATE_RE =
  /\b(\d{1,2})\s+([A-ZÇĞİÖŞÜa-zçğıöşü]{3,9})\s*[./]?\s*(\d{4})\b/g;
const PASSPORT_ALPHA_DATE_INLINE_RE =
  /(?:do[gğ]um\s*tarih|date\s*of\s*birth|birth\s*date|son\s*geçerl|geçerlilik\s*tarih|valid\s*until|date\s*of\s*expiry|expiry\s*date|expires)\s*[:\/\s-]*(\d{1,2}\s+[A-ZÇĞİÖŞÜa-zçğıöşü]{3,9}\s+\d{4})/gi;

const PASSPORT_DOC_RE = /\b([A-Z]{1,2}\d{6,9})\b/;
const PASSPORT_LABEL_RE = /pasaport\s*(?:no|numara)|passport\s*(?:no|number|#)/i;

export type TurkishIdOcrExtras = {
  documentSeries: string | null;
  motherName: string | null;
  fatherName: string | null;
  maritalStatus?: 'married' | 'single' | null;
};

const MARITAL_LINE_RE = /^(?:medeni\s*hal|civil\s*status|marital\s*status)/i;
const MARITAL_EVLI_RE = /\b(?:evli|married)\b/i;
const MARITAL_BEKAR_RE = /\b(?:bekar|single|unmarried)\b/i;

function normLines(lines: string[]): string[] {
  return normalizeOcrLines(lines);
}

/** OCR O/l → rakam; 11 haneli T.C. kimlik no. */
export function normalizeTurkishIdDigits(raw: string): string | null {
  const s = String(raw ?? '')
    .replace(/[Ool]/g, (c) => (c === 'O' || c === 'o' || c === 'l' ? '0' : '1'))
    .replace(/[İIı]/g, '1')
    .replace(/\D/g, '');
  if (s.length !== 11 || !/^[1-9]/.test(s)) return null;
  return s;
}

/** T.C. kimlik no — bitişik, boşluklu veya etiketli satırlardan. */
export function extractTurkishNationalIdFromOcr(lines: string[]): string | null {
  const L = normLines(lines);
  const joined = L.join('\n');

  const strict = joined.match(TC_RE)?.[1];
  if (strict) return strict;

  for (let i = 0; i < L.length; i++) {
    const line = L[i]!;
    if (!TC_LABEL_LINE_RE.test(line)) continue;
    const inline = line.match(/([0-9OIl\s.-]{11,18})/);
    if (inline?.[1]) {
      const d = normalizeTurkishIdDigits(inline[1]);
      if (d) return d;
    }
    for (let j = 1; j <= 2; j++) {
      const d = normalizeTurkishIdDigits(L[i + j] ?? '');
      if (d) return d;
    }
  }

  const digitChunks = joined.match(/(?:[0-9OIl][\s.\-/]*){11,}/gi) ?? [];
  for (const chunk of digitChunks) {
    const d = normalizeTurkishIdDigits(chunk);
    if (d) return d;
  }

  const compact = joined.replace(/[^0-9OIl]/gi, ' ');
  for (const token of compact.split(/\s+/)) {
    const d = normalizeTurkishIdDigits(token);
    if (d) return d;
  }

  return null;
}

/** Ön yüz T.C. kimlik parse sonucu MRZ yerine tercih edilsin mi. */
export function shouldPreferKbsFrontIdParse(frontParsed: ParsedDocument): boolean {
  const digits = (frontParsed.documentNumber ?? '').replace(/\D/g, '');
  const hasTc = /^[1-9]\d{10}$/.test(digits);
  const hasName =
    isUsablePersonName(frontParsed.firstName) || isUsablePersonName(frontParsed.lastName);
  if (frontParsed.documentType === 'id_card' && hasTc) return true;
  if (hasTc && hasName) return true;
  return false;
}

function isoFromTrDate(m: RegExpMatchArray): string | null {
  const d = m[1];
  const mo = m[2];
  const y = m[3];
  if (!d || !mo || !y) return null;
  return `${y}-${mo}-${d}`;
}

function cleanPersonName(raw: string | null | undefined): string | null {
  const s = sanitizePersonName(raw);
  if (!s || NOISE_NAME_RE.test(s)) return null;
  if (PASSPORT_HEADER_RE.test(s)) return null;
  if (isNationalityLikeText(s)) return null;
  if (TC_RE.test(s) || YKN_RE.test(s) || DATE_RE.test(s)) return null;
  if (SERIAL_FALLBACK_RE.test(s) && s.replace(/\s/g, '').length <= 12) return null;
  if (GENDER_LINE_RE.test(s)) return null;
  if (allTokensAreLabels(s)) return null;
  return s;
}

/** Pasaport görsel OCR — fazla kelime / etiket gürültüsünü kes. */
function cleanPassportPersonName(
  raw: string | null | undefined,
  role: 'surname' | 'given'
): string | null {
  const trimmed = trimMrzPersonNameTokens(raw, { role });
  if (!trimmed) return null;
  if (NOISE_NAME_RE.test(trimmed)) return null;
  if (PASSPORT_HEADER_RE.test(trimmed)) return null;
  if (isNationalityLikeText(trimmed)) return null;
  return trimmed;
}

/** Arapça etiket sonrası Latin ad/soyad satırı (bilingual pasaport). */
function pickNextLatinNameLine(lines: string[], start: number, skipFather = false): string | null {
  for (let i = start; i < Math.min(start + 5, lines.length); i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    if (skipFather && ARABIC_FATHER_LABEL_RE.test(line)) continue;
    if (ARABIC_SURNAME_LABEL_RE.test(line) || ARABIC_GIVEN_LABEL_RE.test(line)) continue;

    const inlineSurname = line.match(PASSPORT_SURNAME_INLINE_RE);
    if (inlineSurname?.[1]) {
      const v = cleanPassportPersonName(inlineSurname[1], 'surname');
      if (v) return v;
    }
    const inlineGiven = line.match(PASSPORT_GIVEN_INLINE_RE);
    if (inlineGiven?.[1]) {
      const v = cleanPassportPersonName(inlineGiven[1], 'given');
      if (v) return v;
    }

    const latinOnly = line.trim().toUpperCase();
    if (LATIN_NAME_LINE_RE.test(latinOnly)) {
      const v = cleanPassportPersonName(latinOnly, skipFather ? 'surname' : 'given');
      if (v) return v;
    }

    const mixed = cleanPassportPersonName(
      line.replace(/[\u0600-\u06FF]/g, ' ').replace(/\s+/g, ' ').trim(),
      skipFather ? 'surname' : 'given'
    );
    if (mixed && /[A-Z]{3,}/.test(mixed)) return mixed;
  }
  return null;
}

function monthTokenToNum(token: string): string | null {
  const up = token
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .slice(0, 3);
  return MONTH_TO_NUM[up] ?? null;
}

function isoFromAlphaDate(dayRaw: string, monthRaw: string, yearRaw: string): string | null {
  const day = dayRaw.padStart(2, '0');
  const month = monthTokenToNum(monthRaw);
  const year = yearRaw.trim();
  if (!month || !/^\d{4}$/.test(year)) return null;
  const iso = `${year}-${month}-${day}`;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return iso;
}

function allAlphaDatesFromLines(L: string[]): string[] {
  const found: string[] = [];
  for (const line of L) {
    for (const m of line.matchAll(PASSPORT_ALPHA_DATE_RE)) {
      const iso = isoFromAlphaDate(m[1]!, m[2]!, m[3]!);
      if (iso) found.push(iso);
    }
  }
  return found;
}

function compactSerial(raw: string): string | null {
  const c = raw.replace(/\s/g, '').toUpperCase();
  if (!SERIAL_FALLBACK_RE.test(c)) return null;
  if (YKN_RE.test(c)) return null;
  if (TC_RE.test(c) && c.length === 11) return null;
  return c;
}

/** "Soyadı / Surname" gibi çift dilli soyad etiketi satırı (değer değil). */
function isSurnameLabelLine(line: string): boolean {
  return /soyad[ıi]?/i.test(line) || /\bsurnames?\b/i.test(line) || /family\s*name/i.test(line);
}

/** "Adı / Given Name(s)" gibi çift dilli ad etiketi satırı (değer değil). */
function isGivenLabelLine(line: string): boolean {
  if (isSurnameLabelLine(line)) return false;
  if (/given\s*names?|forename|first\s*names?/i.test(line)) return true;
  return /^\s*ad[ıi]\s*(?:[\/:.\-]|given|name|$)/i.test(line.trim());
}

function isAnyNameLabelLine(line: string): boolean {
  return (
    isSurnameLabelLine(line) ||
    isGivenLabelLine(line) ||
    SURNAME_LINE_LABEL_RE.test(line) ||
    GIVEN_LINE_LABEL_RE.test(line) ||
    TR_ID_SURNAME_LABEL_RE.test(line) ||
    TR_ID_GIVEN_LABEL_RE.test(line)
  );
}

/** Ad / soyad dışı bilinen alan etiketi (değer aramasını durdurur). */
function isOtherFieldLabelLine(line: string): boolean {
  return (
    BIRTH_LINE_LABEL_RE.test(line) ||
    EXPIRY_LINE_LABEL_RE.test(line) ||
    NATIONALITY_LINE_LABEL_RE.test(line) ||
    GENDER_LINE_RE.test(line) ||
    SERIAL_LINE_LABEL_RE.test(line) ||
    TC_LABEL_LINE_RE.test(line) ||
    MOTHER_LINE_LABEL_RE.test(line) ||
    FATHER_LINE_LABEL_RE.test(line)
  );
}

/** Etiket satırından sonraki ilk geçerli ad/soyad değeri (etiket satırları atlanır). */
function nextNameValueLine(L: string[], start: number): string | null {
  for (let j = start; j < Math.min(start + 3, L.length); j++) {
    const raw = (L[j] ?? '').trim();
    if (!raw) continue;
    if (isAnyNameLabelLine(raw) || isOtherFieldLabelLine(raw)) continue;
    if (!isNameCandidateLine(raw)) continue;
    const v = cleanPersonName(raw);
    if (v) return v;
  }
  return null;
}

function isNameCandidateLine(line: string): boolean {
  if (!line || line.length < 3) return false;
  if (PASSPORT_HEADER_RE.test(line)) return false;
  if (NATIONALITY_LINE_LABEL_RE.test(line) || NATIONALITY_INLINE_RE.test(line)) return false;
  if (EXPIRY_LINE_LABEL_RE.test(line) || EXPIRY_INLINE_RE.test(line)) return false;
  if (BIRTH_LINE_LABEL_RE.test(line) || BIRTH_INLINE_RE.test(line)) return false;
  if (TC_RE.test(line) || YKN_RE.test(line) || DATE_RE.test(line)) return false;
  if (MOTHER_LINE_LABEL_RE.test(line) || FATHER_LINE_LABEL_RE.test(line)) return false;
  if (SERIAL_LINE_LABEL_RE.test(line)) return false;
  if (GENDER_LINE_RE.test(line)) return false;
  if (SURNAME_LINE_LABEL_RE.test(line) || GIVEN_LINE_LABEL_RE.test(line)) return false;
  if (isSurnameLabelLine(line) || isGivenLabelLine(line)) return false;
  if (NOISE_NAME_RE.test(line) || isNationalityLikeText(line)) return false;
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(line)) return false;
  const letters = (line.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g) || []).length;
  const digits = (line.match(/\d/g) || []).length;
  return letters >= 3 && digits <= Math.max(2, Math.floor(letters * 0.15));
}

/** Seri no — etiket satırı, aynı satır değer veya seri benzeri token. */
export function extractDocumentSerialFromOcr(lines: string[]): string | null {
  const L = normLines(lines);

  for (let i = 0; i < L.length; i++) {
    const line = L[i]!;
    if (!SERIAL_LINE_LABEL_RE.test(line)) continue;
    const inline = line.match(SERIAL_TOKEN_RE);
    if (inline?.[1]) {
      const s = compactSerial(inline[1]);
      if (s) return s;
    }
    const next = L[i + 1];
    if (next) {
      const m = next.match(SERIAL_TOKEN_RE);
      if (m?.[1]) {
        const s = compactSerial(m[1]);
        if (s) return s;
      }
    }
  }

  for (const line of L) {
    if (SERIAL_LINE_LABEL_RE.test(line)) continue;
    const m = line.match(SERIAL_TOKEN_RE);
    if (m?.[1]) {
      const s = compactSerial(m[1]);
      if (s && s.length >= 6 && s.length <= 12) return s;
    }
  }

  return null;
}

export function extractParentNamesFromOcr(lines: string[]): { motherName: string | null; fatherName: string | null } {
  const L = normLines(lines);
  let motherName: string | null = null;
  let fatherName: string | null = null;

  for (let i = 0; i < L.length; i++) {
    const line = L[i]!;

    const motherInline = line.match(MOTHER_LABEL_RE);
    if (motherInline?.[1]) {
      motherName = cleanPersonName(motherInline[1]) ?? motherName;
    } else if (MOTHER_LINE_LABEL_RE.test(line) && !motherInline) {
      const next = cleanPersonName(L[i + 1]);
      if (next) motherName = next;
    }

    const fatherInline = line.match(FATHER_LABEL_RE);
    if (fatherInline?.[1]) {
      fatherName = cleanPersonName(fatherInline[1]) ?? fatherName;
    } else if (FATHER_LINE_LABEL_RE.test(line) && !fatherInline) {
      const next = cleanPersonName(L[i + 1]);
      if (next) fatherName = next;
    }
  }

  if (!motherName || !fatherName) {
    const joined = L.join('\n');
    if (!motherName) {
      const m =
        joined.match(/(?:ANNE|ANA)\s*AD[İI]?\s*[:\s]*([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s'-]{1,40})/i) ??
        joined.match(/(?:ANNE|ANA)\s*[:\s]+([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s'-]{1,40})/i);
      motherName = cleanPersonName(m?.[1]) ?? motherName;
    }
    if (!fatherName) {
      const f = joined.match(/(?:BABA)\s*AD[İI]?\s*[:\s]*([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s'-]{1,40})/i);
      fatherName = cleanPersonName(f?.[1]) ?? fatherName;
    }
  }

  return { motherName, fatherName };
}

/** Kimlik ön yüz — medeni hal (EVLİ / BEKAR). */
export function extractMaritalStatusFromOcr(lines: string[]): 'married' | 'single' | null {
  const L = normLines(lines);
  for (let i = 0; i < L.length; i++) {
    const line = L[i]!;
    if (!MARITAL_LINE_RE.test(line) && !MARITAL_EVLI_RE.test(line) && !MARITAL_BEKAR_RE.test(line)) {
      continue;
    }
    const chunk = `${line} ${L[i + 1] ?? ''}`;
    if (MARITAL_EVLI_RE.test(chunk)) return 'married';
    if (MARITAL_BEKAR_RE.test(chunk)) return 'single';
  }
  const joined = L.join(' ');
  if (/\bMEDEN[Iİ]\s*HAL[Iİ]?\s*[:\s]*EVL[Iİ]/i.test(joined)) return 'married';
  if (/\bMEDEN[Iİ]\s*HAL[Iİ]?\s*[:\s]*BEKAR/i.test(joined)) return 'single';
  return null;
}

/** Pasaport biyometrik sayfa — Surname / Given names etiketleri. */
export function extractPassportNamesFromOcr(lines: string[]): {
  firstName: string | null;
  lastName: string | null;
} {
  const L = normLines(lines);
  let firstName: string | null = null;
  let lastName: string | null = null;

  for (let i = 0; i < L.length; i++) {
    const line = L[i]!;

    const surnameInline = line.match(PASSPORT_SURNAME_INLINE_RE);
    if (surnameInline?.[1]) {
      lastName = cleanPassportPersonName(surnameInline[1], 'surname') ?? lastName;
    } else if (PASSPORT_SURNAME_LINE_RE.test(line)) {
      const next =
        cleanPassportPersonName(L[i + 1], 'surname') ?? pickNextLatinNameLine(L, i + 1, true);
      if (next) lastName = next;
    } else if (ARABIC_SURNAME_LABEL_RE.test(line) && !ARABIC_FATHER_LABEL_RE.test(line)) {
      const inlineLatin = line.replace(/[\u0600-\u06FF]/g, ' ').replace(/\s+/g, ' ').trim();
      const fromInline = cleanPassportPersonName(
        inlineLatin.replace(/.*(?:surname|family\s*name|soyad)/i, '').trim(),
        'surname'
      );
      if (fromInline) {
        lastName = fromInline;
      } else {
        const next = pickNextLatinNameLine(L, i + 1, true);
        if (next) lastName = next;
      }
    }

    const givenInline = line.match(PASSPORT_GIVEN_INLINE_RE);
    if (givenInline?.[1]) {
      firstName = cleanPassportPersonName(givenInline[1], 'given') ?? firstName;
    } else if (PASSPORT_GIVEN_LINE_RE.test(line)) {
      const next = cleanPassportPersonName(L[i + 1], 'given') ?? pickNextLatinNameLine(L, i + 1);
      if (next) firstName = next;
    } else if (ARABIC_GIVEN_LABEL_RE.test(line) && !ARABIC_FATHER_LABEL_RE.test(line)) {
      const next = pickNextLatinNameLine(L, i + 1);
      if (next) firstName = next;
    }
  }

  return { firstName, lastName };
}

/** Ad / soyad — etiketli satırlar, MRZ’siz ön yüz. */
export function extractNamesFromOcr(lines: string[]): { firstName: string | null; lastName: string | null } {
  const L = normLines(lines);
  const isPassport = detectPassportFromOcr(L);
  if (isPassport) {
    const passportNames = extractPassportNamesFromOcr(L);
    if (isUsablePersonName(passportNames.firstName) && isUsablePersonName(passportNames.lastName)) {
      return passportNames;
    }
  }

  let firstName: string | null = null;
  let lastName: string | null = null;

  for (let i = 0; i < L.length; i++) {
    const line = L[i]!;

    // Soyad: önce çift dilli etiket satırı (değer alt satırda), sonra inline değer.
    const surnameLabel =
      isSurnameLabelLine(line) ||
      SURNAME_LINE_LABEL_RE.test(line) ||
      TR_ID_SURNAME_LABEL_RE.test(line);
    const surnameInline = line.match(SURNAME_INLINE_RE);
    const surnameInlineVal = surnameInline ? cleanPersonName(surnameInline[1]) : null;
    if (surnameInlineVal) {
      lastName = surnameInlineVal;
    } else if (surnameLabel) {
      const next = nextNameValueLine(L, i + 1);
      if (next) lastName = next;
    }

    // Ad: soyad satırıyla çakışmasın diye soyad değilse işle.
    const givenLabel =
      !surnameLabel &&
      (isGivenLabelLine(line) ||
        GIVEN_LINE_LABEL_RE.test(line) ||
        TR_ID_GIVEN_LABEL_RE.test(line));
    const givenInline = !surnameLabel ? line.match(GIVEN_INLINE_RE) : null;
    const givenInlineVal = givenInline ? cleanPersonName(givenInline[1]) : null;
    if (givenInlineVal) {
      firstName = givenInlineVal;
    } else if (givenLabel) {
      const next = nextNameValueLine(L, i + 1);
      if (next) firstName = next;
    }
  }

  if (!firstName || !lastName) {
    const joined = L.join('\n');
    if (!lastName) {
      const m = joined.match(/(?:SOYAD[İI]?)\s*[:\s]*([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s'-]{1,40})/i);
      lastName = cleanPersonName(m?.[1]) ?? lastName;
    }
    if (!firstName) {
      const m =
        joined.match(/(?:^|\n)\s*AD[İI]?\s*[:\s]+([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s'-]{1,40})/i) ??
        joined.match(/(?:GIVEN\s*NAMES?)\s*[:\s]*([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s'-]{1,40})/i);
      firstName = cleanPersonName(m?.[1]) ?? firstName;
    }
  }

  if (!firstName || !lastName) {
    const candidates = L.filter((l) => isNameCandidateLine(l))
      .map((l) => cleanPersonName(l))
      .filter((n): n is string => !!n && !isNationalityLikeText(n));
    const uniq = [...new Set(candidates)];
    if (!lastName && !firstName && uniq.length >= 2) {
      lastName = uniq[0]!;
      firstName = uniq[1]!;
    } else if (!lastName && uniq.length >= 1) {
      lastName = uniq.find((n) => n !== firstName) ?? uniq[0]!;
    } else if (!firstName && uniq.length >= 1) {
      firstName = uniq.find((n) => n !== lastName) ?? null;
    }
  }

  if (mrzNamesLookSwapped(firstName, lastName)) {
    return { firstName: lastName, lastName: firstName };
  }

  return { firstName, lastName };
}

function guessNamesFromLayout(lines: string[]): { firstName: string | null; lastName: string | null } {
  const L = normLines(lines);
  if (detectPassportFromOcr(L)) {
    const passportNames = extractPassportNamesFromOcr(L);
    if (isUsablePersonName(passportNames.firstName) || isUsablePersonName(passportNames.lastName)) {
      return passportNames;
    }
  }
  const ordered = L.filter((l) => isNameCandidateLine(l))
    .map((l) => cleanPersonName(l))
    .filter((n): n is string => !!n);

  if (ordered.length >= 2) {
    return { lastName: ordered[0]!, firstName: ordered[1]! };
  }
  if (ordered.length === 1) {
    const parts = ordered[0]!.split(/\s+/);
    if (parts.length >= 2) {
      return { lastName: parts[0]!, firstName: parts.slice(1).join(' ') };
    }
  }
  return { firstName: null, lastName: null };
}

function resolveNames(lines: string[]): { firstName: string | null; lastName: string | null } {
  const labeled = extractNamesFromOcr(lines);
  if (isUsablePersonName(labeled.firstName) && isUsablePersonName(labeled.lastName)) {
    return correctSwappedMrzNames(labeled);
  }
  const guessed = guessNamesFromLayout(lines);
  const merged = {
    firstName: coalescePersonName(labeled.firstName, guessed.firstName),
    lastName: coalescePersonName(labeled.lastName, guessed.lastName),
  };
  return correctSwappedMrzNames(merged);
}

function detectTemporaryProtection(lines: string[]): boolean {
  const j = normLines(lines).join(' ').toUpperCase();
  return j.includes('GECICI KORUMA') || j.includes('GEÇİCİ KORUMA') || j.includes('GECICI KORUMA KIMLIK');
}

function isPlausibleBirthIso(iso: string): boolean {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const ageYears = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return ageYears >= 0 && ageYears <= 120;
}

function allTrDatesFromLines(L: string[]): string[] {
  const found: string[] = [];
  for (const line of L) {
    for (const dm of line.matchAll(DATE_RE_GLOBAL)) {
      const iso = isoFromTrDate(dm);
      if (iso) found.push(iso);
    }
  }
  return found;
}

function extractBirthDate(lines: string[]): string | null {
  const L = normLines(lines);
  const joined = L.join('\n');
  const inline = joined.match(BIRTH_INLINE_RE);
  if (inline?.[1]) {
    const dm = inline[1].match(DATE_RE);
    if (dm) {
      const iso = isoFromTrDate(dm);
      if (iso && isPlausibleBirthIso(iso)) return iso;
    }
  }

  for (const m of joined.matchAll(PASSPORT_ALPHA_DATE_INLINE_RE)) {
    const chunk = m[1] ?? '';
    const alpha = chunk.match(/(\d{1,2})\s+([A-ZÇĞİÖŞÜa-zçğıöşü]{3,9})\s+(\d{4})/i);
    if (alpha) {
      const iso = isoFromAlphaDate(alpha[1]!, alpha[2]!, alpha[3]!);
      if (iso && isPlausibleBirthIso(iso)) return iso;
    }
  }

  for (let i = 0; i < L.length; i++) {
    if (BIRTH_LINE_LABEL_RE.test(L[i]!)) {
      for (let j = 0; j <= 2; j++) {
        const line = L[i + j] ?? '';
        const dm = line.match(DATE_RE);
        if (dm) {
          const iso = isoFromTrDate(dm);
          if (iso && isPlausibleBirthIso(iso)) return iso;
        }
        const alpha = line.match(/(\d{1,2})\s+([A-ZÇĞİÖŞÜa-zçğıöşü]{3,9})\s+(\d{4})/i);
        if (alpha) {
          const iso = isoFromAlphaDate(alpha[1]!, alpha[2]!, alpha[3]!);
          if (iso && isPlausibleBirthIso(iso)) return iso;
        }
      }
    }
  }

  const found = [...allTrDatesFromLines(L), ...allAlphaDatesFromLines(L)].filter(isPlausibleBirthIso);
  if (found.length === 0) return null;
  return found.sort()[0]!;
}

function extractExpiryDateFromOcr(lines: string[]): string | null {
  const L = normLines(lines);
  const joined = L.join('\n');
  const inline = joined.match(EXPIRY_INLINE_RE);
  if (inline?.[1]) {
    const dm = inline[1].match(DATE_RE);
    if (dm) {
      const iso = isoFromTrDate(dm);
      if (iso && isPlausibleExpiryIso(iso)) return iso;
    }
  }

  for (const m of joined.matchAll(PASSPORT_ALPHA_DATE_INLINE_RE)) {
    const chunk = m[0] ?? '';
    if (!EXPIRY_LINE_LABEL_RE.test(chunk)) continue;
    const alpha = (m[1] ?? '').match(/(\d{1,2})\s+([A-ZÇĞİÖŞÜa-zçğıöşü]{3,9})\s+(\d{4})/i);
    if (alpha) {
      const iso = isoFromAlphaDate(alpha[1]!, alpha[2]!, alpha[3]!);
      if (iso && isPlausibleExpiryIso(iso)) return iso;
    }
  }

  const tagged: string[] = [];
  for (let i = 0; i < L.length; i++) {
    if (!EXPIRY_LINE_LABEL_RE.test(L[i]!) && !EXPIRY_LINE_LABEL_RE.test(L[i + 1] ?? '')) continue;
    for (let j = 0; j <= 2; j++) {
      const line = L[i + j] ?? '';
      const dm = line.match(DATE_RE);
      if (dm) {
        const iso = isoFromTrDate(dm);
        if (iso && isPlausibleExpiryIso(iso)) tagged.push(iso);
      }
      const alpha = line.match(/(\d{1,2})\s+([A-ZÇĞİÖŞÜa-zçğıöşü]{3,9})\s+(\d{4})/i);
      if (alpha) {
        const iso = isoFromAlphaDate(alpha[1]!, alpha[2]!, alpha[3]!);
        if (iso && isPlausibleExpiryIso(iso)) tagged.push(iso);
      }
    }
  }
  if (tagged.length > 0) return tagged.sort().pop()!;

  const birth = extractBirthDate(lines);
  const all = [...allTrDatesFromLines(L), ...allAlphaDatesFromLines(L)].filter(
    (iso) => iso !== birth && isPlausibleExpiryIso(iso)
  );
  if (all.length === 0) return null;
  return all.sort().pop()!;
}

function extractIdCardDates(lines: string[]): { birthDate: string | null; expiryDate: string | null } {
  let birthDate = extractBirthDate(lines);
  let expiryDate = extractExpiryDateFromOcr(lines);
  const L = normLines(lines);
  const allBirth = [...allTrDatesFromLines(L), ...allAlphaDatesFromLines(L)].filter(isPlausibleBirthIso);
  const allExpiry = [...allTrDatesFromLines(L), ...allAlphaDatesFromLines(L)].filter(isPlausibleExpiryIso);

  if (!birthDate && allBirth.length > 0) birthDate = allBirth.sort()[0]!;
  if (!expiryDate && allExpiry.length > 0) {
    expiryDate = allExpiry.sort().pop()!;
    if (birthDate && expiryDate === birthDate) {
      expiryDate = allExpiry.filter((d) => d !== birthDate).sort().pop() ?? null;
    }
  }
  return { birthDate, expiryDate };
}

export function extractNationalityFromOcr(lines: string[]): string | null {
  const L = normLines(lines);
  for (let i = 0; i < L.length; i++) {
    const line = L[i]!;
    const inline = line.match(NATIONALITY_INLINE_RE);
    if (inline?.[1]) {
      const code = mapNationalityTextToCode(inline[1]);
      if (code) return code;
    }
    if (NATIONALITY_LINE_LABEL_RE.test(line)) {
      for (const next of [L[i + 1], L[i + 2]].filter(Boolean)) {
        const code = mapNationalityTextToCode(next!);
        if (code) return code;
      }
    }
  }
  for (const line of L) {
    const c = line.trim().toUpperCase();
    if (isKnownIcao3(c)) return c;
  }
  return null;
}

function isPlausibleExpiryIso(iso: string): boolean {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const yearsAhead = (d.getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000);
  return yearsAhead >= -2 && yearsAhead <= 30;
}

export function extractGenderFromOcr(lines: string[]): 'M' | 'F' | 'X' | null {
  const L = normLines(lines);
  for (let i = 0; i < L.length; i++) {
    const line = L[i]!;
    const next = (L[i + 1] ?? '').trim();
    const blob = `${line} ${next}`.toUpperCase();
    if (GENDER_LINE_RE.test(line) || GENDER_LINE_RE.test(next) || /CINSIYET|SEX|GENDER/.test(blob)) {
      if (GENDER_F_RE.test(blob)) return 'F';
      if (GENDER_M_RE.test(blob)) return 'M';
    }
    const solo = line.trim().toUpperCase();
    if (solo === 'ERKEK' || solo === 'E') return 'M';
    if (solo === 'KADIN' || solo === 'KADIN' || solo === 'K') return 'F';
  }
  return null;
}

function detectPassportFromOcr(lines: string[]): boolean {
  const j = normLines(lines).join(' ').toUpperCase();
  return (
    /\bPASSPORT\b/.test(j) ||
    /\bPASAPORT\b/.test(j) ||
    /\bP<TUR\b/.test(j) ||
    /REPUBLIC\s+OF\s+TURKEY/.test(j) ||
    /TURKIYE\s+CUMHURIYETI.*PASAPORT/.test(j.replace(/Ü/g, 'U').replace(/İ/g, 'I'))
  );
}

function extractPassportNumberFromOcr(lines: string[]): string | null {
  const L = normLines(lines);
  for (let i = 0; i < L.length; i++) {
    if (!PASSPORT_LABEL_RE.test(L[i]!)) continue;
    const onLine = L[i]!.match(PASSPORT_DOC_RE);
    if (onLine?.[1] && !TC_RE.test(onLine[1])) return onLine[1]!.toUpperCase();
    const next = L[i + 1]?.match(PASSPORT_DOC_RE);
    if (next?.[1] && !TC_RE.test(next[1])) return next[1]!.toUpperCase();
  }
  for (const line of L) {
    const m = line.match(PASSPORT_DOC_RE);
    if (m?.[1] && !TC_RE.test(m[1]) && !YKN_RE.test(m[1])) return m[1]!.toUpperCase();
  }
  return null;
}

function pickDocumentNumber(
  tc: string | null,
  ykn: string | null,
  passportNo: string | null
): string | null {
  return tc ?? ykn ?? passportNo ?? null;
}

function mergeNameFields(
  parsed: ParsedDocument,
  id: ParsedDocument & TurkishIdOcrExtras,
  lines: string[]
): Pick<ParsedDocument, 'firstName' | 'lastName' | 'fullName' | 'middleName'> {
  const ocrNames = extractNamesFromOcr(lines);
  const fromFull = splitFullNameToFirstLast(parsed.fullName);
  const fromIdFull = splitFullNameToFirstLast(id.fullName);

  const mrzCorrected = correctSwappedMrzNames({
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    nationalityCode: parsed.nationalityCode,
    issuingCountryCode: parsed.issuingCountryCode,
  });

  if (
    parsed.rawMrz &&
    mrzNamesLookValid(mrzCorrected.firstName, mrzCorrected.lastName)
  ) {
    const stripped = stripSurnameFromGivenNames(mrzCorrected.firstName, mrzCorrected.lastName);
    const fullName = [stripped.firstName, stripped.lastName].filter(Boolean).join(' ').trim() || null;
    return {
      firstName: stripped.firstName,
      lastName: stripped.lastName,
      fullName,
      middleName: parsed.middleName,
    };
  }

  const ocrLabeled =
    isUsablePersonName(ocrNames.firstName) && isUsablePersonName(ocrNames.lastName);
  const turkish = isTurkishMrzDocument(parsed.nationalityCode, parsed.issuingCountryCode);
  const preferOcrNames =
    !parsed.rawMrz &&
    ocrLabeled &&
    !turkish &&
    (mrzNamesLookSwapped(parsed.firstName, parsed.lastName) ||
      !mrzNamesLookValid(parsed.firstName, parsed.lastName));

  const mrzGiven = parsed.middleName
    ? `${mrzCorrected.firstName ?? ''} ${parsed.middleName}`.trim()
    : mrzCorrected.firstName;

  const firstName = preferOcrNames
    ? ocrNames.firstName
    : coalescePersonName(
        mrzGiven,
        ocrNames.firstName,
        id.firstName,
        fromFull.firstName,
        fromIdFull.firstName
      );

  const lastName = preferOcrNames
    ? ocrNames.lastName
    : coalescePersonName(
        mrzCorrected.lastName,
        ocrNames.lastName,
        id.lastName,
        fromFull.lastName,
        fromIdFull.lastName
      );

  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;

  let middleName = parsed.middleName;
  if (firstName && parsed.firstName && parsed.middleName) {
    const extra = sanitizePersonName(
      `${parsed.middleName}`.trim()
    );
    if (extra && !firstName.includes(extra)) middleName = parsed.middleName;
    else middleName = null;
  }

  return { firstName, lastName, fullName, middleName };
}

/**
 * TC / YKN / geçici koruma kimliği ön yüz OCR (NFC yok).
 */
export function parseIdCardFromOcrLines(lines: string[]): ParsedDocument & TurkishIdOcrExtras {
  const L = normLines(lines);
  const joined = L.join('\n');

  const tc = extractTurkishNationalIdFromOcr(L) ?? joined.match(TC_RE)?.[1] ?? null;
  const ykn = joined.match(YKN_RE)?.[1] ?? null;
  const passportNo = extractPassportNumberFromOcr(L);
  const serial = extractDocumentSerialFromOcr(L);
  const { birthDate, expiryDate } = extractIdCardDates(L);
  const nationalityOcr = extractNationalityFromOcr(L);
  const gender = extractGenderFromOcr(L);
  const { firstName, lastName } = resolveNames(L);
  const isPassport = detectPassportFromOcr(L) || !!passportNo;
  const isYkn = !!ykn && !tc;
  const isTc = !!tc;
  const isGkk = detectTemporaryProtection(L);
  const docNo = pickDocumentNumber(tc, ykn, passportNo);

  const warnings: string[] = [];
  if (!docNo) warnings.push('no_identity_number');
  if (!isUsablePersonName(firstName) || !isUsablePersonName(lastName)) warnings.push('name_uncertain');
  if (isGkk && !serial) warnings.push('serial_uncertain');

  const confidence =
    docNo && isUsablePersonName(firstName) && isUsablePersonName(lastName) && birthDate ? 0.82 : docNo ? 0.58 : 0.35;

  let documentType: ParsedDocument['documentType'] = 'other';
  if (isTc) documentType = 'id_card';
  else if (isPassport) documentType = 'passport';
  else if (isYkn || isGkk) documentType = 'residence_permit';

  return {
    documentType,
    fullName: [firstName, lastName].filter(Boolean).join(' ') || null,
    firstName,
    lastName,
    middleName: null,
    documentNumber: docNo,
    nationalityCode: isTc ? 'TUR' : nationalityOcr,
    issuingCountryCode: isTc ? 'TUR' : nationalityOcr,
    birthDate,
    expiryDate,
    gender,
    rawMrz: null,
    confidence,
    checksumsValid: null,
    warnings,
    documentSeries: serial,
    motherName: null,
    fatherName: null,
  };
}

/**
 * MRZ sonucu + ön yüz: yalnızca seri, anne-baba, medeni hal; ad/soyad MRZ’den kalır.
 */
export function enrichMrzParsedWithFrontOcr(
  parsed: ParsedDocument,
  lines: string[]
): ParsedDocument & TurkishIdOcrExtras {
  const serial = extractDocumentSerialFromOcr(lines) ?? parsed.documentSeries;
  const parents = extractParentNamesFromOcr(lines);
  const maritalStatus = extractMaritalStatusFromOcr(lines);
  const natCode = parsed.nationalityCode ?? extractNationalityFromOcr(lines);
  const { birthDate, expiryDate } = extractIdCardDates(lines);

  const bestNames = resolveBestPassportNames({ parsed, ocrLines: lines });
  const firstName = bestNames.firstName ?? parsed.firstName;
  const lastName = bestNames.lastName ?? parsed.lastName;
  const fullName =
    bestNames.fullName ??
    ([firstName, lastName].filter(Boolean).join(' ').trim() || parsed.fullName);

  return {
    ...parsed,
    firstName,
    lastName,
    fullName,
    nationalityCode: natCode,
    issuingCountryCode: parsed.issuingCountryCode ?? natCode,
    documentSeries: serial ?? parsed.documentSeries ?? null,
    motherName: parents.motherName ?? parsed.motherName ?? null,
    fatherName: parents.fatherName ?? parsed.fatherName ?? null,
    maritalStatus: maritalStatus ?? parsed.maritalStatus ?? null,
    birthDate: parsed.birthDate ?? birthDate,
    expiryDate: parsed.expiryDate ?? expiryDate,
    gender: parsed.gender ?? extractGenderFromOcr(lines),
  };
}

/**
 * Galeri / karma görüntü: MRZ + ön yüz OCR birleşimi (ad, soyad, seri, anne-baba, YKN).
 */
export function enrichParsedWithIdCardOcr(
  parsed: ParsedDocument,
  lines: string[]
): ParsedDocument & TurkishIdOcrExtras {
  const id = parseIdCardFromOcrLines(lines);
  const serial = extractDocumentSerialFromOcr(lines) ?? id.documentSeries;
  const joined = normLines(lines).join('\n');
  const ykn = joined.match(YKN_RE)?.[1] ?? null;
  const tc = extractTurkishNationalIdFromOcr(lines) ?? joined.match(TC_RE)?.[1] ?? null;

  let documentNumber = parsed.documentNumber;
  if (ykn && (!documentNumber || !/^99\d{9}$/.test(String(documentNumber).replace(/\D/g, '')))) {
    documentNumber = ykn;
  } else if (tc && (!documentNumber || String(documentNumber).replace(/\D/g, '').length !== 11)) {
    documentNumber = tc;
  } else if (!documentNumber && id.documentNumber) {
    documentNumber = id.documentNumber;
  }

  const names = mergeNameFields(parsed, id, lines);
  const parents = extractParentNamesFromOcr(lines);
  const maritalStatus = extractMaritalStatusFromOcr(lines);

  let documentType = parsed.documentType;
  if (documentType === 'other' && (id.documentType === 'residence_permit' || detectTemporaryProtection(lines))) {
    documentType = 'residence_permit';
  }

  const natCode =
    parsed.nationalityCode ?? extractNationalityFromOcr(lines) ?? id.nationalityCode;
  const issuing = parsed.issuingCountryCode ?? natCode ?? id.issuingCountryCode;

  const fullName =
    names.firstName && names.lastName
      ? `${names.firstName} ${names.lastName}`.trim()
      : names.fullName;

  return {
    ...parsed,
    documentType,
    documentNumber,
    firstName: names.firstName,
    lastName: names.lastName,
    fullName,
    middleName: names.middleName,
    birthDate: parsed.birthDate ?? id.birthDate,
    expiryDate: parsed.expiryDate ?? id.expiryDate ?? extractExpiryDateFromOcr(lines),
    gender: parsed.gender ?? id.gender,
    nationalityCode: natCode,
    issuingCountryCode: issuing,
    documentSeries: serial,
    motherName: parents.motherName ?? parsed.motherName ?? null,
    fatherName: parents.fatherName ?? parsed.fatherName ?? null,
    maritalStatus: maritalStatus ?? parsed.maritalStatus ?? null,
    confidence: parsed.confidence ?? id.confidence,
  };
}

/** Galeri sonucu yeterli alan içeriyor mu. */
export function galleryParsedHasMinimumFields(parsed: ParsedDocument): boolean {
  const hasId = !!(parsed.documentNumber && String(parsed.documentNumber).replace(/\D/g, '').length >= 6);
  const hasNames = isUsablePersonName(parsed.firstName) && isUsablePersonName(parsed.lastName);
  return hasId && hasNames;
}
