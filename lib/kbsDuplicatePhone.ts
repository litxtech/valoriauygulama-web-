import { Alert } from 'react-native';
import type { Href } from 'expo-router';
import { supabase } from '@/lib/supabase';
import {
  displayCapturedName,
  normalizeKbsGuestPhone,
  type KbsCapturedDocumentRow,
} from '@/lib/kbsCaptureHistory';
import { getKbsCaptureHistoryCache } from '@/lib/kbsCaptureHistoryCache';
import { playKbsScanSound } from '@/lib/kbsScanSounds';

export type KbsDuplicatePhoneHit = {
  kind: 'capture' | 'pool';
  /** Çekim kaydı id — karşılaştırma için. */
  documentId: string | null;
  poolId: string | null;
  guestId: string | null;
  guestName: string;
  phone: string;
  roomNumber: string | null;
  hotelName: string | null;
  hotelId: string | null;
  capturedAt: string;
  frontImageUrl: string | null;
};

export function kbsPhoneDigits(phone: string | null | undefined): string {
  return String(phone ?? '').replace(/\D/g, '');
}

/** TR / uluslararası yazım farklarını yumuşatarak aynı numarayı bulur. */
export function kbsPhonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = kbsPhoneDigits(a);
  const db = kbsPhoneDigits(b);
  if (da.length < 7 || db.length < 7) return false;
  if (da === db) return true;

  const canon = (d: string): string => {
    let x = d;
    if (x.startsWith('00')) x = x.slice(2);
    if (x.startsWith('90') && x.length >= 12) x = x.slice(2);
    if (x.startsWith('0') && x.length >= 11) x = x.slice(1);
    return x.length > 10 ? x.slice(-10) : x;
  };

  const ca = canon(da);
  const cb = canon(db);
  return ca.length >= 7 && ca === cb;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatKbsDuplicatePhoneWarning(hit: KbsDuplicatePhoneHit): string {
  const bits = [
    hit.guestName !== '—' ? hit.guestName : null,
    hit.roomNumber ? `Oda ${hit.roomNumber}` : null,
    hit.hotelName ? hit.hotelName : null,
    `İlk kayıt: ${formatWhen(hit.capturedAt)}`,
  ].filter(Boolean);
  return `Bu telefon numarası daha önce sisteme eklendi.\n\n${bits.join(' · ')}`;
}

function hitFromCaptureRow(row: KbsCapturedDocumentRow): KbsDuplicatePhoneHit | null {
  const phone = normalizeKbsGuestPhone(row.guest_phone_submitted);
  if (!phone || kbsPhoneDigits(phone).length < 7) return null;
  return {
    kind: 'capture',
    documentId: row.id,
    poolId: null,
    guestId: row.guest_id,
    guestName: displayCapturedName(row),
    phone,
    roomNumber: row.room_number,
    hotelName: row.hotel_name ?? null,
    hotelId: row.hotel_id ?? null,
    capturedAt: row.captured_at || row.created_at,
    frontImageUrl: row.front_image_url,
  };
}

function preferOlder(a: KbsDuplicatePhoneHit, b: KbsDuplicatePhoneHit): KbsDuplicatePhoneHit {
  return new Date(a.capturedAt).getTime() <= new Date(b.capturedAt).getTime() ? a : b;
}

/**
 * Aynı telefonu taşıyan önceki çekim / rehber kayıtlarını bulur.
 * Önce yerel önbellek, sonra DB + phone_pool.
 */
