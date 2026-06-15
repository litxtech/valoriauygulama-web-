import type { Message } from '@/lib/messaging';
import { isTempMessageId } from '@/lib/chatOptimisticMessage';
import { resolveVoiceMediaUrl } from '@/lib/voiceMessageMeta';
import { scheduleVoiceHandoffThenPlay } from '@/lib/chatVoiceHandoffSound';

export type VoicePlayerHandle = {
  messageId: string;
  play: () => Promise<void>;
  stop: () => Promise<void>;
};

let voiceOrder: string[] = [];
const handles = new Map<string, VoicePlayerHandle>();
let activeId: string | null = null;
let pendingAutoPlayId: string | null = null;
let scrollToMessageHandler: ((messageId: string) => void) | null = null;
let autoPlayRetryTimer: ReturnType<typeof setTimeout> | null = null;

export function extractVoiceMessageIds(messages: Message[]): string[] {
  return messages
    .filter(
      (m) =>
        !m.is_deleted &&
        m.message_type === 'voice' &&
        !isTempMessageId(m.id) &&
        !!resolveVoiceMediaUrl(m.media_url, m.content)
    )
    .map((m) => m.id);
}

export function setChatVoiceMessageOrder(ids: string[]) {
  voiceOrder = ids;
}

export function setChatVoiceScrollHandler(handler: ((messageId: string) => void) | null) {
  scrollToMessageHandler = handler;
}

export function registerVoicePlayer(handle: VoicePlayerHandle): () => void {
  handles.set(handle.messageId, handle);
  if (pendingAutoPlayId === handle.messageId) {
    pendingAutoPlayId = null;
    if (autoPlayRetryTimer) {
      clearTimeout(autoPlayRetryTimer);
      autoPlayRetryTimer = null;
    }
    scheduleVoiceHandoffThenPlay(() => handle.play());
  }
  return () => {
    handles.delete(handle.messageId);
    if (activeId === handle.messageId) activeId = null;
  };
}

export function notifyVoicePlaybackStarted(messageId: string) {
  if (activeId && activeId !== messageId) {
    void handles.get(activeId)?.stop();
  }
  activeId = messageId;
  pendingAutoPlayId = null;
  if (autoPlayRetryTimer) {
    clearTimeout(autoPlayRetryTimer);
    autoPlayRetryTimer = null;
  }
}

export function notifyVoicePlaybackFinished(messageId: string) {
  if (activeId !== messageId) return;
  activeId = null;

  const idx = voiceOrder.indexOf(messageId);
  if (idx < 0) return;

  const nextId = voiceOrder[idx + 1];
  if (!nextId) return;

  pendingAutoPlayId = nextId;
  const next = handles.get(nextId);
  if (next) {
    pendingAutoPlayId = null;
    scheduleVoiceHandoffThenPlay(() => next.play());
    return;
  }

  scrollToMessageHandler?.(nextId);
  autoPlayRetryTimer = setTimeout(() => {
    autoPlayRetryTimer = null;
    if (pendingAutoPlayId !== nextId) return;
    const h = handles.get(nextId);
    if (h) {
      pendingAutoPlayId = null;
      scheduleVoiceHandoffThenPlay(() => h.play());
    }
  }, 400);
}

/** Kayıt başlamadan önce tüm sohbet ses oynatıcılarını durdur (iOS session). */
export async function stopAllChatVoicePlayback(): Promise<void> {
  const players = [...handles.values()];
  await Promise.all(players.map((p) => p.stop().catch(() => {})));
  activeId = null;
  pendingAutoPlayId = null;
  if (autoPlayRetryTimer) {
    clearTimeout(autoPlayRetryTimer);
    autoPlayRetryTimer = null;
  }
}

export function clearChatVoiceQueue() {
  voiceOrder = [];
  handles.clear();
  activeId = null;
  pendingAutoPlayId = null;
  scrollToMessageHandler = null;
  if (autoPlayRetryTimer) {
    clearTimeout(autoPlayRetryTimer);
    autoPlayRetryTimer = null;
  }
}
