import type { FacilityJournalMediaRow } from '@/lib/facilityJournal';

/** Kart önizlemesi: görsel URL veya video posteri */
export function facilityJournalPreviewUri(m: FacilityJournalMediaRow | undefined): string | null {
  if (!m?.public_url) return null;
  if (m.media_type === 'image') return m.public_url;
  const thumb = (m.thumbnail_url ?? '').trim();
  return thumb.length > 4 ? thumb : null;
}

export function facilityJournalListMediaSummary(media: FacilityJournalMediaRow[] | undefined) {
  const list = media ?? [];
  const imageCount = list.filter((m) => m.media_type === 'image').length;
  const videoCount = list.filter((m) => m.media_type === 'video').length;
  return {
    total: list.length,
    imageCount,
    videoCount,
    hasMedia: list.length > 0,
  };
}
