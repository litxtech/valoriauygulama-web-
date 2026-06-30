import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';

const STORAGE_KEY = 'valoria_kbs_capture_history_v1';
const MAX_PERSISTED = 300;

let cachedRows: KbsCapturedDocumentRow[] | null = null;

export function getKbsCaptureHistoryCache(): KbsCapturedDocumentRow[] | null {
  return cachedRows;
}

export function setKbsCaptureHistoryCache(rows: KbsCapturedDocumentRow[]): void {
  cachedRows = rows;
  // Diske yaz (fire-and-forget) — sonraki açılışta anında gösterim için.
  void AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(rows.slice(0, MAX_PERSISTED))
  ).catch(() => {
    /* ignore */
  });
}

/** Soğuk başlangıçta diskten okunur; bellek önbelleği de doldurulur. */
export async function loadKbsCaptureHistoryCacheFromDisk(): Promise<
  KbsCapturedDocumentRow[] | null
> {
  if (cachedRows) return cachedRows;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as KbsCapturedDocumentRow[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      cachedRows = parsed;
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function clearKbsCaptureHistoryCache(): void {
  cachedRows = null;
  void AsyncStorage.removeItem(STORAGE_KEY).catch(() => {
    /* ignore */
  });
}
