import { Alert, Linking } from 'react-native';
import { toInternationalPhoneNumber } from '@/constants/countryPhoneCodes';
import {
  displayCapturedName,
  normalizeKbsGuestPhone,
  type KbsCapturedDocumentRow,
} from '@/lib/kbsCaptureHistory';
import { enrichKbsParsedFromSources, normalizeKbsParsedPayload } from '@/lib/kbsCaptureParsedFields';
import type { ParsedDocument } from '@/lib/scanner/types';
import type { KbsPhonePoolRow } from '@/lib/kbsPhonePool';

export type KbsPhoneContact = {
  id: string;
  guestId: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  phone: string;
  phoneDigits: string;
  documentNumber: string | null;
  roomNumber: string | null;
  hotelName: string | null;
  countryCode: string | null;
  capturedAt: string;
  frontImageUrl: string | null;
  /** Alfabetik bölüm (A–Z / #). */
  sectionKey: string;
  /** çekim kaydı veya manuel havuz. */
  source: 'capture' | 'pool';
  note?: string | null;
  /** İsimsiz havuz kaydı. */
  nameless?: boolean;
};

export type KbsPhoneContactSection = {
  title: string;
  data: KbsPhoneContact[];
};

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

function asParsed(row: KbsCapturedDocumentRow): ParsedDocument | null {
  const p = normalizeKbsParsedPayload(row.parsed_payload);
  if (!p) return null;
  return enrichKbsParsedFromSources(p) as ParsedDocument;
}

function sectionLetter(name: string): string {
  const ch = name.trim().charAt(0).toLocaleUpperCase('tr-TR');
  if (!ch) return '#';
  if (/[0-9]/.test(ch)) return '#';
  if (ch === 'İ' || ch === 'I') return ch;
  if (/[A-ZÇĞÖŞÜ]/.test(ch)) return ch;
  return /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(ch) ? ch : '#';
}

/** Telefonu olan çekimleri rehber satırına çevirir (aynı misafir + numara → en yeni). */
export function buildKbsPhoneContacts(rows: KbsCapturedDocumentRow[]): KbsPhoneContact[] {
  const byKey = new Map<string, KbsPhoneContact>();

  for (const row of rows) {
    const phone = normalizeKbsGuestPhone(row.guest_phone_submitted);
    if (!phone) continue;
    const phoneDigits = digitsOnly(phone);
    if (phoneDigits.length < 7) continue;

    const parsed = asParsed(row);
    const fullName = displayCapturedName(row);
    const firstName = parsed?.firstName?.trim() || null;
    const lastName = parsed?.lastName?.trim() || null;
    const documentNumber = parsed?.documentNumber?.trim() || null;
    const countryCode = parsed?.issuingCountryCode ?? parsed?.nationalityCode ?? null;
    const capturedAt = row.captured_at || row.created_at;

    const dedupeKey = `${row.guest_id}|${phoneDigits}`;
    const existing = byKey.get(dedupeKey);
    if (existing && new Date(existing.capturedAt).getTime() >= new Date(capturedAt).getTime()) {
      continue;
    }

    byKey.set(dedupeKey, {
      id: row.id,
      guestId: row.guest_id,
      fullName,
      firstName,
      lastName,
      phone,
      phoneDigits,
      documentNumber,
      roomNumber: row.room_number,
      hotelName: row.hotel_name,
      countryCode,
      capturedAt,
      frontImageUrl: row.front_image_url,
      sectionKey: sectionLetter(fullName),
      source: 'capture',
    });
  }

  return [...byKey.values()].sort((a, b) =>
    a.fullName.localeCompare(b.fullName, 'tr-TR', { sensitivity: 'base' })
  );
}

