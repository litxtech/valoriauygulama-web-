import {
  isUsablePersonName,
  sanitizePersonName,
  splitFullNameToFirstLast,
} from '@/lib/guestScan/personNameUtils';

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

/** MRZ: ad tek kelime, soyad birden fazla kelime → alanlar muhtemelen yer değiştirmiş. */
export function mrzNamesLookSwapped(firstName: string | null, lastName: string | null): boolean {
  const fp = (firstName ?? '').trim().split(/\s+/).filter(Boolean);
  const lp = (lastName ?? '').trim().split(/\s+/).filter(Boolean);
  return fp.length === 1 && lp.length >= 2;
}

export function mrzNamesLookValid(firstName: string | null, lastName: string | null): boolean {
  if (!isUsablePersonName(firstName) || !isUsablePersonName(lastName)) return false;
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
  const nat = (args.nationalityCode ?? '').toUpperCase();
  const iss = (args.issuingCountryCode ?? '').toUpperCase();
  if (isGccNationality(nat) || isGccNationality(iss)) {
    return { firstName, lastName };
  }
  if (mrzNamesLookSwapped(firstName, lastName)) {
    return { firstName: lastName, lastName: firstName };
  }
  return { firstName, lastName };
}

/** Ad alanında yinelenen soyadı ayır (OCR/MRZ gürültüsü). */
function dedupeGivenAndSurname(firstName: string | null, lastName: string | null): {
  firstName: string | null;
  lastName: string | null;
} {
  let fn = firstName;
  let ln = lastName;
  if (!fn || !ln) return { firstName: fn, lastName: ln };
  const fnU = fn.toUpperCase();
  const lnU = ln.toUpperCase();
  if (fnU === lnU) {
    const split = splitFullNameToFirstLast(fn);
    return { firstName: split.firstName, lastName: split.lastName };
  }
  if (fnU.endsWith(` ${lnU}`)) {
    const trimmed = fnU.slice(0, -(lnU.length + 1)).trim();
    if (trimmed.length >= 2) fn = sanitizePersonName(trimmed);
  } else if (lnU.startsWith(`${fnU} `)) {
    const trimmed = lnU.slice(fnU.length + 1).trim();
    if (trimmed.length >= 2) ln = sanitizePersonName(trimmed);
  }
  return { firstName: fn, lastName: ln };
}

/**
 * MRZ kütüphanesinden gelen ad/soyad → KBS ad + soyad.
 * Soyad MRZ’de tek kelime, verilen ad(lar) ayrı alanda kalır.
 */
export function finalizeMrzPersonNames(args: {
  firstNameRaw: string | null;
  lastNameRaw: string | null;
  fullNameRaw?: string | null;
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
  }

  if (!lastName && firstName) {
    const split = splitFullNameToFirstLast(firstName);
    if (split.lastName) {
      firstName = split.firstName;
      lastName = split.lastName;
    }
  }

  if (!firstName && lastName) {
    const split = splitFullNameToFirstLast(lastName);
    if (split.firstName) {
      firstName = split.firstName;
      lastName = split.lastName;
    }
  }

  const fullName =
    [firstName, lastName].filter(Boolean).join(' ').trim() || fullNameFromField || null;

  return { firstName, lastName, fullName, middleName: null };
}
