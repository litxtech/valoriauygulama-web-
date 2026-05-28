import { capturedAtTs, type KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';
import { kbsOcrStatusLabel } from '@/lib/kbsCaptureParsedFields';

const RECENT_WINDOW_MS = 15 * 60 * 1000;

/** MRZ okuma / otomatik kuyruk için hedef kayıtlar (en son çekilenler öncelikli). */
export function pickKbsMrzOcrTargets(opts: {
  combined: KbsCapturedDocumentRow[];
  selectMode: boolean;
  selectedIds: Set<string>;
  justSavedIds: Set<string>;
  lastSeenAt: string | null;
}): KbsCapturedDocumentRow[] {
  const selectMode = !!opts.selectMode;
  const selectedIds = opts.selectedIds ?? new Set<string>();
  const justSavedIds = opts.justSavedIds ?? new Set<string>();
  const lastSeenAt = opts.lastSeenAt ?? null;
  const combined = Array.isArray(opts.combined) ? opts.combined : [];
  const withImage = (rows: KbsCapturedDocumentRow[]) => rows.filter((r) => !!r.front_image_url);

  if (selectMode && selectedIds.size > 0) {
    return withImage(combined.filter((r) => selectedIds.has(r.id)));
  }

  if (justSavedIds.size > 0) {
    const fromSave = withImage(combined.filter((r) => justSavedIds.has(r.id)));
    if (fromSave.length > 0) return fromSave;
  }

  if (lastSeenAt) {
    const sinceSeen = withImage(combined.filter((r) => capturedAtTs(r) > lastSeenAt));
    if (sinceSeen.length > 0) return sinceSeen;
  }

  const sorted = [...combined].sort(
    (a, b) => new Date(capturedAtTs(b)).getTime() - new Date(capturedAtTs(a)).getTime()
  );
  if (sorted.length === 0) return [];

  const latest = sorted[0]!;
  const latestTs = new Date(capturedAtTs(latest)).getTime();
  const batchKey = latest.mrz_batch_key;

  if (batchKey) {
    return withImage(combined.filter((r) => r.mrz_batch_key === batchKey));
  }

  return withImage(
    sorted.filter((r) => latestTs - new Date(capturedAtTs(r)).getTime() <= RECENT_WINDOW_MS)
  );
}

export function filterKbsMrzOcrPending(rows: KbsCapturedDocumentRow[]): KbsCapturedDocumentRow[] {
  return rows.filter((r) => {
    if (!r.front_image_url) return false;
    const st = kbsOcrStatusLabel(r.parsed_payload);
    return st === 'pending' || st === 'empty';
  });
}

export function isKbsCaptureRowNew(
  row: KbsCapturedDocumentRow,
  justSavedIds: Set<string>,
  lastSeenAt: string | null
): boolean {
  if (justSavedIds.has(row.id)) return true;
  if (!lastSeenAt) return false;
  return capturedAtTs(row) > lastSeenAt;
}
