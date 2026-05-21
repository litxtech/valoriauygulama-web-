import { useEffect, useState } from 'react';
import { InteractionManager, Platform, type FlatListProps } from 'react-native';

/** Sohbet FlatList — Android'de görünür alan dışını kırp, ilk boyamayı sınırla. */
export const CHAT_FLAT_LIST_PROPS: Partial<FlatListProps<unknown>> = Platform.select({
  android: {
    initialNumToRender: 10,
    maxToRenderPerBatch: 6,
    windowSize: 6,
    updateCellsBatchingPeriod: 48,
    removeClippedSubviews: true,
  },
  ios: {
    initialNumToRender: 14,
    maxToRenderPerBatch: 10,
    windowSize: 9,
  },
  default: {},
}) ?? {};

/**
 * Android: odaya girince tüm videoların HLS preload'unu ertele (kasma azalır).
 * iOS: hemen true.
 */
export function useChatHeavyMediaReady(conversationId: string | undefined, loading: boolean): boolean {
  const [ready, setReady] = useState(Platform.OS === 'ios');

  useEffect(() => {
    setReady(Platform.OS === 'ios');
  }, [conversationId]);

  useEffect(() => {
    if (Platform.OS === 'ios' || loading) return;
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
      (task as { cancel?: () => void })?.cancel?.();
    };
  }, [conversationId, loading]);

  return ready;
}
