import type { ParsedDocument } from '@/lib/scanner/types';
import { normalizeOcrLines } from '@/lib/guestScan/ocrLineNormalize';
import {
  coalescePersonName,
  isOcrLabelOnlyName,
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
import { hasPlausibleKbsDocumentNumber } from '@/lib/kbsDocumentNumberValidate';
import { resolveKbsDocumentSeries } from '@/lib/kbsDocumentSeries';
import { isValidTurkishTc } from '@/lib/kbsTcValidation';
import { parseTd3MrzFallback } from '@/lib/scanner/mrzTd3Fallback';

const TC_RE = /\b([1-9]\d{10})\b/;
const DATE_RE = /\b(\d{2})[./-](\d{2})[./-](\d{4})\b/;
const DATE_RE_GLOBAL = /\b(\d{2})[./-](\d{2})[./-](\d{4})\b/g;
/** ISO / GCC: 1990-01-15 veya 1990/01/15 */
const DATE_ISO_RE = /\b(\d{4})[./-](\d{2})[./-](\d{2})\b/;
const DATE_ISO_RE_GLOBAL = /\b(\d{4})[./-](\d{2})[./-](\d{2})\b/g;
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

const LABEL_VALUE_SEP = '(?:\\s*[:\\/-]\\s*|\\s+)';
const SURNAME_INLINE_RE = new RegExp(
  `(?:^|\\b)(?:soyad[ıi]?|soyadi|surname|family\\s*name|last\\s*name|nom)${LABEL_VALUE_SEP}(.*)$`,
  'i'
);
const GIVEN_INLINE_RE = new RegExp(
  `(?:^|\\b)(?:ad[ıi]?|adi|given\\s*names?|first\\s*names?|forename|prenom)${LABEL_VALUE_SEP}(.*)$`,
  'i'
);
const SURNAME_LINE_LABEL_RE =
  /^(?:soyad[ıi]?|soyadi|surname|surnames|family\s*name|last\s*name|nom)\s*$/i;
const GIVEN_LINE_LABEL_RE =
  /^(?:ad[ıi]?|adi|given(?:\s*names?)?|given\s*name(?:\(s\))?|first\s*names?|forename|forenames?|names?)\s*$/i;
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

const BIRTH_LINE_LABEL_RE =
  /(?:do[gğ]um\s*tarih|date\s*of\s*birth|birth\s*date|\bdob\b|tug.?ilgan\s*sana|tug\s*ilgan\s*samasi|تاريخ\s*الولادة|تاريخ\s*الميلاد)/i;
const BIRTH_INLINE_RE =
  /(?:do[gğ]um\s*tarihi?|date\s*of\s*birth|birth\s*date|\bdob\b|tug.?ilgan\s*sana(?:si)?|تاريخ\s*الولادة|تاريخ\s*الميلاد)\s*[:\/\s-]*(\d{2}[./-]\d{2}[./-]\d{4}|\d{4}[./-]\d{2}[./-]\d{2}|\d{1,2}\s+\d{1,2}\s+\d{4})/i;
const EXPIRY_LINE_LABEL_RE =
  /(?:son\s*geçerl|geçerlilik\s*tarih|valid\s*until|date\s*of\s*expiry|expiry\s*date|expires|valid\s*thru|date\s*of\s*expiration|amal\s*qilish\s*muddat|تاريخ\s*الانتهاء|تاريخ\s*انتهاء)/i;
const EXPIRY_INLINE_RE =
  /(?:son\s*geçerl(?:ilik)?\s*tarihi?|geçerlilik\s*tarihi?|valid\s*until|date\s*of\s*expiry|date\s*of\s*expiration|amal\s*qilish\s*muddat(?:i)?|تاريخ\s*الانتهاء)\s*[:\/\s-]*(\d{2}[./-]\d{2}[./-]\d{4}|\d{4}[./-]\d{2}[./-]\d{2}|\d{1,2}\s+\d{1,2}\s+\d{4})/i;
/** Veriliş tarihi — doğum/son geçerlilik sanılmasın. */
const ISSUE_LINE_LABEL_RE =
  /(?:date\s*of\s*issue|issue\s*date|verili[sş]\s*tarih|issuing\s*date|تاريخ\s*الاصدار|تاريخ\s*الإصدار)/i;
const NATIONALITY_INLINE_RE =
  /(?:^|\b)(?:uyruk|nationality|vatandaşlığı?|vatandasligi?|fuqarolig[iı]?|fuqaroligi)(?:\s*[:\-/\s]\s*|\s+)([A-Za-zÇĞİÖŞÜçğıöşü']{2,40})/i;
const NATIONALITY_LINE_LABEL_RE = /^(?:uyruk|nationality|vatandaşlığı?|fuqarolig)/i;
const GENDER_LINE_RE = /^(?:cinsiyet|sex|gender|erkek|kad[iı]n)\b/i;
const GENDER_M_RE = /\b(?:E\/M|ERKEK|MALE|\bM\b|\bE\b)\b/i;
const GENDER_F_RE = /\b(?:K\/F|KADIN|KADIN|FEMALE|\bF\b|\bK\b)\b/i;

const NOISE_NAME_RE =
  /^(?:türkiye|turkey|republic|cim|cumhuriyeti|cumhuriyet|kimlik|geçici|gecici|koruma|belgesi|identity|card|document|republic\s+of|valid|geçerlilik|uyruk|nationality|vatandas|vatandaş|masa|tezgah|table|desk|hotel|otel|resepsiyon|reception|valoria|wifi|menü|menu|kahve|coffee|restoran|instagram|facebook|whatsapp|pasaport|passport|passeport|pasaporte|specimen|type|turkiye|turk|reise|reisepass|authority|berilgan|tomonidan|otasining|otasinng|father|mother|signature|holders|fuqarolig|samarkand|region|uzbekistan|ozbekiston|kim\s+tomonidan)/i;

const PASSPORT_HEADER_RE =
  /(?:cumhuriyet|republic|pasaport|passport|passeport|turkiye|türkiye|turkey|specimen|reisepass|travel\s*document|belge\s*türü|document\s*type)/i;

/** Çift dilli etiket: "Surname / اسم العائلة", "Given names / الاسم". */
const PASSPORT_LABEL_SUFFIX = String.raw`(?:\s*\/\s*[^\n]{0,40})?\s*$`;
const PASSPORT_SURNAME_LINE_RE = new RegExp(
  `^(?:soyad[ıi]?|soyadi|surname|family\\s*name|last\\s*name|nom|apellidos?|familiyasi|familiyası|primary\\s*identifier)${PASSPORT_LABEL_SUFFIX}`,
  'i'
);
const PASSPORT_GIVEN_LINE_RE = new RegExp(
  `^(?:ad[ıi]?|adi|given(?:\\s*names?)?|given\\s*name(?:\\(s\\))?|first\\s*names?|forename|prenoms?|prenom|ismi|ism[iı]|secondary\\s*identifier)${PASSPORT_LABEL_SUFFIX}`,
  'i'
);
const PASSPORT_SURNAME_INLINE_RE = new RegExp(
  `(?:^|\\b)(?:soyad[ıi]?|soyadi|surname|family\\s*name|last\\s*name|nom|apellidos?|familiyasi|familiyası)${LABEL_VALUE_SEP}(.*)$`,
  'i'
);
const PASSPORT_GIVEN_INLINE_RE = new RegExp(
  `(?:^|\\b)(?:ad[ıi]?|adi|given\\s*names?|first\\s*names?|forename|prenoms?|prenom|ismi|ism[iı])${LABEL_VALUE_SEP}(.*)$`,
  'i'
);

/** Arapça / çift dilli pasaport — اسم العائلة / الاسم (Umman, Suudi vb.). */
const ARABIC_SURNAME_LABEL_RE =
  /(?:اسم\s*العائلة|اللقب|اسم\s*العائلة\s*\/|family\s*name\s*\/\s*اسم|primary\s*identifier)/i;
const ARABIC_GIVEN_LABEL_RE =
  /(?:^|\b)(?:الاسم|الاسماء|الاسم\s*الأول|الاسم\s* الاول|given\s*names?\s*\/\s*الاسم|secondary\s*identifier|أسماء\s*الأخرى)/i;
const ARABIC_FATHER_LABEL_RE = /(?:اسم\s*الأب|اسم\s*الاب|father(?:'s)?\s*name)/i;
const LATIN_NAME_LINE_RE = /^[A-Z][A-Z\s'.-]{2,72}$/;
/** Verilen ad devam satırı — tarih/etiket değil, yalnızca Latin isim. */
const LATIN_NAME_CONTINUATION_RE = /^[A-Z](?:[A-Z]|[A-Z\s'.-]{1,40})$/;

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

const PASSPORT_DOC_RE = /\b([A-Z]{1,3}\d{5,10})\b/;
const PASSPORT_LABEL_RE =
  /pasaport\s*(?:no|numara)|passport\s*(?:no|number|#)|document\s*(?:no|number)|doc(?:ument)?\.?\s*no\.?|رقم\s*(?:الجواز|الوثيقة|المستند)/i;
/** GCC pasaport — "NameALOTAIBI, MOHAMMED AATI M" / "ALOTAIBI, MOHAMMED ABDULLAH". */
const PASSPORT_COMMA_NAME_RE =
  /^(?:Name\s*)?([A-Z][A-Z\s'-]{1,48}),\s*([A-Z][A-Z\s'-]{1,72})$/i;

const GCC_PASSPORT_HEADER_RE =
  /(?:kingdom\s*of\s*saudi|saudi\s*arabia|saudi\s*passport|united\s*arab\s*emirates|u\.?a\.?e\.?|emirates\s*passport|state\s*of\s*qatar|qatar\s*passport|sultanate\s*of\s*oman|oman\s*passport|state\s*of\s*kuwait|kuwait\s*passport|kingdom\s*of\s*bahrain|bahrain\s*passport|republic\s*of\s*iraq|iraq\s*passport|hashemite\s*kingdom|jordan\s*passport|lebanese\s*republic|lebanon\s*passport|islamic\s*republic\s*of\s*iran|iran\s*passport)/i;

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

/** T.C. kimlik no — bitişik, boşluklu veya etiketli satırlardan (checksum zorunlu). */
export function extractTurkishNationalIdFromOcr(lines: string[]): string | null {
  const L = normLines(lines);

  // MRZ satırlarından T.C. çıkarma — pasaport şeridi yanlış pozitif üretir.
  const nonMrz = L.filter((line) => !isMrzLikeOcrLine(line));

  const tryDigits = (raw: string): string | null => {
    const d = normalizeTurkishIdDigits(raw);
    return d && isValidTurkishTc(d) ? d : null;
  };

  for (let i = 0; i < nonMrz.length; i++) {
    const line = nonMrz[i]!;
    if (!TC_LABEL_LINE_RE.test(line)) continue;
    const inline = line.match(/([0-9OIl\s.-]{11,18})/);
    if (inline?.[1]) {
      const d = tryDigits(inline[1]);
      if (d) return d;
    }
    for (let j = 1; j <= 2; j++) {
      const d = tryDigits(nonMrz[i + j] ?? '');
      if (d) return d;
    }
  }

  const joined = nonMrz.join('\n');
  const strict = joined.match(TC_RE)?.[1];
  if (strict && isValidTurkishTc(strict)) return strict;

  // Etiketsiz: yalnızca satır bağımsız 11 hane + checksum (tüm görselden kayan pencere YOK).
  for (const line of nonMrz) {
    if (line.includes('<')) continue;
    const m = line.match(TC_RE);
    if (m?.[1] && isValidTurkishTc(m[1])) return m[1];
  }

  return null;
}

function isMrzLikeOcrLine(line: string): boolean {
  const t = line.trim();
  if (t.includes('<<')) return true;
  if ((t.match(/</g) ?? []).length >= 2 && t.length >= 22) return true;
  if (/^[A-Z0-9<]{28,}$/i.test(t.replace(/\s/g, ''))) return true;
  return false;
}

/** Ön yüz T.C. kimlik parse sonucu MRZ yerine tercih edilsin mi. */
export function shouldPreferKbsFrontIdParse(frontParsed: ParsedDocument): boolean {
  // Pasaport / MRZ metni varken asla VIZ’e güvenme — MRZ doğru kaynak.
  if (frontParsed.documentType === 'passport' || frontParsed.rawMrz) return false;
  if ((frontParsed.warnings ?? []).some((w) => /passport|mrz/i.test(w))) return false;

  const digits = (frontParsed.documentNumber ?? '').replace(/\D/g, '');
  // Salt 11 hane yetmez — pasaport MRZ rakamları yanlış T.C. üretiyor; checksum şart.
  if (isValidTurkishTc(digits) && frontParsed.documentType === 'id_card') {
    return (
      isUsablePersonName(frontParsed.firstName) ||
      isUsablePersonName(frontParsed.lastName) ||
      !!frontParsed.birthDate
    );
  }
  return false;
}

function isoFromTrDate(m: RegExpMatchArray): string | null {
  const d = m[1];
  const mo = m[2];
  const y = m[3];
  if (!d || !mo || !y) return null;
  return `${y}-${mo}-${d}`;
}

function isoFromAnyDateToken(raw: string): string | null {
  const t = raw.trim();
  const iso = t.match(DATE_ISO_RE);
  if (iso) {
    const out = `${iso[1]}-${iso[2]}-${iso[3]}`;
    const d = new Date(`${out}T12:00:00Z`);
    if (!Number.isNaN(d.getTime())) return out;
  }
  const tr = t.match(DATE_RE);
  if (tr) return isoFromTrDate(tr);
  const spaced = t.match(/(\d{1,2})\s+(\d{1,2})\s+(\d{4})/);
  if (spaced) {
    return `${spaced[3]}-${spaced[2]!.padStart(2, '0')}-${spaced[1]!.padStart(2, '0')}`;
  }
  const alpha = t.match(/(\d{1,2})\s+([A-ZÇĞİÖŞÜa-zçğıöşü]{3,9})\s+(\d{4})/i);
  if (alpha) return isoFromAlphaDate(alpha[1]!, alpha[2]!, alpha[3]!);
  return null;
}

function lineLooksLikeHijri(line: string): boolean {
  return /[هھح]\s*\.?|hijri|\bA\.?H\.?\b|هجري/i.test(line);
}

function stripLabelTokensFromName(value: string): string | null {
  const tokens = value
    .replace(/[().]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !LABEL_TOKEN_RE.test(t));
  if (tokens.length === 0) return null;
  return tokens.join(' ');
}

function cleanPersonName(raw: string | null | undefined): string | null {
  const s = sanitizePersonName(raw);
  if (!s || NOISE_NAME_RE.test(s)) return null;
  if (PASSPORT_HEADER_RE.test(s)) return null;
  if (isNationalityLikeText(s)) return null;
  if (isOcrLabelOnlyName(s)) return null;
  if (TC_RE.test(s) || YKN_RE.test(s) || DATE_RE.test(s)) return null;
  if (SERIAL_FALLBACK_RE.test(s) && s.replace(/\s/g, '').length <= 12) return null;
  if (GENDER_LINE_RE.test(s)) return null;
  const stripped = stripLabelTokensFromName(s);
  if (!stripped || allTokensAreLabels(stripped) || isOcrLabelOnlyName(stripped)) return null;
  return stripped;
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
  const t = line.trim();
  if (TR_ID_SURNAME_LABEL_RE.test(t) || SURNAME_LINE_LABEL_RE.test(t)) return true;
  if (/^soyad[ıi]?\s*\/\s*surname\s*$/i.test(t)) return true;
  if (/^(?:surname|surnames|family\s*name|last\s*name)\s*$/i.test(t)) return true;
  return /soyad[ıi]?/i.test(t) && /\bsurname\b/i.test(t) && !cleanPersonName(t.replace(/soyad[ıi]?/i, '').replace(/surname/i, ''));
}

/** "Adı / Given Name(s)" gibi çift dilli ad etiketi satırı (değer değil). */
function isGivenLabelLine(line: string): boolean {
  if (isSurnameLabelLine(line)) return false;
  const t = line.trim();
  if (TR_ID_GIVEN_LABEL_RE.test(t) || GIVEN_LINE_LABEL_RE.test(t)) return true;
  if (/^given(?:\s*names?|\s*name(?:\(s\))?)\s*$/i.test(t)) return true;
  if (/given\s*names?|forename|first\s*names?/i.test(t) && !cleanPersonName(t.replace(/given\s*names?/i, '').replace(/forename/i, ''))) {
    return true;
  }
  return /^\s*ad[ıi]\s*(?:[\/:.\-]|given|name|$)/i.test(t);
}

function isPureEnglishNameLabelLine(line: string): boolean {
  const t = line
    .trim()
    .replace(/[().]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
  return /^(?:SURNAME|SURNAMES|GIVEN(?:\s+NAMES?)?|GIVEN\s*NAME(?:\(S\))?|FORENAME(?:S)?|FIRST\s*NAME(?:S)?|FAMILY\s*NAME|LAST\s*NAME|NAMES?)$/.test(
    t
  );
}

function isAnyNameLabelLine(line: string): boolean {
  return (
    isPureEnglishNameLabelLine(line) ||
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
function nextNameValueLine(L: string[], start: number, exclude?: string | null): string | null {
  const excludeKey = exclude?.replace(/\s+/g, ' ').trim().toUpperCase() ?? '';
  for (let j = start; j < Math.min(start + 6, L.length); j++) {
    const raw = (L[j] ?? '').trim();
    if (!raw) continue;
    if (isAnyNameLabelLine(raw) || isOtherFieldLabelLine(raw)) continue;
    if (TC_RE.test(raw) || YKN_RE.test(raw) || DATE_RE.test(raw)) continue;
    if (!isNameCandidateLine(raw)) continue;
    const v = cleanPersonName(raw);
    if (!v) continue;
    if (excludeKey && v.replace(/\s+/g, ' ').trim().toUpperCase() === excludeKey) continue;
    return v;
  }
  return null;
}

function inlineNameAfterLabel(line: string, kind: 'surname' | 'given'): string | null {
  const re = kind === 'surname' ? SURNAME_INLINE_RE : GIVEN_INLINE_RE;
  const m = line.match(re);
  if (!m?.[1]) return null;
  const tail = m[1].replace(/^[\/:\-\s]+/, '').trim();
  if (!tail) return null;
  return cleanPersonName(tail);
}

/** T.C. kimlik — "Soyadı/Surname YILMAZ" gibi etiket+değer aynı satır. */
function combinedTurkishIdLabelValue(line: string, kind: 'surname' | 'given'): string | null {
  const patterns =
    kind === 'surname'
      ? [
          /^(?:soyad[ıi]?|soyadi)(?:\s*\/\s*surname)?\s+(.+)$/i,
          /^(?:surname|family\s*name|last\s*name)\s+(.+)$/i,
        ]
      : [
          /^(?:ad[ıi]?|adi)(?:\s*\/\s*(?:given\s*names?(?:\(s\))?|name(?:\(s\)|s)?))?\s+(.+)$/i,
          /^(?:given\s*names?(?:\(s\))?|forename|first\s*names?)\s+(.+)$/i,
        ];
  for (const re of patterns) {
    const m = line.trim().match(re);
    if (m?.[1]) {
      const v = cleanPersonName(m[1]);
      if (v) return v;
    }
  }
  return null;
}

function isTurkishIdSurnameLabelLine(line: string): boolean {
  return (
    isSurnameLabelLine(line) ||
    SURNAME_LINE_LABEL_RE.test(line) ||
    TR_ID_SURNAME_LABEL_RE.test(line)
  );
}

function isTurkishIdGivenLabelLine(line: string): boolean {
  if (isTurkishIdSurnameLabelLine(line)) return false;
  return (
    isGivenLabelLine(line) || GIVEN_LINE_LABEL_RE.test(line) || TR_ID_GIVEN_LABEL_RE.test(line)
  );
}

function valueFromTurkishIdLabelLine(line: string, kind: 'surname' | 'given'): string | null {
  return (
    coalescePersonName(
      combinedTurkishIdLabelValue(line, kind),
      inlineNameAfterLabel(line, kind)
    ) ?? null
  );
}

/** Etiket aralığındaki tüm geçerli ad/soyad değerleri (sırayla). */
function scanNameValuesInRange(
  L: string[],
  start: number,
  end: number,
  exclude?: string | null
): string[] {
  const excludeKey = exclude?.replace(/\s+/g, ' ').trim().toUpperCase() ?? '';
  const out: string[] = [];
  for (let j = start; j < Math.min(end, L.length); j++) {
    const raw = (L[j] ?? '').trim();
    if (!raw) continue;
    if (isAnyNameLabelLine(raw) || isOtherFieldLabelLine(raw)) continue;
    if (TC_RE.test(raw) || YKN_RE.test(raw) || DATE_RE.test(raw)) continue;
    const v = cleanPersonName(raw);
    if (!v) continue;
    if (excludeKey && v.replace(/\s+/g, ' ').trim().toUpperCase() === excludeKey) continue;
    out.push(v);
  }
  return out;
}

/**
 * T.C. kimlik ön yüz — kartta üstte soyadı, altta adı.
 * Etiket satırı + alt satır veya "Soyadı/Surname YILMAZ" tek satır.
 */
function extractTurkishIdCardNamesFromOcr(L: string[]): {
  firstName: string | null;
  lastName: string | null;
} {
  let surnameLabelIdx = -1;
  let givenLabelIdx = -1;

  for (let i = 0; i < L.length; i++) {
    const line = L[i]!;
    if (surnameLabelIdx < 0 && isTurkishIdSurnameLabelLine(line)) surnameLabelIdx = i;
    if (givenLabelIdx < 0 && isTurkishIdGivenLabelLine(line)) givenLabelIdx = i;
  }

  let lastName =
    surnameLabelIdx >= 0 ? valueFromTurkishIdLabelLine(L[surnameLabelIdx]!, 'surname') : null;
  let firstName =
    givenLabelIdx >= 0 ? valueFromTurkishIdLabelLine(L[givenLabelIdx]!, 'given') : null;

  // Kart düzeni: soyad etiketi her zaman ad etiketinin üstünde.
  if (surnameLabelIdx >= 0 && givenLabelIdx > surnameLabelIdx) {
    const between = scanNameValuesInRange(L, surnameLabelIdx + 1, givenLabelIdx, null);
    const afterGiven = scanNameValuesInRange(L, givenLabelIdx + 1, givenLabelIdx + 6, null);

    if (!lastName && between[0]) lastName = between[0];
    if (!firstName && afterGiven.length === 1) firstName = afterGiven[0]!;

    // Etiketler bitişik — değerler ad etiketinin altında üst üste: soyad, ad.
    if (between.length === 0 && afterGiven.length >= 2) {
      if (!lastName) lastName = afterGiven[0]!;
      if (!firstName) firstName = afterGiven[1]!;
    } else if (!firstName && afterGiven[0] && afterGiven[0] !== lastName) {
      firstName = afterGiven[0]!;
    }
  } else if (surnameLabelIdx >= 0 && givenLabelIdx >= 0 && givenLabelIdx < surnameLabelIdx) {
    // OCR etiket sırası karttan farklı — değer etiketinin hemen altında.
    if (!firstName) firstName = nextNameValueLine(L, givenLabelIdx + 1, lastName);
    if (!lastName) lastName = nextNameValueLine(L, surnameLabelIdx + 1, firstName);
  } else {
    if (!lastName && surnameLabelIdx >= 0) {
      lastName = nextNameValueLine(L, surnameLabelIdx + 1, firstName);
    }
    if (!firstName && givenLabelIdx >= 0) {
      firstName = nextNameValueLine(L, givenLabelIdx + 1, lastName);
    }
  }

  // Etiket sırası ters ve hâlâ eksik — karttaki soyad→ad sırasıyla değerleri dene.
  if (
    surnameLabelIdx >= 0 &&
    givenLabelIdx >= 0 &&
    givenLabelIdx < surnameLabelIdx &&
    (!isUsablePersonName(lastName) || !isUsablePersonName(firstName) || lastName === firstName)
  ) {
    const afterTopLabel = scanNameValuesInRange(
      L,
      Math.min(surnameLabelIdx, givenLabelIdx) + 1,
      L.length,
      null
    );
    if (afterTopLabel.length >= 2) {
      lastName = afterTopLabel[0]!;
      firstName = afterTopLabel[1]!;
    }
  }

  if (!lastName || !firstName) {
    const candidates = L.filter((l) => isNameCandidateLine(l))
      .map((l) => cleanPersonName(l))
      .filter((n): n is string => !!n && !isOcrLabelOnlyName(n));
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

  return { firstName, lastName };
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
  if (isPureEnglishNameLabelLine(line)) return false;
  if (isSurnameLabelLine(line) || isGivenLabelLine(line)) return false;
  if (NOISE_NAME_RE.test(line) || isNationalityLikeText(line)) return false;
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(line)) return false;
  const letters = (line.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g) || []).length;
  const digits = (line.match(/\d/g) || []).length;
  return letters >= 3 && digits <= Math.max(2, Math.floor(letters * 0.15));
}

/** Seri no — etiket satırı; pasaport numarası asla seri sayılmaz. */
export function extractDocumentSerialFromOcr(
  lines: string[],
  opts?: { passportNumber?: string | null; documentType?: string | null }
): string | null {
  const L = normLines(lines);
  const passportNo = (opts?.passportNumber ?? '').replace(/\s/g, '').toUpperCase() || null;
  const isPassportDoc = opts?.documentType === 'passport' || L.some((l) => /passport|pasaport/i.test(l));

  const accept = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    const s = compactSerial(raw);
    if (!s) return null;
    if (passportNo && s === passportNo) return null;
    if (passportNo && (s.includes(passportNo) || passportNo.includes(s))) return null;
    if (isPassportDoc && hasPlausibleKbsDocumentNumber(s, 'passport')) return null;
    if (/^(?:MIA|MOI|MIN|GOV|POL)\d/i.test(s)) return null;
    return s;
  };

  for (let i = 0; i < L.length; i++) {
    const line = L[i]!;
    if (!SERIAL_LINE_LABEL_RE.test(line)) continue;
    const inline = line.match(SERIAL_TOKEN_RE);
    if (inline?.[1]) {
      const s = accept(inline[1]);
      if (s) return s;
    }
    const next = L[i + 1];
    if (next) {
      const m = next.match(SERIAL_TOKEN_RE);
      if (m?.[1]) {
        const s = accept(m[1]);
        if (s) return s;
      }
    }
  }

  // Pasaportta boşlukta seri arama yok (FA5213328 yanlışlıkla seri oluyordu).
  if (isPassportDoc) return null;

  for (const line of L) {
    if (SERIAL_LINE_LABEL_RE.test(line)) continue;
    if (PASSPORT_LABEL_RE.test(line)) continue;
    const m = line.match(SERIAL_TOKEN_RE);
    if (m?.[1]) {
      const s = accept(m[1]);
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

/** Etiket altındaki Latin ad + hemen sonraki devam satırlarını birleştir. */
function collectPassportNameAfterLabel(
  lines: string[],
  start: number,
  role: 'surname' | 'given'
): string | null {
  let firstIdx = -1;
  let first: string | null = null;

  for (let i = start; i < Math.min(start + 5, lines.length); i++) {
    const line = lines[i]!;
    if (!line?.trim()) continue;
    if (ARABIC_FATHER_LABEL_RE.test(line)) continue;
    if (role === 'surname' && (PASSPORT_GIVEN_LINE_RE.test(line) || ARABIC_GIVEN_LABEL_RE.test(line))) {
      continue;
    }
    if (role === 'given' && (PASSPORT_SURNAME_LINE_RE.test(line) || ARABIC_SURNAME_LABEL_RE.test(line))) {
      continue;
    }

    const inlineSurname = line.match(PASSPORT_SURNAME_INLINE_RE);
    if (role === 'surname' && inlineSurname?.[1]) {
      const v = cleanPassportPersonName(inlineSurname[1], 'surname');
      if (v) {
        first = v;
        firstIdx = i;
        break;
      }
    }
    const inlineGiven = line.match(PASSPORT_GIVEN_INLINE_RE);
    if (role === 'given' && inlineGiven?.[1]) {
      const v = cleanPassportPersonName(inlineGiven[1], 'given');
      if (v) {
        first = v;
        firstIdx = i;
        break;
      }
    }

    const latinOnly = line.trim().toUpperCase();
    if (LATIN_NAME_LINE_RE.test(latinOnly) || LATIN_NAME_CONTINUATION_RE.test(latinOnly)) {
      const v = cleanPassportPersonName(latinOnly, role);
      if (v) {
        first = v;
        firstIdx = i;
        break;
      }
    }

    const mixed = cleanPassportPersonName(
      line.replace(/[\u0600-\u06FF]/g, ' ').replace(/\s+/g, ' ').trim(),
      role
    );
    if (mixed && /[A-Z]{3,}/.test(mixed)) {
      first = mixed;
      firstIdx = i;
      break;
    }
  }

  if (!first || firstIdx < 0) return null;
  if (role === 'surname') return first;

  const parts = [first];
  for (let j = firstIdx + 1; j < Math.min(firstIdx + 3, lines.length); j++) {
    const raw = (lines[j] ?? '').trim().toUpperCase();
    if (!raw) break;
    if (
      PASSPORT_SURNAME_LINE_RE.test(raw) ||
      PASSPORT_GIVEN_LINE_RE.test(raw) ||
      ARABIC_SURNAME_LABEL_RE.test(raw) ||
      ARABIC_GIVEN_LABEL_RE.test(raw) ||
      ARABIC_FATHER_LABEL_RE.test(raw) ||
      /(?:date|birth|sex|national|passport|valid|expir|place|authority|holder)/i.test(raw)
    ) {
      break;
    }
    if (!LATIN_NAME_CONTINUATION_RE.test(raw) && !LATIN_NAME_LINE_RE.test(raw)) break;
    const cont = cleanPassportPersonName(raw, 'given');
    if (!cont) break;
    const merged = cleanPassportPersonName(`${parts.join(' ')} ${cont}`, 'given');
    if (!merged || merged === parts.join(' ')) break;
    parts.push(cont);
  }

  return cleanPassportPersonName(parts.join(' '), 'given');
}

/** Pasaport biyometrik sayfa — Surname / Given names etiketleri (tam metin). */
export function extractPassportNamesFromOcr(lines: string[]): {
  firstName: string | null;
  lastName: string | null;
} {
  const L = normLines(lines);
  let firstName: string | null = null;
  let lastName: string | null = null;

  for (let i = 0; i < L.length; i++) {
    const line = L[i]!;

    const commaName = line.match(PASSPORT_COMMA_NAME_RE);
    if (commaName?.[1] && commaName[2]) {
      // "SAUDI ARABIA, ..." gibi başlık satırlarını isim sanma.
      const lnCand = commaName[1].trim();
      if (
        !/(?:ARABIA|EMIRATES|SULTANATE|KINGDOM|REPUBLIC|STATE\s+OF|\bOMAN\b|\bQATAR\b|\bKUWAIT\b|\bBAHRAIN\b)/i.test(
          lnCand
        )
      ) {
        const ln = cleanPassportPersonName(lnCand, 'surname');
        const fn = cleanPassportPersonName(commaName[2].trim(), 'given');
        if (ln) lastName = preferLongerName(lastName, ln);
        if (fn) firstName = preferLongerName(firstName, fn);
      }
    }

    const surnameInline = line.match(PASSPORT_SURNAME_INLINE_RE);
    const surnameInlineClean = surnameInline?.[1]
      ? cleanPassportPersonName(surnameInline[1], 'surname')
      : null;
    if (surnameInlineClean) {
      lastName = preferLongerName(lastName, surnameInlineClean) ?? lastName;
    } else if (
      PASSPORT_SURNAME_LINE_RE.test(line) ||
      (ARABIC_SURNAME_LABEL_RE.test(line) && !ARABIC_FATHER_LABEL_RE.test(line)) ||
      // "Surname / اسم العائلة" — slash sonrası Arapça etiket, değer alt satırda
      (surnameInline?.[1] && /[\u0600-\u06FF]/.test(surnameInline[1]))
    ) {
      const inlineLatin = line.replace(/[\u0600-\u06FF]/g, ' ').replace(/\s+/g, ' ').trim();
      const fromInline = cleanPassportPersonName(
        inlineLatin.replace(/.*(?:surname|family\s*name|soyad|primary\s*identifier)/i, '').trim(),
        'surname'
      );
      if (fromInline) {
        lastName = preferLongerName(lastName, fromInline) ?? lastName;
      } else {
        const next = collectPassportNameAfterLabel(L, i + 1, 'surname');
        if (next) lastName = preferLongerName(lastName, next) ?? lastName;
      }
    }

    const givenInline = line.match(PASSPORT_GIVEN_INLINE_RE);
    const givenInlineClean = givenInline?.[1]
      ? cleanPassportPersonName(givenInline[1], 'given')
      : null;
    if (givenInlineClean) {
      const continued = preferLongerName(
        givenInlineClean,
        collectPassportNameAfterLabel(L, i + 1, 'given')
      );
      if (continued) firstName = preferLongerName(firstName, continued) ?? firstName;
    } else if (
      PASSPORT_GIVEN_LINE_RE.test(line) ||
      (ARABIC_GIVEN_LABEL_RE.test(line) && !ARABIC_FATHER_LABEL_RE.test(line)) ||
      (givenInline?.[1] && /[\u0600-\u06FF]/.test(givenInline[1]))
    ) {
      const next = collectPassportNameAfterLabel(L, i + 1, 'given');
      if (next) firstName = preferLongerName(firstName, next) ?? firstName;
    }
  }

  return { firstName, lastName };
}

function preferLongerName(current: string | null, next: string | null | undefined): string | null {
  if (!next) return current;
  if (!current) return next;
  if (next.length > current.length) return next;
  if (next.split(/\s+/).length > current.split(/\s+/).length) return next;
  return current;
}

/** Ad / soyad — etiketli satırlar, MRZ’siz ön yüz. */
export function extractNamesFromOcr(lines: string[]): { firstName: string | null; lastName: string | null } {
  const L = normLines(lines);
  const tc = extractTurkishNationalIdFromOcr(L);
  if (tc) {
    const trNames = extractTurkishIdCardNamesFromOcr(L);
    if (isUsablePersonName(trNames.firstName) && isUsablePersonName(trNames.lastName)) {
      return trNames;
    }
  }

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
    const surnameInlineVal = surnameInline ? inlineNameAfterLabel(line, 'surname') : null;
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
    const givenInlineVal = givenInline ? inlineNameAfterLabel(line, 'given') : null;
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
      const m = joined.match(
        /(?:SOYAD[İI]?)(?:\s*\/\s*SURNAME)?\s*[:\/\s]+([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s'-]{1,40})/i
      );
      lastName = cleanPersonName(m?.[1]) ?? lastName;
    }
    if (!firstName) {
      const m =
        joined.match(
          /(?:^|\n)\s*AD[İI]?(?:\s*\/\s*(?:GIVEN\s*NAME(?:\(S\))?|NAME(?:\(S\))?))?\s*[:\/\s]+([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s'-]{1,40})/i
        ) ??
        joined.match(
          /(?:GIVEN\s*NAME(?:S)?(?:\(S\))?)\s*[:\/\s]+([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s'-]{1,40})/i
        );
      firstName = cleanPersonName(m?.[1]) ?? firstName;
    }
  }

  if (!firstName || !lastName) {
    const candidates = L.filter((l) => isNameCandidateLine(l))
      .map((l) => cleanPersonName(l))
      .filter((n): n is string => !!n && !isNationalityLikeText(n) && !isOcrLabelOnlyName(n));
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

  if (tc) {
    const trNames = extractTurkishIdCardNamesFromOcr(L);
    firstName = coalescePersonName(trNames.firstName, firstName);
    lastName = coalescePersonName(trNames.lastName, lastName);
    return { firstName, lastName };
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
  const L = normLines(lines);
  const tc = extractTurkishNationalIdFromOcr(L);
  if (tc) {
    const trNames = extractTurkishIdCardNamesFromOcr(L);
    if (isUsablePersonName(trNames.firstName) && isUsablePersonName(trNames.lastName)) {
      return trNames;
    }
  }

  const labeled = extractNamesFromOcr(lines);
  if (isUsablePersonName(labeled.firstName) && isUsablePersonName(labeled.lastName)) {
    return tc ? labeled : correctSwappedMrzNames(labeled);
  }
  const guessed = guessNamesFromLayout(lines);
  const merged = {
    firstName: coalescePersonName(labeled.firstName, guessed.firstName),
    lastName: coalescePersonName(labeled.lastName, guessed.lastName),
  };
  if (tc) {
    const trNames = extractTurkishIdCardNamesFromOcr(L);
    return {
      firstName: coalescePersonName(trNames.firstName, merged.firstName),
      lastName: coalescePersonName(trNames.lastName, merged.lastName),
    };
  }
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
    if (lineLooksLikeHijri(line) || ISSUE_LINE_LABEL_RE.test(line)) continue;
    for (const dm of line.matchAll(DATE_RE_GLOBAL)) {
      const iso = isoFromTrDate(dm);
      if (iso) found.push(iso);
    }
    for (const dm of line.matchAll(DATE_ISO_RE_GLOBAL)) {
      const iso = `${dm[1]}-${dm[2]}-${dm[3]}`;
      const d = new Date(`${iso}T12:00:00Z`);
      if (!Number.isNaN(d.getTime())) found.push(iso);
    }
  }
  return found;
}

/** OCR'ın "16" "11" "2002" diye böldüğü tarihler. */
function assembleSplitDateFromLines(L: string[], start: number, kind: 'birth' | 'expiry'): string | null {
  const window = L.slice(start, start + 6).map((x) => x.trim());
  const joined = window.join(' ');
  const direct = isoFromAnyDateToken(joined);
  if (direct) {
    if (kind === 'birth' ? isPlausibleBirthIso(direct) : isPlausibleExpiryIso(direct)) return direct;
  }
  const spaced = joined.match(/(\d{1,2})\s+(\d{1,2})\s+(\d{4})/);
  if (spaced) {
    const iso = `${spaced[3]}-${spaced[2]!.padStart(2, '0')}-${spaced[1]!.padStart(2, '0')}`;
    if (kind === 'birth' ? isPlausibleBirthIso(iso) : isPlausibleExpiryIso(iso)) return iso;
  }
  const nums: string[] = [];
  for (const part of window) {
    if (/^\d{1,2}$/.test(part) || /^\d{4}$/.test(part)) nums.push(part);
    if (/^\d{1,2}\s+\d{1,2}$/.test(part)) nums.push(...part.split(/\s+/));
    if (nums.length >= 3) break;
  }
  if (nums.length >= 3) {
    const d = nums[0]!.padStart(2, '0');
    const m = nums[1]!.padStart(2, '0');
    const y = nums[2]!;
    if (y.length === 4) {
      const iso = `${y}-${m}-${d}`;
      if (kind === 'birth' ? isPlausibleBirthIso(iso) : isPlausibleExpiryIso(iso)) return iso;
    }
  }
  return null;
}

function extractDateNearLabel(
  lines: string[],
  labelRe: RegExp,
  kind: 'birth' | 'expiry'
): string | null {
  const L = normLines(lines);
  const ok = kind === 'birth' ? isPlausibleBirthIso : isPlausibleExpiryIso;
  for (let i = 0; i < L.length; i++) {
    const line = L[i]!;
    if (ISSUE_LINE_LABEL_RE.test(line) && !labelRe.test(line)) continue;
    if (lineLooksLikeHijri(line)) continue;
    if (!labelRe.test(line) && !labelRe.test(`${line} ${L[i + 1] ?? ''}`)) continue;

    for (let j = 0; j <= 3; j++) {
      const candidate = L[i + j] ?? '';
      if (j > 0 && ISSUE_LINE_LABEL_RE.test(candidate)) break;
      if (lineLooksLikeHijri(candidate)) continue;
      const iso = isoFromAnyDateToken(candidate);
      if (iso && ok(iso)) return iso;
      const alpha = candidate.match(/(\d{1,2})\s+([A-ZÇĞİÖŞÜa-zçğıöşü]{3,9})\s+(\d{4})/i);
      if (alpha) {
        const a = isoFromAlphaDate(alpha[1]!, alpha[2]!, alpha[3]!);
        if (a && ok(a)) return a;
      }
    }
    const split = assembleSplitDateFromLines(L, i + 1, kind);
    if (split) return split;
  }
  return null;
}

function extractBirthDate(lines: string[]): string | null {
  const L = normLines(lines);
  const joined = L.join('\n');
  const inline = joined.match(BIRTH_INLINE_RE);
  if (inline?.[1]) {
    const iso = isoFromAnyDateToken(inline[1]);
    if (iso && isPlausibleBirthIso(iso)) return iso;
  }

  for (const m of joined.matchAll(PASSPORT_ALPHA_DATE_INLINE_RE)) {
    const chunk = m[1] ?? '';
    const alpha = chunk.match(/(\d{1,2})\s+([A-ZÇĞİÖŞÜa-zçğıöşü]{3,9})\s+(\d{4})/i);
    if (alpha) {
      const iso = isoFromAlphaDate(alpha[1]!, alpha[2]!, alpha[3]!);
      if (iso && isPlausibleBirthIso(iso)) return iso;
    }
  }

  const labeled = extractDateNearLabel(lines, BIRTH_LINE_LABEL_RE, 'birth');
  if (labeled) return labeled;

  // Pasaportta etiketsiz "en eski tarih" tahminine güvenme — yanlış doğum üretir.
  if (detectPassportFromOcr(L)) return null;

  const found = [...allTrDatesFromLines(L), ...allAlphaDatesFromLines(L)].filter(isPlausibleBirthIso);
  if (found.length === 0) return null;
  return found.sort()[0]!;
}

function extractExpiryDateFromOcr(lines: string[]): string | null {
  const L = normLines(lines);
  const joined = L.join('\n');
  const inline = joined.match(EXPIRY_INLINE_RE);
  if (inline?.[1]) {
    const iso = isoFromAnyDateToken(inline[1]);
    if (iso && isPlausibleExpiryIso(iso)) return iso;
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

  const labeled = extractDateNearLabel(lines, EXPIRY_LINE_LABEL_RE, 'expiry');
  if (labeled) return labeled;

  const birth = extractBirthDate(lines);
  if (detectPassportFromOcr(L)) {
    // Etiketsiz en geç tarih — yalnızca doğumdan farklıysa yedek.
    const all = [...allTrDatesFromLines(L), ...allAlphaDatesFromLines(L)].filter(
      (iso) => iso !== birth && isPlausibleExpiryIso(iso) && (!birth || iso > birth)
    );
    return all.length > 0 ? all.sort().pop()! : null;
  }

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
  const passport = detectPassportFromOcr(L);

  if (!passport) {
    const allBirth = [...allTrDatesFromLines(L), ...allAlphaDatesFromLines(L)].filter(isPlausibleBirthIso);
    const allExpiry = [...allTrDatesFromLines(L), ...allAlphaDatesFromLines(L)].filter(isPlausibleExpiryIso);
    if (!birthDate && allBirth.length > 0) birthDate = allBirth.sort()[0]!;
    if (!expiryDate && allExpiry.length > 0) {
      expiryDate = allExpiry.sort().pop()!;
      if (birthDate && expiryDate === birthDate) {
        expiryDate = allExpiry.filter((d) => d !== birthDate).sort().pop() ?? null;
      }
    }
  }

  if (birthDate && expiryDate && birthDate > expiryDate) {
    expiryDate = null;
  }
  return { birthDate, expiryDate };
}

export function extractNationalityFromOcr(lines: string[]): string | null {
  const L = normLines(lines);
  const fromHeader = extractNationalityFromPassportHeader(L);
  if (fromHeader) return fromHeader;

  for (let i = 0; i < L.length; i++) {
    const line = L[i]!;
    const inline = line.match(NATIONALITY_INLINE_RE);
    if (inline?.[1]) {
      const code = mapNationalityTextToCode(inline[1]);
      if (code) return code;
    }
    if (NATIONALITY_LINE_LABEL_RE.test(line) || /country\s*code/i.test(line)) {
      for (const next of [L[i + 1], L[i + 2]].filter(Boolean)) {
        const code = mapNationalityTextToCode(next!);
        if (code) return code;
        const c = next!.trim().toUpperCase();
        if (isKnownIcao3(c)) return c;
      }
    }
  }
  // Rastgele 3 harfli satırlardan uyruk seçme — yanlış ülke üretiyordu.
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
  const L = normLines(lines);
  const j = L.join(' ').toUpperCase();
  if (/\bP<[A-Z]{3}\b/.test(j)) return true;
  if (/\bTYPE\s*P\b/.test(j) || /\bDOC(?:UMENT)?\s*TYPE\s*P\b/.test(j)) return true;
  const hasSurnameLabel = L.some((line) => PASSPORT_SURNAME_LINE_RE.test(line) || PASSPORT_SURNAME_INLINE_RE.test(line));
  const hasGivenLabel = L.some((line) => PASSPORT_GIVEN_LINE_RE.test(line) || PASSPORT_GIVEN_INLINE_RE.test(line));
  if (hasSurnameLabel && hasGivenLabel) return true;
  return (
    /\bPASSPORT\b/.test(j) ||
    /\bPASAPORT\b/.test(j) ||
    /\bP<TUR\b/.test(j) ||
    /\bP<SAU\b/.test(j) ||
    /\bP<ARE\b/.test(j) ||
    /\bP<QAT\b/.test(j) ||
    /\bP<OMN\b/.test(j) ||
    /\bP<KWT\b/.test(j) ||
    /\bP<BHR\b/.test(j) ||
    /\bP<IRQ\b/.test(j) ||
    /\bP<IRN\b/.test(j) ||
    /\bP<JOR\b/.test(j) ||
    /\bP<LBN\b/.test(j) ||
    GCC_PASSPORT_HEADER_RE.test(j) ||
    /REPUBLIC\s+OF\s+TURKEY/.test(j) ||
    /TURKIYE\s+CUMHURIYETI.*PASAPORT/.test(j.replace(/Ü/g, 'U').replace(/İ/g, 'I'))
  );
}

function extractPassportNumberFromMrzLines(rawMrz: string | null | undefined): string | null {
  if (!rawMrz?.trim()) return null;
  const fallback = parseTd3MrzFallback(rawMrz);
  return fallback?.documentNumber ?? null;
}

function extractNationalityFromPassportHeader(lines: string[]): string | null {
  const j = normLines(lines).join(' ').toUpperCase();
  if (/\bUZBEKISTAN\b|\bO'?ZBEKISTON\b|\bOZBEKISTON\b/.test(j)) return 'UZB';
  if (/SAUDI|KINGDOM\s*OF\s*SAUDI/.test(j)) return 'SAU';
  if (/EMIRATES|U\.?A\.?E\.?/.test(j) && !/SAUDI/.test(j)) return 'ARE';
  if (/\bQATAR\b/.test(j)) return 'QAT';
  if (/\bOMAN\b/.test(j)) return 'OMN';
  if (/\bKUWAIT\b/.test(j)) return 'KWT';
  if (/\bBAHRAIN\b/.test(j)) return 'BHR';
  if (/\bIRAQ\b/.test(j)) return 'IRQ';
  if (/\bIRAN\b/.test(j)) return 'IRN';
  if (/\bJORDAN\b/.test(j)) return 'JOR';
  if (/\bLEBANON\b/.test(j)) return 'LBN';
  if (/\bSYRIA\b/.test(j)) return 'SYR';
  if (/\bYEMEN\b/.test(j)) return 'YEM';
  if (/\bEGYPT\b/.test(j)) return 'EGY';
  if (/\bPALESTIN/.test(j)) return 'PSE';
  return null;
}

function extractPassportNumberFromOcr(lines: string[]): string | null {
  const L = normLines(lines);
  const cleanCandidate = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    const s = raw
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[^A-Z0-9]/g, '');
    if (!s || TC_RE.test(s) || YKN_RE.test(s)) return null;
    if (!hasPlausibleKbsDocumentNumber(s, 'passport')) return null;
    return s;
  };

  for (let i = 0; i < L.length; i++) {
    if (!PASSPORT_LABEL_RE.test(L[i]!)) continue;
    const onLine = L[i]!.match(PASSPORT_DOC_RE);
    const fromLine = cleanCandidate(onLine?.[1]);
    if (fromLine) return fromLine;
    // Etiket satırında boşluklu / OCR: "P A 1 2 3 4 5 6 7"
    const glued = cleanCandidate(L[i]!.replace(PASSPORT_LABEL_RE, '').replace(/\s+/g, ''));
    if (glued && /[A-Z]/.test(glued) && /\d/.test(glued)) return glued;
    for (let j = 1; j <= 2; j++) {
      const next = cleanCandidate(L[i + j]?.match(PASSPORT_DOC_RE)?.[1] ?? L[i + j]);
      if (next && /[A-Z]/.test(next) && /\d/.test(next)) return next;
    }
  }
  for (const line of L) {
    if (isMrzLikeOcrLine(line)) {
      const normalized = line.replace(/\s+/g, '');
      const mrzDoc = normalized.match(/^([A-Z][A-Z0-9]{5,8})<+[0-9A-Z]{3}/i);
      const fromMrz = cleanCandidate(mrzDoc?.[1]);
      if (fromMrz) return fromMrz;
      continue;
    }
    const m = line.match(PASSPORT_DOC_RE);
    const c = cleanCandidate(m?.[1]);
    if (c && /[A-Z]/.test(c) && /\d/.test(c)) return c;
  }
  return null;
}

/** Görsel (VIZ) pasaport kimlik alanları — etiketli okuma. */
export function extractPassportIdentityFromOcr(lines: string[]): {
  documentNumber: string | null;
  birthDate: string | null;
  expiryDate: string | null;
  gender: 'M' | 'F' | 'X' | null;
  nationalityCode: string | null;
} {
  const L = normLines(lines);
  const dates = extractIdCardDates(L);
  return {
    documentNumber: extractPassportNumberFromOcr(L),
    birthDate: dates.birthDate,
    expiryDate: dates.expiryDate,
    gender: extractGenderFromOcr(L),
    nationalityCode: extractNationalityFromOcr(L) ?? extractNationalityFromPassportHeader(L),
  };
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
  const turkishId =
    parsed.documentType === 'id_card' ||
    isTurkishMrzDocument(parsed.nationalityCode, parsed.issuingCountryCode);

  if (
    !turkishId &&
    (parsed.documentType === 'passport' || !!parsed.rawMrz || id.documentType === 'passport')
  ) {
    const best = resolveBestPassportNames({ parsed, ocrLines: lines });
    if (isUsablePersonName(best.firstName) && isUsablePersonName(best.lastName)) {
      // Verilen ad(lar) tam metin firstName’de — middle ayrımı Körfez’de kayıp yaratıyordu.
      return {
        firstName: best.firstName,
        lastName: best.lastName,
        fullName: best.fullName,
        middleName: null,
      };
    }
  }

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

  const tc = extractTurkishNationalIdFromOcr(L);
  const ykn = joined.match(YKN_RE)?.[1] ?? null;
  const passportNo = extractPassportNumberFromOcr(L);
  const { birthDate, expiryDate } = extractIdCardDates(L);
  const nationalityOcr = extractNationalityFromOcr(L);
  const gender = extractGenderFromOcr(L);
  const { firstName, lastName } = resolveNames(L);
  const isPassport = detectPassportFromOcr(L) || !!passportNo;
  const isYkn = !!ykn && !tc;
  // Checksum’lu T.C. yoksa pasaport rakamlarını T.C. sanma.
  const isTc = !!tc && isValidTurkishTc(tc) && !isPassport;
  const isGkk = detectTemporaryProtection(L);
  const docNo = isPassport
    ? pickDocumentNumber(null, ykn, passportNo) ?? (isTc ? tc : null)
    : pickDocumentNumber(tc, ykn, passportNo);

  let documentType: ParsedDocument['documentType'] = 'other';
  if (isPassport) documentType = 'passport';
  else if (isTc) documentType = 'id_card';
  else if (isYkn || isGkk) documentType = 'residence_permit';

  const serial = extractDocumentSerialFromOcr(L, {
    passportNumber: isPassport ? docNo ?? passportNo : null,
    documentType,
  });

  const warnings: string[] = [];
  if (!docNo) warnings.push('no_identity_number');
  if (!isUsablePersonName(firstName) || !isUsablePersonName(lastName)) warnings.push('name_uncertain');
  if (isGkk && !serial) warnings.push('serial_uncertain');

  const confidence =
    docNo && isUsablePersonName(firstName) && isUsablePersonName(lastName) && birthDate ? 0.82 : docNo ? 0.58 : 0.35;

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
    documentSeries: resolveKbsDocumentSeries({
      documentSeries: serial,
      documentNumber: docNo,
      documentType,
    }),
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
  const isPassportDoc =
    parsed.documentType === 'passport' || !!parsed.rawMrz || detectPassportFromOcr(lines);
  const passportNo =
    parsed.documentNumber ??
    extractPassportNumberFromMrzLines(parsed.rawMrz) ??
    extractPassportNumberFromOcr(lines);

  // MRZ varsa uyruk / tarih MRZ’den; VIZ yalnızca boş alan doldurur.
  const natCode =
    parsed.nationalityCode ??
    extractNationalityFromOcr(lines) ??
    extractNationalityFromPassportHeader(lines);
  const { birthDate, expiryDate } = extractIdCardDates(lines);

  let firstName = parsed.firstName;
  let lastName = parsed.lastName;
  let fullName = parsed.fullName;

  if (isPassportDoc && (!isUsablePersonName(firstName) || !isUsablePersonName(lastName))) {
    const best = resolveBestPassportNames({ parsed, ocrLines: lines });
    firstName = best.firstName ?? firstName;
    lastName = best.lastName ?? lastName;
    fullName = best.fullName ?? fullName;
  } else if (
    !parsed.rawMrz &&
    (parsed.documentType === 'id_card' || !!extractTurkishNationalIdFromOcr(normLines(lines)))
  ) {
    const tr = extractTurkishIdCardNamesFromOcr(normLines(lines));
    if (isUsablePersonName(tr.firstName) && isUsablePersonName(tr.lastName)) {
      firstName = tr.firstName;
      lastName = tr.lastName;
      fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || parsed.fullName;
    }
  }

  const docNumber =
    (parsed.rawMrz && parsed.checksumsValid === true ? parsed.documentNumber : null) ??
    passportNo ??
    parsed.documentNumber;
  const serial = extractDocumentSerialFromOcr(lines, {
    passportNumber: isPassportDoc ? docNumber ?? passportNo : null,
    documentType: isPassportDoc ? 'passport' : parsed.documentType,
  });
  const parents = extractParentNamesFromOcr(lines);
  const maritalStatus = extractMaritalStatusFromOcr(lines);

  const mrzTrusted = parsed.checksumsValid === true;
  const resolvedBirth = mrzTrusted
    ? parsed.birthDate ?? birthDate
    : birthDate && parsed.birthDate && birthDate !== parsed.birthDate
      ? birthDate
      : parsed.birthDate ?? birthDate;
  const resolvedExpiry = mrzTrusted
    ? parsed.expiryDate ?? expiryDate
    : expiryDate && parsed.expiryDate && expiryDate !== parsed.expiryDate
      ? expiryDate
      : parsed.expiryDate ?? expiryDate;

  return {
    ...parsed,
    firstName,
    lastName,
    fullName,
    documentNumber: docNumber,
    nationalityCode: natCode,
    issuingCountryCode: parsed.issuingCountryCode ?? natCode,
    documentSeries: resolveKbsDocumentSeries({
      documentSeries: serial ?? (isPassportDoc ? null : parsed.documentSeries ?? null),
      documentNumber: docNumber,
      documentType: isPassportDoc ? 'passport' : parsed.documentType,
    }),
    motherName: parents.motherName ?? parsed.motherName ?? null,
    fatherName: parents.fatherName ?? parsed.fatherName ?? null,
    maritalStatus: maritalStatus ?? parsed.maritalStatus ?? null,
    birthDate: resolvedBirth,
    expiryDate: resolvedExpiry,
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
  if (documentType === 'other' && id.documentType === 'passport') {
    documentType = 'passport';
  }

  const serial = extractDocumentSerialFromOcr(lines, {
    passportNumber: documentType === 'passport' ? documentNumber : null,
    documentType,
  }) ?? (documentType === 'passport' ? null : id.documentSeries);

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
    documentSeries: resolveKbsDocumentSeries({
      documentSeries: serial,
      documentNumber,
      documentType,
    }),
    motherName: parents.motherName ?? parsed.motherName ?? null,
    fatherName: parents.fatherName ?? parsed.fatherName ?? null,
    maritalStatus: maritalStatus ?? parsed.maritalStatus ?? null,
    confidence: parsed.confidence ?? id.confidence,
  };
}

/** Galeri sonucu yeterli alan içeriyor mu. */
export function galleryParsedHasMinimumFields(parsed: ParsedDocument): boolean {
  const hasId = hasPlausibleKbsDocumentNumber(parsed.documentNumber, parsed.documentType);
  const hasNames = isUsablePersonName(parsed.firstName) && isUsablePersonName(parsed.lastName);
  const hasMrz = !!parsed.rawMrz?.trim();
  if (hasNames && hasId) return true;
  if (hasMrz && hasNames) return true;
  if (hasNames && parsed.birthDate && (hasId || parsed.expiryDate)) return true;
  return false;
}
