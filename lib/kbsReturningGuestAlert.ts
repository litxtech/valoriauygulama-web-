import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import {
  formatKbsReturningGuestWarning,
  getKbsReturningGuestMeta,
  type KbsReturningGuestMeta,
} from '@/lib/kbsGuestDocumentIdentity';
import { playKbsScanSound } from '@/lib/kbsScanSounds';
import { notifyKbsReturningGuest } from '@/lib/kbsCaptureNotify';
import { useAuthStore } from '@/stores/authStore';
import { buildKbsGuestRecommendations } from '@/lib/kbsGuestRecommendations';
import { fetchKbsGuestNotes, KBS_GUEST_NOTE_TAG_META } from '@/lib/kbsGuestNotes';

const STORAGE_KEY = 'kbs_returning_announced_v1';
/** Aynı kişi için tekrar bildirim: 48 saat. */
const DEDUPE_TTL_MS = 48 * 60 * 60 * 1000;

/** Oturum içi — anında spam kes. */
const announcedKeys = new Set<string>();

type StoredMap = Record<string, number>;

function normalizeDedupePart(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/\s+/g, '').toUpperCase();
}

/** Bildirim tekilliği: belge no > guestId > documentId. */
export function kbsReturningAnnounceKey(opts: {
  documentId?: string | null;
  guestId?: string | null;
  documentNumber?: string | null;
  meta?: KbsReturningGuestMeta | null;
}): string | null {
  const docNo =
    normalizeDedupePart(opts.documentNumber) ||
    normalizeDedupePart(opts.meta?.documentNumber);
  if (docNo) return `doc:${docNo}`;
  const guest = (opts.guestId ?? opts.meta?.previousGuestId ?? '').trim();
  if (guest) return `guest:${guest}`;
  const id = (opts.documentId ?? '').trim();
  return id ? `id:${id}` : null;
}

async function loadAnnouncedMap(): Promise<StoredMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredMap;
    if (!parsed || typeof parsed !== 'object') return {};
    const now = Date.now();
    const fresh: StoredMap = {};
    for (const [k, ts] of Object.entries(parsed)) {
      if (typeof ts === 'number' && now - ts < DEDUPE_TTL_MS) fresh[k] = ts;
    }
    return fresh;
  } catch {
    return {};
  }
}

async function persistAnnouncedKey(key: string): Promise<void> {
  try {
    const map = await loadAnnouncedMap();
    map[key] = Date.now();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* isteğe bağlı */
  }
}

/** true = daha önce duyuruldu, atla. */
async function claimReturningAnnounce(key: string): Promise<boolean> {
  if (announcedKeys.has(key)) return false;
  announcedKeys.add(key);
  const map = await loadAnnouncedMap();
  if (map[key] && Date.now() - map[key]! < DEDUPE_TTL_MS) {
    return false;
  }
  await persistAnnouncedKey(key);
  return true;
}

export function playKbsReturningGuestSound(): void {
  void playKbsScanSound('submit_ok', true);
}

/** Yerel ses + Alert — yalnızca bilinçli çağrıda (çekim anı). */
export function showKbsReturningGuestLocalAlert(
  payload: Record<string, unknown> | null | undefined,
  opts?: { sound?: boolean; extraDetail?: string | null }
): void {
  if (opts?.sound !== false) playKbsReturningGuestSound();
  const msg =
    formatKbsReturningGuestWarning(payload) ??
    'Bu pasaport / kimlik daha önce sisteme eklendi — daha önce geldi.';
  const body = opts?.extraDetail ? `${msg}\n\n${opts.extraDetail}` : msg;
  Alert.alert('✓ Daha önce geldi', body);
}

/**
 * Tekrar gelen + varsa müşteri notlarından öneri satırı.
 */
