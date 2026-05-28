import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_SEEN_KEY = 'kbs_capture_history_last_seen_at';

/** Son liste ziyareti — bundan sonra kaydedilenler "Yeni" sayılır. */
export async function getKbsCaptureHistoryLastSeenAt(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

export async function setKbsCaptureHistoryLastSeenAt(iso: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SEEN_KEY, iso);
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
