import {
  isUsablePersonName,
  isOcrLabelOnlyName,
  sanitizePersonName,
  splitFullNameToFirstLast,
} from '@/lib/guestScan/personNameUtils';
import { isKnownIcao3 } from '@/lib/kbsNationalityMap';

const MRZ_NAME_NOISE_WORDS = new Set([
  'PASSPORT',
  'PASAPORT',
  'PASSEPORT',
  'PASSE',
  'SURNAME',
  'FAMILY',
  'NAME',
  'NAMES',
  'GIVEN',
  'FIRST',
  'FORENAME',
  'PRENOM',
  'PRENOMS',
  'NOM',
  'DATE',
  'BIRTH',
  'SEX',
  'GENDER',
  'NATIONALITY',
  'UYRUK',
  'VALID',
  'EXPIRY',
  'EXPIRES',
  'REPUBLIC',
  'KINGDOM',
  'STATE',
  'DOCUMENT',
  'TYPE',
  'SPECIMEN',
  'HOLDER',
  'SIGNATURE',
  'AUTHORITY',
  'ISSUE',
  'PLACE',
  'CODE',
  'MALE',
  'FEMALE',
  'ERKEK',
  'KADIN',
  'OF',
  'THE',
  'AND',
  'FOR',
  'UNITED',
  'ARAB',
  'EMIRATES',
  'KINGDOM',
  'SAUDI',
  'QATAR',
  'OMAN',
  'KUWAIT',
  'BAHRAIN',
  'YEMEN',
  'MINISTRY',
  'FOREIGN',
  'AFFAIRS',
  'INTERIOR',
  'NATIONAL',
  'CITIZEN',
  'CITIZENSHIP',
  'TRAVEL',
  'IDENTITY',
  'RESIDENCE',
  'PERMIT',
  'VISA',
]);

/** TD3 satır 1: P<SAU… — belge tipi + ülke kodu önekini soyad alanından ayır. */
function stripIcaoMrzNameLinePrefix(alpha: string): string {
  const m = alpha.match(/^[IPAVC]<?[A-Z]{3}(.+)$/i);
  if (m?.[1]?.includes('<<')) return m[1];
  return alpha;
}

/** MRZ / OCR ad-soyad — baştaki/sondaki gürültü kelimeleri kes; pasaporta yazılanı koru. */
export function trimMrzPersonNameTokens(
  raw: string | null | undefined,
  opts?: { maxWords?: number; role?: 'surname' | 'given' }
): string | null {
  // Soyad: AL GHAMDI / BIN ABDUL… gibi bileşikler; ad: uzun Körfez verilen adları.
  const maxWords = opts?.maxWords ?? (opts?.role === 'surname' ? 5 : 14);
  let s = sanitizePersonName(raw);
  if (!s) return null;
  let words = s.split(/\s+/).filter(Boolean);

  while (words.length > 0) {
    const w = words[0]!;
    if (MRZ_NAME_NOISE_WORDS.has(w)) {
      words.shift();
      continue;
    }
    // Baştaki tek harf genelde OCR artığı; ortadaki/sondaki initials (M, A) korunur.
    if (w.length === 1 && words.length > 1) {
      words.shift();
      continue;
    }
    if (w.length === 3 && isKnownIcao3(w) && words.length > 1) {
      words.shift();
      continue;
    }
    break;
  }

  const kept: string[] = [];
  for (const w of words) {
    if (MRZ_NAME_NOISE_WORDS.has(w)) break;
    if (/^\d{4,}$/.test(w)) break;
    // Tek harfli ad bileşeni (MOHAMMED AATI M) — pasaportta yazılıysa sakla.
    if (w.length === 1) {
      if (/^[A-ZÇĞİÖŞÜ]$/i.test(w) && kept.length > 0) {
        kept.push(w.toUpperCase());
        if (kept.length >= maxWords) break;
        continue;
      }
      break;
    }
    kept.push(w);
    if (kept.length >= maxWords) break;
  }

  const out = kept.join(' ').trim();
  return isUsablePersonName(out) ? out : null;
}

/** TD3 ad alanı (39 karakter) tamamen doluysa veya sonu filler değilse isim kesik olabilir. */
export function mrzNameFieldLooksTruncated(rawMrz: string | null | undefined): boolean {
  if (!rawMrz?.trim()) return false;
  const line = rawMrz
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[^A-Z0-9<]/gi, '').toUpperCase())
    .find((l) => /^[IPAVC]<[A-Z]{3}/.test(l) && l.includes('<<'));
  if (!line || line.length < 20) return false;
  const padded = line.length >= 44 ? line.slice(0, 44) : line.padEnd(44, '<');
  const nameField = padded.slice(5, 44);
  if (nameField.replace(/</g, '').length < 12) return false;
  // Son 2 karakter filler değilse alan dolmaya yakın → görsel ad ile tamamla.
  if (!nameField.endsWith('<')) return true;
  if (!/<{2,}$/.test(nameField)) return true;
  return false;
}

