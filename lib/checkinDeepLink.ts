/**
 * NFC / Deep Link: valoria://guest?token=XXX, valoria://checkin/roomId, valoria://guest/contract
 * NFC etiketine veya personel cihazından gönderilen URL ile misafir cihazında sözleşme onayı açılır.
 */
import * as Linking from 'expo-linking';

const SCHEME = 'valoria';

export interface ParsedCheckinLink {
  type: 'token' | 'room' | 'contract' | 'sign-one';
  token?: string;
  roomId?: string;
  lang?: string;
}

/**
 * Gelen URL'den token veya roomId çıkar
 * Örnek: valoria://guest?token=abc123 -> { type: 'token', token: 'abc123' }
 * Örnek: valoria://checkin/ROOM_UUID -> { type: 'room', roomId: 'ROOM_UUID' }
 */
export function parseCheckinUrl(url: string): ParsedCheckinLink | null {
  try {
    // Web: https URL'leri bazen Linking.parse ile doğru ayrışmıyor; manuel parse
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const u = url.indexOf('?') >= 0 ? url : url + '?';
      const [base, search] = u.split('?');
      const path = base.replace(/^https?:\/\/[^/]+/, '').replace(/^\/+|\/+$/g, '') || '';
      const query: Record<string, string> = {};
      if (search) {
        search.split('&').forEach((part) => {
          const [k, v] = part.split('=');
          if (k && v != null) query[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
        });
      }
      const token = query.token || query.t;
      const lang = query.lang || query.language || query.l;
      const head = path.split('/')[0] ?? '';
      const contractHead =
        head === 'sozlesme' ||
        head === 'sözleşme' ||
        path === 'guest/sign-one' ||
        path.startsWith('guest/sign-one/');
      if (contractHead) {
        return { type: 'sign-one', token: token || undefined, lang: lang || undefined };
      }
      if (path === 'guest/contract') {
        return { type: 'contract', token: token || undefined };
      }
      if (path.startsWith('checkin/')) {
        const roomId = path.replace('checkin/', '').split('/')[0];
        if (roomId) return { type: 'room', roomId };
      }
      if ((path === 'guest' || path === '') && token) {
        return { type: 'token', token };
      }
      if (head === 'breakfast-pass' || path === 'breakfast-pass' || path.startsWith('breakfast-pass/')) {
        return null;
      }
      if (token) return { type: 'token', token };
      return null;
    }

    const parsed = Linking.parse(url);
    const path = ((parsed.path ?? '') as string).replace(/^\/+/, '') || '';
    const query = (parsed.queryParams ?? {}) as Record<string, string>;
    const token = query.token || query.t;
    const lang = query.lang || query.language || query.l;

    // Tek sayfa sözleşme: valoria://guest/sign-one veya valoria://sozlesme
    if (
      path === 'guest/sign-one' ||
      path === 'guest/sign-one/' ||
      path === 'sozlesme' ||
      path === 'sözleşme'
    ) {
      return { type: 'sign-one', token: token || undefined, lang: lang || undefined };
    }

    // valoria://guest/contract veya https://.../guest/contract?token=xxx
    if (path === 'guest/contract' || path === 'guest/contract/') {
      return { type: 'contract', token: token || undefined };
    }
    if (path === 'breakfast-pass' || path.startsWith('breakfast-pass/')) {
      return null;
    }
    if (token && path !== 'guest/contract') {
      return { type: 'token', token };
    }
    // valoria://checkin/roomId veya https://.../checkin/roomId
    if (path.startsWith('checkin/')) {
      const roomId = path.replace('checkin/', '').split('/')[0];
      if (roomId) return { type: 'room', roomId };
    }
    // valoria://guest?token=xxx veya https://.../guest?token=xxx (Universal Link)
    if ((path === 'guest' || path === '') && token) {
      return { type: 'token', token };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * NFC etiketi veya QR için kullanılacak URL (oda token'ı ile)
 */
export function getCheckinUrl(token: string): string {
  return `${SCHEME}://guest?token=${encodeURIComponent(token)}`;
}

/**
 * NFC ile misafir cihazına gönderilecek sözleşme onay linki.
 * Personel resepsiyonda NFC etiketine yazar; misafir telefonu etikete yaklaştırınca uygulama sözleşme ekranında açılır.
 */
export function getContractNfcUrl(token?: string): string {
  if (token) return `${SCHEME}://guest/contract?token=${encodeURIComponent(token)}`;
  return `${SCHEME}://guest/contract`;
}

/**
 * Tek link ile sözleşme onayı sayfası (form + sözleşme + imza bilgisi).
 * Örnek: valoria://guest/sign-one?token=XXX&lang=tr
 */
export function getSignOneUrl(token: string, lang?: string): string {
  const params = new URLSearchParams();
  params.set('token', token);
  if (lang) params.set('lang', lang);
  return `${SCHEME}://guest/sign-one?${params.toString()}`;
}
