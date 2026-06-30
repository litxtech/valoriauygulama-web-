import { useEffect, useState } from 'react';
import { InteractionManager, Platform, type FlatListProps } from 'react-native';

/** Sohbet FlatList — inverted: odaya girince alttan başlar, üstten kayma yok. */
export const CHAT_FLAT_LIST_PROPS: Partial<FlatListProps<unknown>> = Platform.select({
  android: {
    inverted: true,
    initialNumToRender: 18,
    maxToRenderPerBatch: 10,
    windowSize: 11,
    updateCellsBatchingPeriod: 50,
    removeClippedSubviews: false,
  },
  ios: {
    inverted: true,
    initialNumToRender: 16,
    maxToRenderPerBatch: 10,
    windowSize: 10,
    removeClippedSubviews: false,
  },
  default: {
    inverted: true,
    removeClippedSubviews: false,
  },
}) ?? {};

/**
 * FlashList v2 — `inverted` kaldırıldı. Sohbet için kronolojik data + en alttan
 * render: odaya girince son mesaj input'un hemen üstünde başlar, kullanıcı
 * aşağı kaydırmak zorunda kalmaz.
 */
export const CHAT_FLASH_LIST_PROPS = {
  drawDistance: 420,
  maintainVisibleContentPosition: {
    startRenderingFromBottom: true,
    autoscrollToBottomThreshold: 0.2,
  },
} as const;

export const CHAT_MESSAGES_PAGE_SIZE = 30;

/** Medya satırları layout'u için kısa gecikme; scroll'u yeniden tetiklemez. */
export function useChatHeavyMediaReady(
  conversationId: string | undefined,
  loading: boolean,
  opts?: { hasVideos?: boolean }
): boolean {
  const [ready, setReady] = useState(!loading);
  const deferMs = opts?.hasVideos ? (Platform.OS === 'android' ? 200 : 100) : 32;

  useEffect(() => {
    if (!conversationId) {
      setReady(false);
      return;
    }
    if (loading) {
      setReady(false);
      return;
    }
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const mark = () => {
      if (!cancelled) setReady(true);
    };
    const task = InteractionManager.runAfterInteractions(() => {
      timers.push(setTimeout(mark, deferMs));
    });
    return () => {
      cancelled = true;
      (task as { cancel?: () => void })?.cancel?.();
      timers.forEach((id) => clearTimeout(id));
    };
  }, [conversationId, loading, deferMs]);

  return ready;
}
