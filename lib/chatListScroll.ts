import { useMemo } from 'react';
import type { ViewStyle } from 'react-native';
import type { FlatList } from 'react-native';
import type { RefObject } from 'react';

/** inverted FlatList: az mesajda balonlar inputun üstünde kalır. */
export const CHAT_LIST_INVERTED_CONTENT_STYLE: ViewStyle = {
  flexGrow: 1,
};

/** inverted listede en yeni mesajlar data[0] — görsel alt = offset 0. */
export function scrollChatListToLatest(
  listRef: RefObject<FlatList<unknown> | null>,
  animated = true
): void {
  listRef.current?.scrollToOffset({ offset: 0, animated });
}

/** Kronolojik (eski→yeni) liste öğelerini inverted FlatList için ters çevir. */
export function useInvertedChatListItems<T>(items: T[]): T[] {
  return useMemo(() => [...items].reverse(), [items]);
}
