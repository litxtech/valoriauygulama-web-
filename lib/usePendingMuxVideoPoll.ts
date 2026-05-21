/**
 * Mux henüz HLS üretmediyse (mux://pending / processing) periyodik olarak edge sync çağırır;
 * realtime veya arka plan wait kaçırınca videonun takılı kalmasını önler.
 */
import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import type { Message } from '@/lib/messaging';
import { replaceChatMessage } from '@/lib/messaging';
import { getMuxThumbnailFromMessage, isMuxPendingMediaUrl, getMuxHlsPlaybackUrl } from '@/lib/muxChat';
import { requestChatMuxMessageSync } from '@/lib/muxChatUpload';

type SetMessages = Dispatch<SetStateAction<Message[]>>;

const INTERVAL_MS = 2200;

export function usePendingMuxVideoPoll(
  messages: Message[],
  setMessages: SetMessages,
  options: { enabled: boolean; guestAppToken?: string | null }
) {
  const { enabled, guestAppToken } = options;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const setRef = useRef(setMessages);
  setRef.current = setMessages;

  const pendingKey = useMemo(() => {
    return messages
      .filter(
        (m) =>
          m.message_type === 'video' &&
          Boolean(m.media_url) &&
          isMuxPendingMediaUrl(m.media_url) &&
          !String(m.id).startsWith('temp-')
      )
      .map((m) => m.id)
      .sort()
      .join('|');
  }, [messages]);

  useEffect(() => {
    if (!enabled || !pendingKey) return;
    let cancelled = false;

    const run = async () => {
      const list = messagesRef.current.filter(
        (m) =>
          m.message_type === 'video' &&
          Boolean(m.media_url) &&
          isMuxPendingMediaUrl(m.media_url) &&
          !String(m.id).startsWith('temp-')
      );
      for (const m of list) {
        if (cancelled) return;
        try {
          const r = await requestChatMuxMessageSync({
            messageId: m.id,
            appToken: guestAppToken || undefined,
          });
          const hls = r.media_url ? getMuxHlsPlaybackUrl(r.media_url) : null;
          if (!r.ready || !hls) continue;
          setRef.current((prev) => {
            const cur = prev.find((x) => x.id === m.id);
            if (!cur) return prev;
            if (!isMuxPendingMediaUrl(cur.media_url)) return prev;
            return replaceChatMessage(prev, {
              ...cur,
              media_url: hls,
              media_thumbnail: getMuxThumbnailFromMessage(hls, cur.media_thumbnail),
            });
          });
        } catch {
          /* ağ / geçici */
        }
      }
    };

    void run();
    const tid = setInterval(run, INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(tid);
    };
  }, [enabled, pendingKey, guestAppToken]);
}