export async function findKbsDuplicatePhoneHits(opts: {
  phone: string;
  excludeDocumentId?: string | null;
  hotelId?: string | null;
  limit?: number;
}): Promise<KbsDuplicatePhoneHit[]> {
  const needle = normalizeKbsGuestPhone(opts.phone);
  if (!needle || kbsPhoneDigits(needle).length < 7) return [];

  const exclude = (opts.excludeDocumentId ?? '').trim();
  const byKey = new Map<string, KbsDuplicatePhoneHit>();

  const add = (hit: KbsDuplicatePhoneHit | null) => {
    if (!hit) return;
    if (hit.documentId && hit.documentId === exclude) return;
    if (!kbsPhonesMatch(needle, hit.phone)) return;
    const key =
      hit.kind === 'capture'
        ? `cap:${hit.documentId}`
        : `pool:${hit.poolId ?? hit.phone}`;
    const prev = byKey.get(key);
    byKey.set(key, prev ? preferOlder(prev, hit) : hit);
  };

  const cache = getKbsCaptureHistoryCache() ?? [];
  for (const row of cache) add(hitFromCaptureRow(row));

  try {
    let q = supabase
      .schema('ops')
      .from('guest_documents')
      .select(
        `id, guest_id, hotel_id, captured_at, created_at, front_image_url, guest_phone_submitted,
         parsed_payload, document_number`
      )
      .not('guest_phone_submitted', 'is', null)
      .order('captured_at', { ascending: false })
      .limit(opts.limit ?? 400);

    if (opts.hotelId) q = q.eq('hotel_id', opts.hotelId);

    const { data, error } = await q;
    if (!error && data) {
      for (const raw of data as Array<Record<string, unknown>>) {
        const phone = normalizeKbsGuestPhone(
          typeof raw.guest_phone_submitted === 'string' ? raw.guest_phone_submitted : null
        );
        if (!phone || !kbsPhonesMatch(needle, phone)) continue;
        const id = String(raw.id);
        if (id === exclude) continue;

        const parsed = raw.parsed_payload as { firstName?: string; lastName?: string } | null;
        const nameFromParsed = [parsed?.firstName, parsed?.lastName]
          .filter((x) => typeof x === 'string' && x.trim())
          .join(' ')
          .trim();

        add({
          kind: 'capture',
          documentId: id,
          poolId: null,
          guestId: raw.guest_id ? String(raw.guest_id) : null,
          guestName: nameFromParsed || '—',
          phone,
          roomNumber: null,
          hotelName: null,
          hotelId: raw.hotel_id ? String(raw.hotel_id) : null,
          capturedAt: String(raw.captured_at ?? raw.created_at ?? ''),
          frontImageUrl: raw.front_image_url ? String(raw.front_image_url) : null,
        });
      }
    }
  } catch {
    /* önbellek yeterli olabilir */
  }

  try {
    const digits = kbsPhoneDigits(needle);
    const canonTail = digits.length > 10 ? digits.slice(-10) : digits.replace(/^0/, '');

    let pq = supabase
      .schema('ops')
      .from('phone_pool')
      .select(
        'id, hotel_id, phone, phone_digits, display_name, note, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(80);

    if (opts.hotelId) pq = pq.eq('hotel_id', opts.hotelId);

    const { data: pool, error: poolErr } = await pq;
    if (!poolErr && pool) {
      for (const raw of pool as Array<Record<string, unknown>>) {
        const phone = String(raw.phone ?? '');
        const pd = String(raw.phone_digits ?? kbsPhoneDigits(phone));
        if (!kbsPhonesMatch(needle, phone) && !kbsPhonesMatch(needle, pd) && pd.slice(-10) !== canonTail) {
          continue;
        }
        const name = raw.display_name ? String(raw.display_name).trim() : '';
        add({
          kind: 'pool',
          documentId: null,
          poolId: String(raw.id),
          guestId: null,
          guestName: name || 'Rehber kaydı',
          phone: phone || needle,
          roomNumber: null,
          hotelName: null,
          hotelId: raw.hotel_id ? String(raw.hotel_id) : null,
          capturedAt: String(raw.created_at ?? ''),
          frontImageUrl: null,
        });
      }
    }
  } catch {
    /* isteğe bağlı */
  }

  return [...byKey.values()].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
  );
}

/** En eski / birincil eşleşme (karşılaştırma hedefi). */
export function pickPrimaryKbsDuplicatePhoneHit(
  hits: KbsDuplicatePhoneHit[]
): KbsDuplicatePhoneHit | null {
  if (hits.length === 0) return null;
  const withDoc = hits.filter((h) => h.documentId);
  const list = withDoc.length > 0 ? withDoc : hits;
  return list.reduce((best, h) => preferOlder(best, h));
}

export function kbsDuplicatePhoneCompareHref(
  currentDocumentId: string,
  previousDocumentId: string
): Href {
  return `/staff/kbs/capture/compare?currentId=${encodeURIComponent(currentDocumentId)}&previousId=${encodeURIComponent(previousDocumentId)}` as Href;
}

/**
 * Yerel uyarı + isteğe bağlı Karşılaştır.
 * `onCompare` verilmezse yalnızca Tamam gösterilir.
 */
export function showKbsDuplicatePhoneAlert(
  hit: KbsDuplicatePhoneHit,
  opts?: {
    sound?: boolean;
    onCompare?: () => void;
    title?: string;
  }
): void {
  if (opts?.sound !== false) {
    void playKbsScanSound('submit_ok', true);
  }
  const buttons: Array<{
    text: string;
    style?: 'cancel' | 'default' | 'destructive';
    onPress?: () => void;
  }> = [{ text: 'Tamam', style: 'cancel' }];

  if (opts?.onCompare && hit.documentId) {
    buttons.push({ text: 'Karşılaştır', onPress: opts.onCompare });
  }

  Alert.alert(
    opts?.title ?? '✓ Daha önce eklendi',
    formatKbsDuplicatePhoneWarning(hit),
    buttons
  );
}
