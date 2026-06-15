import { useCallback, useEffect, useRef } from 'react';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import {
  dequeueTextMessage,
  enqueueTextMessage,
  listAllQueued,
  type QueuedTextMessage,
} from '@/lib/chat/messageQueue';
import { staffSendMessage } from '@/lib/messagingApi';
import type { Message } from '@/lib/messaging';

type FlushResult = {
  sent: Message[];
  failedIds: string[];
};

export function useChatOutbox(
  onFlush?: (result: FlushResult) => void
) {
  const isOffline = useIsOffline();
  const flushingRef = useRef(false);

  const flush = useCallback(async () => {
    if (flushingRef.current || isOffline) return;
    flushingRef.current = true;
    try {
      const queued = await listAllQueued();
      if (!queued.length) return;
      const sent: Message[] = [];
      const failedIds: string[] = [];
      for (const item of queued) {
        const { data, error } = await staffSendMessage(
          item.conversationId,
          item.staffId,
          item.staffName,
          item.staffAvatar,
          item.text,
          'text',
          undefined,
          undefined,
          undefined,
          item.mentions.length ? item.mentions : undefined,
          item.replyToId
        );
        if (error || !data) {
          failedIds.push(item.id);
          continue;
        }
        await dequeueTextMessage(item.id);
        sent.push(data);
      }
      if (sent.length || failedIds.length) {
        onFlush?.({ sent, failedIds });
      }
    } finally {
      flushingRef.current = false;
    }
  }, [isOffline, onFlush]);

  useEffect(() => {
    if (!isOffline) void flush();
  }, [isOffline, flush]);

  const queueIfOffline = useCallback(
    async (item: QueuedTextMessage): Promise<boolean> => {
      if (!isOffline) return false;
      await enqueueTextMessage(item);
      return true;
    },
    [isOffline]
  );

  return { isOffline, queueIfOffline, flush };
}
