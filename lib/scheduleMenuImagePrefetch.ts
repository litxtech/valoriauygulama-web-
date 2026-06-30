import { InteractionManager, Platform } from 'react-native';
import { coverImageUrl, type HotelKitchenMenuItemWithImages } from '@/lib/hotelKitchenMenu';
import { prefetchImageUrls } from '@/lib/prefetchImageUrls';

let prefetchTask: { cancel?: () => void } | null = null;

/** Liste çizildikten sonra kapak görsellerini ısıtır — ilk açılışı bloklamaz */
export function scheduleMenuImagePrefetch(
  rows: HotelKitchenMenuItemWithImages[],
  max = 28
): void {
  prefetchTask?.cancel?.();
  const run = () => {
    prefetchTask = null;
    const urls = rows.map((r) => coverImageUrl(r));
    prefetchImageUrls(urls, max);
  };
  if (Platform.OS === 'web' && typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(run, { timeout: 1200 });
    prefetchTask = { cancel: () => cancelIdleCallback(id) };
    return;
  }
  prefetchTask = InteractionManager.runAfterInteractions(run);
}
