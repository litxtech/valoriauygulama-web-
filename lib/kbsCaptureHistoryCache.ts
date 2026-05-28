import type { KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';

let cachedRows: KbsCapturedDocumentRow[] | null = null;

export function getKbsCaptureHistoryCache(): KbsCapturedDocumentRow[] | null {
  return cachedRows;
}

export function setKbsCaptureHistoryCache(rows: KbsCapturedDocumentRow[]): void {
  cachedRows = rows;
}

export function clearKbsCaptureHistoryCache(): void {
  cachedRows = null;
}