/**
 * Kısa ad (genelde MRZ) ile daha uzun görsel OCR — token uyumluysa tam olanı seç.
 * Ezber/ülke listesi yok; yalnızca metin uzantısı / kesik son kelime.
 */
export function preferCompletePersonName(
  primary: string | null | undefined,
  fuller: string | null | undefined
): string | null {
  const a = sanitizePersonName(primary);
  const b = sanitizePersonName(fuller);
  if (!a) return isUsablePersonName(b) ? b : null;
  if (!b) return isUsablePersonName(a) ? a : null;
  if (a === b) return a;

  const aw = a.split(/\s+/).filter(Boolean);
  const bw = b.split(/\s+/).filter(Boolean);

  // ALGHAMDI ↔ AL GHAMDI — görsel boşluklu yazımı tercih et (ezber değil, aynı harfler).
  if (aw.length === 1 && bw.length >= 2 && bw.join('') === aw[0]) return b;
  if (bw.length === 1 && aw.length >= 2 && aw.join('') === bw[0]) return a;

  if (nameTokensAreCompatiblePrefix(aw, bw) && (bw.length > aw.length || b.length > a.length)) {
    return b;
  }
  if (nameTokensAreCompatiblePrefix(bw, aw) && (aw.length > bw.length || a.length > b.length)) {
    return a;
  }

  // Aynı kelime sayısı; daha uzun yazım (ABDULLA → ABDULLAH).
  if (aw.length === bw.length) {
    let aScore = 0;
    let bScore = 0;
    for (let i = 0; i < aw.length; i++) {
      const x = aw[i]!;
      const y = bw[i]!;
      if (x === y) continue;
      if (y.startsWith(x) && y.length > x.length) bScore++;
      else if (x.startsWith(y) && x.length > y.length) aScore++;
      else return a.length >= b.length ? a : b;
    }
    if (bScore > aScore) return b;
    if (aScore > bScore) return a;
  }

  return a;
}

function nameTokensAreCompatiblePrefix(shorter: string[], longer: string[]): boolean {
  if (shorter.length === 0 || shorter.length > longer.length) return false;
  for (let i = 0; i < shorter.length; i++) {
    const s = shorter[i]!;
    const l = longer[i]!;
    if (s === l) continue;
    const last = i === shorter.length - 1;
    const minLen = Math.min(s.length, l.length);
    // MRZ sıkça ortasından keser: SA→SALEH, ABDULLA→ABDULLAH (2+ harf yeterli).
    if (last && minLen >= 2 && (l.startsWith(s) || s.startsWith(l))) continue;
    if (minLen >= 3 && (l.startsWith(s) || s.startsWith(l))) continue;
    return false;
  }
  return true;
}

function trimMrzGivenRaw(givenRaw: string): string {
  let s = givenRaw.split(/\s+(?=\d{6,})/)[0]?.trim() ?? givenRaw;
  s = s.replace(/\s+\d{6,}.*$/, '').trim();
  s = s.replace(/\s+[MFUX]\s*$/, '').trim();

  const words = s.split(/\s+/).filter(Boolean);
  while (words.length > 1) {
    const w = words[words.length - 1]!;
    if (MRZ_NAME_NOISE_WORDS.has(w) || (w.length === 3 && isKnownIcao3(w))) {
      words.pop();
      continue;
    }
    break;
  }
  return words.join(' ').trim();
}

const GCC_NAT = new Set([
  'OMN',
  'SAU',
  'QAT',
  'KWT',
  'ARE',
  'BHR',
  'YEM',
  'IRQ',
  'IRN',
  'JOR',
  'LBN',
  'SYR',
  'PSE',
]);

export function isGccNationality(code: string | null | undefined): boolean {
  return !!code && GCC_NAT.has(String(code).toUpperCase());
}

export function isTurkishMrzDocument(
  nationalityCode?: string | null,
  issuingCountryCode?: string | null
): boolean {
  const nat = (nationalityCode ?? '').toUpperCase();
  const iss = (issuingCountryCode ?? '').toUpperCase();
  return nat === 'TUR' || nat === 'TR' || iss === 'TUR' || iss === 'TR';
}

/** Arapça bileşik soyad öneki — AL GHAMDI, BIN SALMAN gibi soyadlar tek kelimeli adla normaldir. */
const ARABIC_SURNAME_PARTICLES = new Set(['AL', 'EL', 'AAL', 'BIN', 'BEN', 'IBN', 'ABU', 'ABD']);