export async function buildKbsReturningRecommendationDetail(opts: {
  guestId?: string | null;
  hotelId?: string | null;
  documentNumber?: string | null;
}): Promise<string | null> {
  if (!opts.guestId && !opts.documentNumber) return null;
  try {
    const notes = await fetchKbsGuestNotes({
      guestId: opts.guestId ?? '00000000-0000-0000-0000-000000000000',
      hotelId: opts.hotelId,
      documentNumber: opts.documentNumber,
      limit: 20,
    });
    if (notes.length === 0) return null;
    const recs = buildKbsGuestRecommendations({ notes, parsed: null });
    const attention = recs.filter((r) => r.tone === 'danger' || r.tone === 'warn');
    if (attention.length > 0) {
      return attention
        .slice(0, 2)
        .map((r) => `⚠ ${r.title}: ${r.detail}`)
        .join('\n');
    }
    const latest = notes[0]!;
    const tag = KBS_GUEST_NOTE_TAG_META[latest.tag].label;
    return `Not (${tag}): ${latest.body.slice(0, 140)}${latest.body.length > 140 ? '…' : ''}`;
  } catch {
    return null;
  }
}

/**
 * Push + yerel bildirim. Aynı kişi (belge no / guest) için 48 saat içinde bir kez.
 * Liste/detay açılışında çağırma — yalnızca yeni çekim / ilk eşleşmede.
 */
export async function announceKbsReturningGuest(params: {
  organizationId: string;
  createdByStaffId: string;
  documentId?: string | null;
  guestName?: string | null;
  roomNumber?: string | number | null;
  meta?: KbsReturningGuestMeta | null;
  playSound?: boolean;
  sendPush?: boolean;
  showLocalAlert?: boolean;
  guestId?: string | null;
  hotelId?: string | null;
  documentNumber?: string | null;
}): Promise<void> {
  const key = kbsReturningAnnounceKey({
    documentId: params.documentId,
    guestId: params.guestId,
    documentNumber: params.documentNumber,
    meta: params.meta,
  });
  if (!key) return;
  const claimed = await claimReturningAnnounce(key);
  if (!claimed) return;

  if (params.playSound !== false) playKbsReturningGuestSound();

  if (params.showLocalAlert) {
    const extra = await buildKbsReturningRecommendationDetail({
      guestId: params.guestId ?? params.meta?.previousGuestId,
      hotelId: params.hotelId,
      documentNumber: params.documentNumber ?? params.meta?.documentNumber,
    });
    showKbsReturningGuestLocalAlert(
      params.meta ? ({ returningGuest: params.meta } as Record<string, unknown>) : null,
      { sound: false, extraDetail: extra }
    );
  }

  if (params.sendPush === false) return;
  if (!params.organizationId || !params.createdByStaffId) return;

  const when = params.meta?.previousCapturedAt
    ? new Date(params.meta.previousCapturedAt).toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  await notifyKbsReturningGuest({
    organizationId: params.organizationId,
    createdByStaffId: params.createdByStaffId,
    guestName: params.guestName ?? params.meta?.previousGuestName ?? null,
    roomNumber: params.roomNumber ?? null,
    previousCapturedAtLabel: when,
    documentId: (params.documentId ?? '').trim() || null,
  }).catch(() => {});
}

/**
 * OCR sonrası — yalnızca ilk kez “dönen” işaretlendiğinde.
 * Zaten işaretli kayıtlarda / liste yenilemede çağırma.
 */
export function announceKbsReturningGuestFromSession(params: {
  documentId: string;
  guestName?: string | null;
  roomNumber?: string | number | null;
  meta?: KbsReturningGuestMeta | null;
  payload?: Record<string, unknown> | null;
  /** false ise hiç duyurma (çağıran zaten bastı). */
  enabled?: boolean;
}): void {
  if (params.enabled === false) return;
  const staff = useAuthStore.getState().staff;
  if (!staff?.organization_id || !staff.id) return;
  const meta = params.meta ?? getKbsReturningGuestMeta(params.payload ?? null);
  void announceKbsReturningGuest({
    organizationId: staff.organization_id,
    createdByStaffId: staff.id,
    documentId: params.documentId,
    guestName: params.guestName ?? meta?.previousGuestName ?? null,
    roomNumber: params.roomNumber ?? null,
    meta,
    documentNumber: meta?.documentNumber ?? null,
    guestId: meta?.previousGuestId ?? null,
    playSound: true,
    sendPush: true,
    showLocalAlert: false,
  });
}
