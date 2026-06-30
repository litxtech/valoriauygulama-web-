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
]);

/** TD3 satır 1: P<SAU… — belge tipi + ülke kodu önekini soyad alanından ayır. */
function stripIcaoMrzNameLinePrefix(alpha: string): string {
  const m = alpha.match(/^[IPAVC]<?[A-Z]{3}(.+)$/i);
  if (m?.[1]?.includes('<<')) return m[1];
  return alpha;
}

/** MRZ / OCR ad-soyad — baştaki/sondaki gürültü kelimeleri ve fazla tokenları kes. */
export function trimMrzPersonNameTokens(
  raw: string | null | undefined,
  opts?: { maxWords?: number; role?: 'surname' | 'given' }
): string | null {
  const maxWords = opts?.maxWords ?? (opts?.role === 'surname' ? 4 : 6);
  let s = sanitizePersonName(raw);
  if (!s) return null;
  let words = s.split(/\s+/).filter(Boolean);

  while (words.length > 0) {
    const w = words[0]!;
    if (w.length === 1 || MRZ_NAME_NOISE_WORDS.has(w)) {
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
    if (w.length === 1) break;
    if (/^\d{4,}$/.test(w)) break;
    kept.push(w);
    if (kept.length >= maxWords) break;
  }

  const out = kept.join(' ').trim();
  return isUsablePersonName(out) ? out : null;
}

function trimMrzGivenRaw(givenRaw: string): string {
  const cut = givenRaw.split(/\s+(?=\d{6,})/)[0]?.trim() ?? givenRaw;
  return cut.replace(/\s+\d{6,}.*$/, '').trim();
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

/** MRZ: ad tek kelime, soyad birden fazla kelime → alanlar muhtemelen yer değiştirmiş. */
export function mrzNamesLookSwapped(firstName: string | null, lastName: string | null): boolean {
  const fp = (firstName ?? '').trim().split(/\s+/).filter(Boolean);
  const lp = (lastName ?? '').trim().split(/\s+/).filter(Boolean);
  return fp.length === 1 && lp.length >= 2;
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
  let firstName = sanitizePersonName(args.firstName);
  let lastName = sanitizePersonName(args.lastName);
  if (mrzNamesLookSwapped(firstName, lastName)) {
    return { firstName: lastName, lastName: firstName };
  }
  const nat = (args.nationalityCode ?? '').toUpperCase();
  const iss = (args.issuingCountryCode ?? '').toUpperCase();
  if (isGccNationality(nat) || isGccNationality(iss) || isTurkishMrzDocument(nat, iss)) {
    return { firstName, lastName };
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
  } else if (sharedPrefix === 1 && fnWords.length > 1 && lnWords.length >= 1) {
    fn = sanitizePersonName(fnWords.slice(1).join(' '));
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

  if ((!firstName || !lastName) && fullNameFromField) {
    const split = splitFullNameToFirstLast(fullNameFromField);
    firstName = firstName ?? split.firstName;
    lastName = lastName ?? split.lastName;
    ({ firstName, lastName } = dedupeGivenAndSurname(firstName, lastName));
  }

  if (!lastName && firstName) {
    const split = splitFullNameToFirstLast(firstName);
    if (split.lastName) {
      firstName = split.firstName;
      lastName = split.lastName;
    }
    ({ firstName, lastName } = dedupeGivenAndSurname(firstName, lastName));
  }

  if (!firstName && lastName && !turkish) {
    const split = splitFullNameToFirstLast(lastName);
    if (split.firstName) {
      firstName = split.firstName;
      lastName = split.lastName;
    }
    ({ firstName, lastName } = dedupeGivenAndSurname(firstName, lastName));
  }

  const fullName =
    [firstName, lastName].filter(Boolean).join(' ').trim() || fullNameFromField || null;

  return { firstName, lastName, fullName, middleName: null };
}
