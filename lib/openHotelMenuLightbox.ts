import type { Dispatch, SetStateAction } from 'react';
import {
  resolveLightboxUrls,
  resolveLightboxUrlsSync,
  type HotelKitchenMenuItemWithImages,
} from '@/lib/hotelKitchenMenu';
import { prefetchImageUrls } from '@/lib/prefetchImageUrls';

type LightboxState = { urls: string[]; index: number } | null;

/** Lightbox: önce kapak (anında), çoklu fotoğrafta arka planda tam liste + disk önbelleği. */
export function openHotelMenuLightbox(
  item: HotelKitchenMenuItemWithImages,
  setLightbox: Dispatch<SetStateAction<LightboxState>>,
  index = 0
): void {
  const immediate = resolveLightboxUrlsSync(item);
  if (!immediate.length) return;

  const safeIndex = Math.min(Math.max(0, index), immediate.length - 1);
  setLightbox({ urls: immediate, index: safeIndex });
  void prefetchImageUrls(immediate, 8);

  const total = item.image_count ?? immediate.length;
  if (total <= immediate.length) return;

  void resolveLightboxUrls(item).then((urls) => {
    if (!urls.length) return;
    void prefetchImageUrls(urls, 8);
    setLightbox((prev) => {
      if (!prev) return { urls, index: safeIndex };
      return { urls, index: Math.min(prev.index, urls.length - 1) };
    });
  });
}
