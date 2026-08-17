import { invokeEdgeWithAuth } from '@/lib/invokeEdgeWithAuth';
import { getEdgeFunctionErrorMessage } from '@/lib/functionsError';

export type PttTokenResponse = {
  token: string;
  url: string;
  room: string;
  roomId: string;
  channel?: string;
  identity: string;
  displayName: string;
};

type CacheEntry = {
  roomId: string;
  value: PttTokenResponse;
  /** ms epoch — bu zamandan sonra yenile */
  freshUntil: number;
};

let cache: CacheEntry | null = null;
let inflightKey: string | null = null;
let inflight: Promise<PttTokenResponse> | null = null;

/** Edge JWT ~2 saat; istemci 50 dk taze tutar. */
const CACHE_TTL_MS = 50 * 60 * 1000;

function normalize(
  row: Partial<PttTokenResponse> & { error?: string; detail?: string; room_id?: string },
  fallbackRoomId: string
): PttTokenResponse {
  if (!row.token || !row.url || !row.room) {
    const msg =
      (typeof row.error === 'string' && row.error) ||
      (typeof row.detail === 'string' && row.detail) ||
      'Bas-konuş sunucu yanıtı geçersiz.';
    throw new Error(msg);
  }
  const roomId = row.roomId || row.room_id || fallbackRoomId;
  return {
    token: row.token,
    url: row.url,
    room: row.room,
    roomId,
    channel: row.channel,
    identity: row.identity || '',
    displayName: row.displayName || '',
  };
}

async function fetchFresh(roomId: string): Promise<PttTokenResponse> {
  const { data, error } = await invokeEdgeWithAuth('livekit-ptt-token', { roomId });
  if (error) {
    const detail = await getEdgeFunctionErrorMessage(error);
    const fromBody =
      data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
        ? String((data as { error: string }).error)
        : null;
    throw new Error(fromBody || detail || 'Bas-konuş token alınamadı.');
  }
  return normalize(
    (data as Partial<PttTokenResponse> & { error?: string; detail?: string; room_id?: string }) || {},
    roomId
  );
}

export function clearPttTokenCache(): void {
  cache = null;
}

export async function fetchPttToken(roomId: string): Promise<PttTokenResponse> {
  if (!roomId) throw new Error('PTT oda kimliği gerekli.');
  const now = Date.now();
  if (cache && cache.roomId === roomId && cache.freshUntil > now) return cache.value;
  if (inflight && inflightKey === roomId) return inflight;

  inflightKey = roomId;
  inflight = (async () => {
    try {
      const value = await fetchFresh(roomId);
      cache = { roomId, value, freshUntil: Date.now() + CACHE_TTL_MS };
      return value;
    } finally {
      inflight = null;
      inflightKey = null;
    }
  })();

  return inflight;
}

/** Arka plan: token’ı ısıt (bağlantı öncesi). */
export function prefetchPttToken(roomId: string): void {
  if (!roomId) return;
  void fetchPttToken(roomId).catch(() => {
    /* ignore */
  });
}
