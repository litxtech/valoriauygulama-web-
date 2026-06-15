import { useMemo } from 'react';
import type { ViewStyle } from 'react-native';
import type { FlatList } from 'react-native';
import type { FlashList } from '@shopify/flash-list';
import type { RefObject } from 'react';

export type ChatListRef = FlatList<unknown> | FlashList<unknown>;

/** inverted FlatList: az mesajda balonlar inputun üstünde kalır. */
export const CHAT_LIST_INVERTED_CONTENT_STYLE: ViewStyle = {
  flexGrow: 1,
};

/** inverted listede en yeni mesajlar data[0] — görsel alt = offset 0. */
export function scrollChatListToLatest(
  listRef: RefObject<ChatListRef | null>,
  animated = true
): void {
  const scroll = () => {
    const list = listRef.current;
    if (!list) return;
    if ('scrollToOffset' in list && typeof list.scrollToOffset === 'function') {
      list.scrollToOffset({ offset: 0, animated });
    }
  };
  scroll();
  requestAnimationFrame(() => {
    scroll();
    requestAnimationFrame(scroll);
  });
}

/** Kronolojik (eski→yeni) liste öğelerini inverted FlatList için ters çevir. */
export function useInvertedChatListItems<T>(items: T[]): T[] {
  return useMemo(() => [...items].reverse(), [items]);
}
