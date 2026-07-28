import { capturedAtTs, type KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';

const ROOM_TIME_CLUSTER_MS = 4 * 60 * 60 * 1000;
const MAX_ROOMMATES = 24;

function rowTs(row: KbsCapturedDocumentRow): number {
  return new Date(capturedAtTs(row)).getTime();
}

function sortByCaptureDesc(rows: KbsCapturedDocumentRow[]): KbsCapturedDocumentRow[] {
  return [...rows].sort((a, b) => rowTs(b) - rowTs(a));
}

/**
 * Aynı odadaki veya aynı partideki pasaportlar — kaydırarak gezinme için.
 * Öncelik: mrz_batch_key → aynı oda (zaman kümesi) → tek kayıt.
 */
export function findKbsCaptureRoommates(
  current: KbsCapturedDocumentRow,
  pool: KbsCapturedDocumentRow[]
): KbsCapturedDocumentRow[] {
  if (!pool.length) return [current];

  const batchKey = current.mrz_batch_key?.trim();
  if (batchKey) {
    const batch = pool.filter((r) => r.mrz_batch_key?.trim() === batchKey);
    if (batch.length >= 2) {
      return sortByCaptureDesc(batch).slice(0, MAX_ROOMMATES);
    }
  }

  const room = current.room_number?.trim();
  if (room) {
    const sameRoom = pool.filter((r) => r.room_number?.trim() === room);
    if (sameRoom.length >= 2) {
      const anchor = rowTs(current);
      const clustered = sameRoom.filter((r) => Math.abs(rowTs(r) - anchor) <= ROOM_TIME_CLUSTER_MS);
      const group = clustered.length >= 2 ? clustered : sameRoom;
      return sortByCaptureDesc(group).slice(0, MAX_ROOMMATES);
    }
  }

  return [current];
}

export function indexOfKbsCaptureRoommate(
  currentId: string,
  roommates: KbsCapturedDocumentRow[]
): number {
  const idx = roommates.findIndex((r) => r.id === currentId);
  return idx >= 0 ? idx : 0;
}
