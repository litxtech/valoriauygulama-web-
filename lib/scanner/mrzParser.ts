import { parse } from 'mrz';
import type { ParsedDocument } from './types';
import { mrzSixDigitsToIso } from './mrzDates';
import { sanitizePersonName } from '@/lib/guestScan/personNameUtils';

function cleanMrz(raw: string): string {
  return raw
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

function mapMrzSex(v: unknown): 'M' | 'F' | 'X' | null {
  if (v == null) return null;
  const s = String(v).toLowerCase();
  if (s === 'm' || s === 'male') return 'M';
  if (s === 'f' || s === 'female') return 'F';
  if (s === 'x' || s === '<' || s === 'nonspecified') return 'X';
  return null;
}

export function parseMrzToNormalized(rawMrz: string): ParsedDocument {
  const raw = cleanMrz(rawMrz);
  const warnings: string[] = [];

  try {
    const res: any = parse(raw);

    const docTypeRaw = String(res?.format ?? '').toLowerCase();
    // ICAO: TD1 = ID-1 (kimlik), TD2 = genelde ID/visa, TD3 = pasaport (MRP 2 satır)
    let documentType: ParsedDocument['documentType'] = 'other';
    if (docTypeRaw.includes('td3')) documentType = 'passport';
    else if (docTypeRaw.includes('td1') || docTypeRaw.includes('td2')) documentType = 'id_card';

    let firstNameRaw = res?.fields?.firstName ?? res?.fields?.givenNames ?? null;
    let lastNameRaw = res?.fields?.lastName ?? res?.fields?.surname ?? null;
    let middleName: string | null = null;
    /** TD3: ikinci/üçüncü ad MRZ’de tek “given” alanında boşlukla gelebilir → KBS için ayır. */
    if (firstNameRaw && typeof firstNameRaw === 'string') {
      const parts = firstNameRaw.trim().split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        firstNameRaw = parts[0] ?? null;
        middleName = parts.slice(1).join(' ') || null;
      }
    }
    let firstName = sanitizePersonName(firstNameRaw ? String(firstNameRaw) : null);
    let lastName = sanitizePersonName(lastNameRaw ? String(lastNameRaw) : null);
    const fullNameRaw =
      res?.fields?.name
        ? String(res.fields.name)
        : [firstName, lastName].filter(Boolean).join(' ').trim() || null;
    const fullName = sanitizePersonName(fullNameRaw) ?? fullNameRaw;
    if (!firstName || !lastName) {
      const fromName = fullName?.split(/\s+/).filter(Boolean) ?? [];
      if (fromName.length >= 2) {
        lastName = lastName ?? sanitizePersonName(fromName[fromName.length - 1]);
        firstName = firstName ?? sanitizePersonName(fromName.slice(0, -1).join(' '));
      }
    }

    const checksumsValid =
      typeof res?.valid === 'boolean' ? res.valid : typeof res?.validCheckDigits === 'boolean' ? res.validCheckDigits : null;
    if (checksumsValid === false) warnings.push('MRZ checksum validation failed');

    const nat = String(res?.fields?.nationality ?? '').toUpperCase();
    const gcc = new Set(['OMN', 'SAU', 'QAT', 'KWT', 'ARE', 'BHR', 'YEM', 'IRQ', 'IRN', 'JOR', 'LBN', 'SYR', 'PSE']);
    if (nat && gcc.has(nat)) {
      warnings.push(
        'Körfez / Arap pasaportu: MRZ ad sırası farklı olabilir; KBS’e göndermeden ad-soyadı ekranda kontrol edin.'
      );
    }

    // mrz@5: issuing country = `issuingState` (ICAO 3-letter), NOT `issuingCountry`
    const issuingRaw =
      res?.fields?.issuingState ?? res?.fields?.issuingCountry ?? res?.fields?.issuer ?? null;

    const birthRaw = res?.fields?.birthDate ? String(res.fields.birthDate) : null;
    const expiryRaw = res?.fields?.expirationDate ? String(res.fields.expirationDate) : null;

    const birthDate = birthRaw && /^\d{6}$/.test(birthRaw) ? mrzSixDigitsToIso(birthRaw, 'birth') : birthRaw;
    const expiryDate = expiryRaw && /^\d{6}$/.test(expiryRaw) ? mrzSixDigitsToIso(expiryRaw, 'expiry') : expiryRaw;

    return {
      documentType,
      fullName,
      firstName,
      lastName,
      middleName,
      documentNumber: res?.fields?.documentNumber ? String(res.fields.documentNumber) : null,
      nationalityCode: res?.fields?.nationality ? String(res.fields.nationality) : null,
      issuingCountryCode: issuingRaw ? String(issuingRaw).toUpperCase() : null,
      birthDate,
      expiryDate,
      gender: mapMrzSex(res?.fields?.sex),
      rawMrz: raw,
      confidence: null,
      checksumsValid,
      warnings,
    };
  } catch {
    return {
      documentType: 'other',
      fullName: null,
      firstName: null,
      lastName: null,
      middleName: null,
      documentNumber: null,
      nationalityCode: null,
      issuingCountryCode: null,
      birthDate: null,
      expiryDate: null,
      gender: null,
      rawMrz: raw,
      confidence: null,
      checksumsValid: null,
      warnings: ['MRZ parse failed'],
    };
  }
}
