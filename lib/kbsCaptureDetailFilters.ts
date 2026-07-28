import type { KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';
import { isKbsReturningGuest } from '@/lib/kbsGuestDocumentIdentity';
import { normalizeKbsParsedPayload } from '@/lib/kbsCaptureParsedFields';
import type { KbsGuestNoteSummary, KbsGuestNoteTag } from '@/lib/kbsGuestNotes';
import type { ParsedDocument } from '@/lib/scanner/types';

export type KbsDetailFilterKey =
  | 'all'
  | 'returning'
  | 'has_notes'
  | 'attention'
  | 'good'
  | 'vip'
  | 'passport'
  | 'id_card';

export const KBS_DETAIL_FILTER_OPTIONS: {
  key: KbsDetailFilterKey;
  label: string;
}[] = [
  { key: 'all', label: 'Hepsi' },
  { key: 'returning', label: 'Tekrar gelen' },
  { key: 'has_notes', label: 'Notlu' },
  { key: 'attention', label: 'Dikkat' },
  { key: 'good', label: 'İyi müşteri' },
  { key: 'vip', label: 'VIP' },
  { key: 'passport', label: 'Pasaport' },
  { key: 'id_card', label: 'Kimlik' },
];

function rowParsed(row: KbsCapturedDocumentRow): ParsedDocument | null {
  return normalizeKbsParsedPayload(row.parsed_payload);
}

function docType(row: KbsCapturedDocumentRow): string | null {
  const parsed = rowParsed(row);
  const t = (parsed?.documentType ?? '').toLowerCase();
  return t || null;
}

export function matchesKbsDetailFilter(
  row: KbsCapturedDocumentRow,
  key: KbsDetailFilterKey,
  noteSummary: KbsGuestNoteSummary | null | undefined
): boolean {
  if (key === 'all') return true;

  const parsed = rowParsed(row);
  const notes = noteSummary ?? null;

  switch (key) {
    case 'returning':
      return isKbsReturningGuest(parsed);
    case 'has_notes':
      return (notes?.count ?? 0) > 0;
    case 'attention':
      return notes?.hasAttention === true;
    case 'good':
      return notes?.tags.includes('good') === true;
    case 'vip':
      return notes?.tags.includes('vip') === true;
    case 'passport':
      return docType(row) === 'passport';
    case 'id_card':
      return docType(row) === 'id_card';
    default:
      return true;
  }
}

export function countKbsDetailFilters(
  rows: KbsCapturedDocumentRow[],
  summaries: Map<string, KbsGuestNoteSummary>
): Record<KbsDetailFilterKey, number> {
  const counts: Record<KbsDetailFilterKey, number> = {
    all: rows.length,
    returning: 0,
    has_notes: 0,
    attention: 0,
    good: 0,
    vip: 0,
    passport: 0,
    id_card: 0,
  };
  for (const row of rows) {
    const summary = summaries.get(row.guest_id) ?? null;
    for (const key of Object.keys(counts) as KbsDetailFilterKey[]) {
      if (key === 'all') continue;
      if (matchesKbsDetailFilter(row, key, summary)) counts[key] += 1;
    }
  }
  return counts;
}

/** Arama blob'una not metinlerini eklemek için. */
export function noteSearchBlobFromSummary(summary: KbsGuestNoteSummary | null | undefined): string {
  if (!summary) return '';
  const tagLabels: Record<KbsGuestNoteTag, string> = {
    info: 'bilgi not',
    good: 'iyi musteri',
    problematic: 'sorunlu',
    incident: 'olay',
    vip: 'vip',
  };
  return [
    summary.latestBody,
    ...summary.tags.map((t) => tagLabels[t]),
    summary.hasAttention ? 'dikkat sorun' : '',
  ]
    .filter(Boolean)
    .join(' ');
}
