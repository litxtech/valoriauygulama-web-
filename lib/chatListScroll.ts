import { InteractionManager, Platform } from 'react-native';
import type { FlatList } from 'react-native';
import type { RefObject } from 'react';

/** Son mesaj inputun hemen üstünde — sohbet açılışında kayma animasyonu yok. */
export function snapChatListToEnd(listRef: RefObject<FlatList<unknown> | null>): void {
  listRef.current?.scrollToEnd({ animated: false });
}

/**
 * İlk açılışta animasyonsuz hizala. Android: InteractionManager sonrası tek düzeltme (çoklu scroll jank yapar).
 */
export function scheduleSnapChatListToEndAfterOpen(
  listRef: RefObject<FlatList<unknown> | null>,
  initialScrollDoneRef: RefObject<boolean>,
  opts?: { hasImages?: boolean; hasVideos?: boolean }
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const snap = () => snapChatListToEnd(listRef);
  const finish = () => {
    snap();
    initialScrollDoneRef.current = true;
  };

  if (Platform.OS === 'android') {
    snap();
    const interaction = InteractionManager.runAfterInteractions(() => {
      snap();
      timers.push(
        setTimeout(finish, opts?.hasImages || opts?.hasVideos ? 120 : 24)
      );
    });
    return () => {
      (interaction as { cancel?: () => void })?.cancel?.();
      timers.forEach((id) => clearTimeout(id));
    };
  }

  snap();
  timers.push(setTimeout(finish, 0));
  return () => timers.forEach((id) => clearTimeout(id));
}
