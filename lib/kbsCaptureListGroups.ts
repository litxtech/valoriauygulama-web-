import { capturedAtTs, type KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';

const ROOM_TIME_CLUSTER_MS = 2 * 60 * 1000;

export type KbsCaptureListItem =
  | { kind: 'single'; row: KbsCapturedDocumentRow }
  | {
      kind: 'group';
      batchKey: string;
      roomNumber: string | null;
      capturedAt: string;
      rows: KbsCapturedDocumentRow[];
    };

function rowTs(row: KbsCapturedDocumentRow): number {
  return new Date(capturedAtTs(row)).getTime();
}

function clusterByRoomTime(rows: KbsCapturedDocumentRow[]): KbsCapturedDocumentRow[][] {
  const byRoom = new Map<string, KbsCapturedDocumentRow[]>();
  for (const r of rows) {
    const room = r.room_number ?? '__none__';
    const list = byRoom.get(room) ?? [];
    list.push(r);
    byRoom.set(room, list);
  }

  const clusters: KbsCapturedDocumentRow[][] = [];
  for (const list of byRoom.values()) {
    const sorted = [...list].sort((a, b) => rowTs(b) - rowTs(a));
    let current: KbsCapturedDocumentRow[] = [];
    for (const r of sorted) {
      const t = rowTs(r);
      if (current.length === 0) {
        current = [r];
        continue;
      }
      const anchor = rowTs(current[0]!);
      if (Math.abs(anchor - t) <= ROOM_TIME_CLUSTER_MS) {
        current.push(r);
      } else {
        if (current.length >= 2) clusters.push(current);
        current = [r];
      }
    }
    if (current.length >= 2) clusters.push(current);
  }
  return clusters;
}

/** Liste: toplu kayıtlar aynı grupta; tekiller ayrı kart. */
export function buildKbsCaptureListItems(rows: KbsCapturedDocumentRow[]): KbsCaptureListItem[] {
  if (rows.length === 0) return [];

  const byBatch = new Map<string, KbsCapturedDocumentRow[]>();
  const unbatched: KbsCapturedDocumentRow[] = [];

  for (const r of rows) {
    const key = r.mrz_batch_key?.trim();
    if (key) {
      const list = byBatch.get(key) ?? [];
      list.push(r);
      byBatch.set(key, list);
    } else {
      unbatched.push(r);
    }
  }

  const items: KbsCaptureListItem[] = [];
  const usedIds = new Set<string>();

  for (const [batchKey, batchRows] of byBatch) {
    if (batchRows.length < 2) continue;
    const sorted = [...batchRows].sort((a, b) => rowTs(b) - rowTs(a));
    for (const r of sorted) usedIds.add(r.id);
    items.push({
      kind: 'group',
      batchKey,
      roomNumber: sorted[0]?.room_number ?? null,
      capturedAt: capturedAtTs(sorted[0]!),
      rows: sorted,
    });
  }

  const remaining = unbatched.filter((r) => !usedIds.has(r.id));
  const legacyClusters = clusterByRoomTime(remaining);
  for (const cluster of legacyClusters) {
    for (const r of cluster) usedIds.add(r.id);
    const sorted = [...cluster].sort((a, b) => rowTs(b) - rowTs(a));
    items.push({
      kind: 'group',
      batchKey: `legacy-${sorted.map((r) => r.id).join('-')}`,
      roomNumber: sorted[0]?.room_number ?? null,
      capturedAt: capturedAtTs(sorted[0]!),
      rows: sorted,
    });
  }

  for (const r of rows) {
    if (usedIds.has(r.id)) continue;
    const key = r.mrz_batch_key?.trim();
    if (key && (byBatch.get(key)?.length ?? 0) >= 2) continue;
    items.push({ kind: 'single', row: r });
  }

  items.sort((a, b) => {
    const ta = a.kind === 'single' ? rowTs(a.row) : rowTs(a.rows[0]!);
    const tb = b.kind === 'single' ? rowTs(b.row) : rowTs(b.rows[0]!);
    return tb - ta;
  });

  return items;
}
