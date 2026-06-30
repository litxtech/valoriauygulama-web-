import AsyncStorage from '@react-native-async-storage/async-storage';

const LEGACY_LAST_SEEN_KEY = 'kbs_capture_history_last_seen_at';

function lastSeenStorageKey(staffId: string) {
  return `kbs_capture_history_last_seen_at_v2_${staffId}`;
}

/** Son liste ziyareti — bundan sonra kaydedilenler "Yeni" sayılır (personel bazlı). */
export async function getKbsCaptureHistoryLastSeenAt(staffId: string): Promise<string | null> {
  if (!staffId) return null;
  try {
    const scoped = await AsyncStorage.getItem(lastSeenStorageKey(staffId));
    if (scoped) return scoped;
    // Eski cihaz anahtarı — bir kez taşı
    const legacy = await AsyncStorage.getItem(LEGACY_LAST_SEEN_KEY);
    if (legacy) {
      await AsyncStorage.setItem(lastSeenStorageKey(staffId), legacy);
      await AsyncStorage.removeItem(LEGACY_LAST_SEEN_KEY);
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setKbsCaptureHistoryLastSeenAt(staffId: string, iso: string): Promise<void> {
  if (!staffId) return;
  try {
    await AsyncStorage.setItem(lastSeenStorageKey(staffId), iso);
  } catch {
    /* yerel önbellek isteğe bağlı */
  }
}

let freshlySavedDocIds: Set<string> | null = null;

/** capture-id kayıt sonrası — geçmişte "Yeni" + MRZ hedefi. */
export function markKbsCapturesJustSaved(docIds: string[]): void {
  freshlySavedDocIds = new Set(docIds);
}

export function consumeKbsCapturesJustSaved(): Set<string> {
  const ids = freshlySavedDocIds ?? new Set<string>();
  freshlySavedDocIds = null;
  return ids;
}