/** Manuel telefon havuzunu rehbere ekler. Aynı numara çekimde varsa çekim kaydı öncelikli. */
export function mergeKbsPhonePoolIntoContacts(
  contacts: KbsPhoneContact[],
  pool: KbsPhonePoolRow[]
): KbsPhoneContact[] {
  const byDigits = new Set(contacts.map((c) => c.phoneDigits));
  const merged = [...contacts];

  for (const row of pool) {
    const phoneDigits = row.phone_digits || digitsOnly(row.phone);
    if (phoneDigits.length < 7) continue;
    if (byDigits.has(phoneDigits)) continue;

    const nameless = !row.display_name?.trim();
    const fullName = nameless ? 'İsimsiz numara' : row.display_name!.trim();
    merged.push({
      id: `pool:${row.id}`,
      guestId: '',
      fullName,
      firstName: null,
      lastName: null,
      phone: row.phone,
      phoneDigits,
      documentNumber: null,
      roomNumber: null,
      hotelName: null,
      countryCode: null,
      capturedAt: row.created_at,
      frontImageUrl: null,
      sectionKey: nameless ? '#' : sectionLetter(fullName),
      source: 'pool',
      note: row.note,
      nameless,
    });
    byDigits.add(phoneDigits);
  }

  return merged.sort((a, b) => {
    // İsimsizler sonda / # bölümünde
    if (a.nameless && !b.nameless) return 1;
    if (!a.nameless && b.nameless) return -1;
    return a.fullName.localeCompare(b.fullName, 'tr-TR', { sensitivity: 'base' });
  });
}

export function filterKbsPhoneContacts(
  contacts: KbsPhoneContact[],
  query: string
): KbsPhoneContact[] {
  const q = query.trim().toLocaleLowerCase('tr-TR');
  if (!q) return contacts;
  const qDigits = digitsOnly(q);

  return contacts.filter((c) => {
    if (qDigits.length >= 3 && c.phoneDigits.includes(qDigits)) return true;
    const hay = [
      c.fullName,
      c.firstName,
      c.lastName,
      c.documentNumber,
      c.phone,
      c.roomNumber,
      c.hotelName,
      c.note,
      c.nameless ? 'isimsiz' : null,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('tr-TR');
    return hay.includes(q);
  });
}

export function groupKbsPhoneContactsByLetter(contacts: KbsPhoneContact[]): KbsPhoneContactSection[] {
  const map = new Map<string, KbsPhoneContact[]>();
  for (const c of contacts) {
    const key = c.sectionKey;
    const list = map.get(key);
    if (list) list.push(c);
    else map.set(key, [c]);
  }
  const keys = [...map.keys()].sort((a, b) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b, 'tr-TR');
  });
  return keys.map((title) => ({
    title,
    data: map.get(title)!,
  }));
}

export async function callKbsGuestPhone(phone: string): Promise<void> {
  const cleaned = phone.replace(/\s/g, '');
  if (!cleaned) return;
  try {
    await Linking.openURL(`tel:${cleaned}`);
  } catch {
    Alert.alert('Arama', 'Arama başlatılamadı.');
  }
}

export async function openKbsGuestWhatsApp(
  phone: string,
  countryCode?: string | null
): Promise<void> {
  const wa = toInternationalPhoneNumber(phone, countryCode ?? null);
  if (!wa) {
    Alert.alert('WhatsApp', 'Geçerli telefon numarası yok.');
    return;
  }
  const appUrl = `whatsapp://send?phone=${wa}`;
  const webUrl = `https://wa.me/${wa}`;
  try {
    const supported = await Linking.canOpenURL(appUrl);
    await Linking.openURL(supported ? appUrl : webUrl);
  } catch {
    try {
      await Linking.openURL(webUrl);
    } catch {
      Alert.alert('WhatsApp', 'WhatsApp açılamadı.');
    }
  }
}

/** Arama blob’una telefon eklemek için. */
export function kbsGuestPhoneSearchParts(phone: string | null | undefined): string[] {
  const n = normalizeKbsGuestPhone(phone);
  if (!n) return [];
  const d = digitsOnly(n);
  return [n, d, d.length >= 10 ? d.slice(-10) : ''].filter(Boolean);
}
