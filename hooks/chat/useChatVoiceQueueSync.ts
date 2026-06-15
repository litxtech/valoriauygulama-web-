import { useEffect, useMemo } from 'react';
import type { RefObject } from 'react';
import type { Message } from '@/lib/messaging';
import type { ChatListDisplayItem } from '@/lib/chatImageAlbum';
import type { ChatListRef } from '@/lib/chatListScroll';
import {
  clearChatVoiceQueue,
  extractVoiceMessageIds,
  setChatVoiceMessageOrder,
  setChatVoiceScrollHandler,
} from '@/lib/chatVoiceQueue';

export function useChatVoiceQueueSync(
  messages: Message[],
  invertedItems: ChatListDisplayItem[],
  listRef: RefObject<ChatListRef | null>
) {
  const voiceIds = useMemo(() => extractVoiceMessageIds(messages), [messages]);

  useEffect(() => {
    setChatVoiceMessageOrder(voiceIds);
  }, [voiceIds]);

  useEffect(() => {
    setChatVoiceScrollHandler((messageId) => {
      const index = invertedItems.findIndex(
        (item) => item.kind === 'message' && item.message.id === messageId
      );
      if (index < 0) return;
      const list = listRef.current;
      if (!list || !('scrollToIndex' in list) || typeof list.scrollToIndex !== 'function') return;
      try {
        list.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      } catch {
        // liste henüz ölçülmemiş olabilir
      }
    });
    return () => {
      setChatVoiceScrollHandler(null);
      clearChatVoiceQueue();
    };
  }, [invertedItems, listRef]);
}