/** MRZ: ad tek kelime, soyad birden fazla kelime → alanlar muhtemelen yer değiştirmiş. */
export function mrzNamesLookSwapped(firstName: string | null, lastName: string | null): boolean {
  const fp = (firstName ?? '').trim().split(/\s+/).filter(Boolean);
  const lp = (lastName ?? '').trim().split(/\s+/).filter(Boolean);
  if (fp.length !== 1 || lp.length < 2) return false;
  // Arapça bileşik soyad (AL GHAMDI, BIN SALMAN…) tek kelimeli adla birlikte normaldir; ters sayma.
  const head = (lp[0] ?? '').replace(/[-']+$/, '').toUpperCase();
  if (ARABIC_SURNAME_PARTICLES.has(head)) return false;
  return true;
}

export function mrzNamesLookValid(firstName: string | null, lastName: string | null): boolean {
  if (!isUsablePersonName(firstName) || !isUsablePersonName(lastName)) return false;
  if (isOcrLabelOnlyName(firstName) || isOcrLabelOnlyName(lastName)) return false;
  const fn = firstName!.toUpperCase();
  const ln = lastName!.toUpperCase();
  if (fn === ln) return false;
  if (ln.includes(` ${fn}`) && ln.replace(` ${fn}`, '').trim().length >= 2) return false;
  if (fn.includes(` ${ln}`) && fn.replace(` ${ln}`, '').trim().length < 2) return false;
  return true;
}

/** Körfez dışı belgelerde yaygın ad/soyad ters okuma düzeltmesi. */
export function correctSwappedMrzNames(args: {
  firstName: string | null;
  lastName: string | null;
  nationalityCode?: string | null;
  issuingCountryCode?: string | null;
}): { firstName: string | null; lastName: string | null } {
  const firstName = sanitizePersonName(args.firstName);
  const lastName = sanitizePersonName(args.lastName);
  const nat = (args.nationalityCode ?? '').toUpperCase();
  const iss = (args.issuingCountryCode ?? '').toUpperCase();
  // Körfez/Arap (ör. Suudi "AL GHAMDI" soyad + "MOHAMMED" ad) ve Türk belgelerinde
  // çok kelimeli soyad + tek kelimeli ad normaldir; kelime sayısına bakıp ters çevirme.
  if (isGccNationality(nat) || isGccNationality(iss) || isTurkishMrzDocument(nat, iss)) {
    return { firstName, lastName };
  }
  if (mrzNamesLookSwapped(firstName, lastName)) {
    return { firstName: lastName, lastName: firstName };
  }
  return { firstName, lastName };
}

/** MRZ satırındaki SOYAD<<AD(lar) — kütüphane ad alanına soyadı tekrar yazabiliyor. */
export function parseChevronNamesFromMrz(rawMrz: string | null | undefined): {
  surname: string | null;
  given: string | null;
} {
  if (!rawMrz?.trim()) return { surname: null, given: null };

  const lines = rawMrz
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim().toUpperCase())
    .filter((l) => l.includes('<<') && l.replace(/[^A-Z<]/g, '').length >= 8);

  const ranked = [...lines].sort((a, b) => (b.match(/</g) ?? []).length - (a.match(/</g) ?? []).length);

  for (const line of ranked) {
    let alpha = stripIcaoMrzNameLinePrefix(line.replace(/[^A-Z<]/g, ''));
    const sep = alpha.indexOf('<<');
    if (sep < 1) continue;

    const surnameRaw = alpha
      .slice(0, sep)
      .replace(/</g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const givenRaw = trimMrzGivenRaw(
      alpha
        .slice(sep + 2)
        .replace(/</g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    );

    const surname = trimMrzPersonNameTokens(surnameRaw, { role: 'surname' });
    const given = trimMrzPersonNameTokens(givenRaw, { role: 'given' });

    if (isUsablePersonName(surname)) {
      return {
        surname,
        given: isUsablePersonName(given) ? given : null,
      };
    }
  }

  return { surname: null, given: null };
}

/** Verilen ad(lar) alanında yinelenen soyadı kaldır. */
export function stripSurnameFromGivenNames(
  firstName: string | null,
  lastName: string | null
): { firstName: string | null; lastName: string | null } {
  let fn = firstName;
  const ln = lastName;
  if (!fn || !ln) return { firstName: fn, lastName: ln };

  const fnU = fn.toUpperCase();
  const lnU = ln.toUpperCase();
  const lnWords = lnU.split(/\s+/).filter(Boolean);
  const fnWords = fnU.split(/\s+/).filter(Boolean);

  if (fnU === lnU) {
    return { firstName: null, lastName: ln };
  }

  if (fnU.startsWith(`${lnU} `)) {
    const rest = fn.slice(ln.length).trim();
    fn = rest.length >= 2 ? sanitizePersonName(rest) : null;
    return { firstName: fn, lastName: ln };
  }

  let sharedPrefix = 0;
  while (
    sharedPrefix < lnWords.length &&
    sharedPrefix < fnWords.length &&
    fnWords[sharedPrefix] === lnWords[sharedPrefix]
  ) {
    sharedPrefix++;
  }
  if (sharedPrefix === lnWords.length && fnWords.length > sharedPrefix) {
    fn = sanitizePersonName(fnWords.slice(sharedPrefix).join(' '));
  }

  if (fn && fn.toUpperCase().endsWith(` ${lnU}`)) {
    const trimmed = fn.slice(0, -(ln.length + 1)).trim();
    fn = trimmed.length >= 2 ? sanitizePersonName(trimmed) : fn;
  }

  return { firstName: fn, lastName: ln };
}

/** Ad alanında yinelenen soyadı ayır (OCR/MRZ gürültüsü). */
function dedupeGivenAndSurname(firstName: string | null, lastName: string | null): {
  firstName: string | null;
  lastName: string | null;
} {
  return stripSurnameFromGivenNames(firstName, lastName);
}

/**
 * MRZ kütüphanesinden gelen ad/soyad → KBS ad + soyad.
 * Soyad MRZ’de tek kelime, verilen ad(lar) ayrı alanda kalır.
 */
export function finalizeMrzPersonNames(args: {
  firstNameRaw: string | null;
  lastNameRaw: string | null;
  fullNameRaw?: string | null;
  rawMrz?: string | null;
  nationalityCode?: string | null;
  issuingCountryCode?: string | null;
}): {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  middleName: string | null;
} {
  let firstName = sanitizePersonName(args.firstNameRaw);
  let lastName = sanitizePersonName(args.lastNameRaw);
  const fullNameFromField = sanitizePersonName(args.fullNameRaw);
  const turkish = isTurkishMrzDocument(args.nationalityCode, args.issuingCountryCode);

  const chevron = parseChevronNamesFromMrz(args.rawMrz);
  const hadChevronSurname = isUsablePersonName(chevron.surname);
  const hadChevronGiven = isUsablePersonName(chevron.given);

  if (chevron.surname) {
    lastName = trimMrzPersonNameTokens(chevron.surname, { role: 'surname' }) ?? chevron.surname;
  }
  if (chevron.given) {
    firstName = trimMrzPersonNameTokens(chevron.given, { role: 'given' }) ?? chevron.given;
  }

  ({ firstName, lastName } = correctSwappedMrzNames({
    firstName,
    lastName,
    nationalityCode: args.nationalityCode,
    issuingCountryCode: args.issuingCountryCode,
  }));

  ({ firstName, lastName } = dedupeGivenAndSurname(firstName, lastName));

  const chevronComplete = hadChevronSurname && hadChevronGiven;

  if (!chevronComplete && (!firstName || !lastName) && fullNameFromField) {
    const split = splitFullNameToFirstLast(fullNameFromField);
    firstName = firstName ?? split.firstName;
    lastName = lastName ?? split.lastName;
    ({ firstName, lastName } = dedupeGivenAndSurname(firstName, lastName));
  }

  // Chevron verilen ad(lar)ı tek alanda tutar — son kelimeyi soyada bölme.
  if (!hadChevronGiven && !lastName && firstName) {
    const split = splitFullNameToFirstLast(firstName);
    if (split.lastName) {
      firstName = split.firstName;
      lastName = split.lastName;
    }
    ({ firstName, lastName } = dedupeGivenAndSurname(firstName, lastName));
  }

  if (!hadChevronSurname && !firstName && lastName && !turkish) {
    const split = splitFullNameToFirstLast(lastName);
    if (split.firstName) {
      firstName = split.firstName;
      lastName = split.lastName;
    }
    ({ firstName, lastName } = dedupeGivenAndSurname(firstName, lastName));
  }

  // Körfez / Arap: verilen ad(lar)ı tek alanda tut — yarım ad + middle kaybı olmasın.
  const gcc = isGccNationality(args.nationalityCode) || isGccNationality(args.issuingCountryCode);

  let middleName: string | null = null;
  if (!gcc && hadChevronGiven && firstName) {
    const parts = firstName.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      firstName = parts[0] ?? firstName;
      middleName = parts.slice(1).join(' ');
    }
  }

  const fullName =
    [firstName, middleName, lastName].filter(Boolean).join(' ').trim() ||
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    fullNameFromField ||
    null;

  return { firstName, lastName, fullName, middleName };
}
