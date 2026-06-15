import type { MapUserMarker } from '@/lib/map/types';
import type { MapUserLocationChange } from '@/lib/map/subscribeMapUserLocations';

function markerId(userType: string, userId: string): string {
  return `${userType}-${userId}`;
}

/** Realtime konum satırını mevcut marker listesine nokta atışı uygular. null = tam yenileme gerekir. */
export function patchMapUserMarkerFromRealtime(
  prev: MapUserMarker[],
  change: MapUserLocationChange,
): MapUserMarker[] | null {
  const { eventType, row } = change;
  if (!row) return null;

  const id = markerId(row.user_type, row.user_id);
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  if (eventType === 'DELETE') {
    return prev.filter((m) => m.id !== id);
  }

  const idx = prev.findIndex((m) => m.id === id);
  if (idx < 0) return null;

  const cur = prev[idx];
  if (cur.lat === lat && cur.lng === lng && cur.updatedAt === row.updated_at) {
    return prev;
  }

  const next = [...prev];
  next[idx] = {
    ...cur,
    lat,
    lng,
    isLiveGps: true,
    updatedAt: row.updated_at,
    displayName: row.display_name ?? cur.displayName,
    avatarUrl: row.avatar_url ?? cur.avatarUrl,
  };
  return next;
}
