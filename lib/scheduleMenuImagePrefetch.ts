import { InteractionManager } from 'react-native';
import { coverImageUrl, type HotelKitchenMenuItemWithImages } from '@/lib/hotelKitchenMenu';
import { prefetchImageUrls } from '@/lib/prefetchImageUrls';

let prefetchTask: { cancel?: () => void } | null = null;

/** Liste çizildikten sonra kapak görsellerini ısıtır — ilk açılışı bloklamaz */
export function scheduleMenuImagePrefetch(
  rows: HotelKitchenMenuItemWithImages[],
  max = 28
): void {
  prefetchTask?.cancel?.();
  prefetchTask = InteractionManager.runAfterInteractions(() => {
    prefetchTask = null;
    const urls = rows.map((r) => coverImageUrl(r));
    prefetchImageUrls(urls, max);
  });
}
