import { displayCapturedName, type KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';

export type KbsCaptureGalleryItem = {
  id: string;
  uri: string;
  roomNumber?: string | null;
  label?: string;
};

export function buildKbsCaptureGalleryItems(
  rows: KbsCapturedDocumentRow[],
  canSeeImages: boolean
): KbsCaptureGalleryItem[] {
  if (!canSeeImages) return [];
  return rows
    .filter((r) => !!r.front_image_url)
    .map((r) => ({
      id: r.id,
      uri: r.front_image_url!,
      roomNumber: r.room_number,
      label: displayCapturedName(r),
    }));
}
