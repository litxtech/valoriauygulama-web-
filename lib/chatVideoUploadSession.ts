/**
 * Sohbet video yüklemeleri: sekme/arka plan değişiminde devam, uygulama kapanınca kalıcı yeniden dene.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getInfoAsync } from 'expo-file-system/legacy';
import type { Message } from '@/lib/messaging';
import { replaceChatMessage } from '@/lib/messaging';
import { getMuxHlsPlaybackUrl, getMuxThumbnailFromMessage } from '@/lib/muxChat';
import type { ChatMediaActor } from '@/lib/chatMediaSend';
import {
  createChatVideoBatchHandlers,
  expireStaleChatVideoUploadStates,
  retryChatVideoUpload,
  sendChatVideoBatch,
  type ChatVideoBatchHandlers,
  type ChatVideoUploadState,
} from '@/lib/chatVideoBatchSend';
import { CHAT_VIDEO_DELIVERY_TIMEOUT_MESSAGE } from '@/lib/chatVideoDelivery';
import { pickChatVideosFromLibrary, pickChatVideoFromCamera } from '@/lib/chatMediaSend';

const STORAGE_KEY = '@valoria/chat_video_uploads_v2';
const INTERRUPTED_ERROR = 'chat_video_interrupted';

export type PersistedChatVideoUpload = ChatVideoUploadState & {
  conversationId: string;
  actor: ChatMediaActor;
};

type ScreenBridge = {
  patchMessages: (patch: (prev: Message[]) => Message[]) => void;
};

type ConversationBucket = {
  actor: ChatMediaActor | null;
  states: Record<string, ChatVideoUploadState>;
};

const buckets = new Map<string, ConversationBucket>();
const listeners = new Map<string, Set<(states: Record<string, ChatVideoUploadState>) => void>>();
const screens = new Map<string, ScreenBridge>();

let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let sessionInitialized = false;

/** Eski HMR dinleyicileri / sürümler: arka planda yükleme iptal edilmez. */
export function markInFlightInterrupted(): void {
  /* no-op — yükleme arka planda devam eder */
}

function notify(conversationId: string) {
  const states = buckets.get(conversationId)?.states ?? {};
  listeners.get(conversationId)?.forEach((fn) => fn({ ...states }));
}

async function persistAll() {
  const rows: PersistedChatVideoUpload[] = [];
  for (const [conversationId, bucket] of buckets.entries()) {
    if (!bucket.actor) continue;
    for (const state of Object.values(bucket.states)) {
      if (state.phase === 'done') continue;
      rows.push({ ...state, conversationId, actor: bucket.actor });
    }
  }
  try {
    if (rows.length === 0) {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } else {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    }
  } catch {
    /* */
  }
}

function setBucketStates(
  conversationId: string,
  actor: ChatMediaActor,
  states: Record<string, ChatVideoUploadState>
) {
  const prev = buckets.get(conversationId) ?? { actor: null, states: {} };
  buckets.set(conversationId, { actor, states: { ...states } });
  notify(conversationId);
  void persistAll();
}

export async function hydrateChatVideoUploadSession(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        hydrated = true;
        return;
      }
      const rows = JSON.parse(raw) as PersistedChatVideoUpload[];
      if (!Array.isArray(rows)) {
        hydrated = true;
        return;
      }
      for (const row of rows) {
        const { conversationId, actor, ...state } = row;
        if (!conversationId || !actor || !state.localUri) continue;
        const existing = buckets.get(conversationId);
        const hasLive = existing && Object.values(existing.states).some(
          (s) => s.phase !== 'done' && s.phase !== 'failed'
        );
        if (hasLive) continue;
        let phase = state.phase;
        let error = state.error;
        if (phase !== 'done' && phase !== 'failed') {
          phase = 'failed';
          error = INTERRUPTED_ERROR;
        }
        const bucket = existing ?? { actor: null, states: {} };
        const key = state.messageId ?? `persist-${state.clientId}`;
        bucket.actor = actor;
        bucket.states[key] = { ...state, phase, error, messageId: state.messageId };
        buckets.set(conversationId, bucket);
      }
    } catch {
      /* */
    }
    hydrated = true;
  })();
  return hydratePromise;
}

export function initChatVideoUploadSession() {
  if (!sessionInitialized) {
    sessionInitialized = true;
    void hydrateChatVideoUploadSession();
  }
}

export function registerChatVideoScreen(conversationId: string, bridge: ScreenBridge) {
  screens.set(conversationId, bridge);
  return () => {
    if (screens.get(conversationId) === bridge) screens.delete(conversationId);
  };
}

/** Mux HLS hazır olunca sohbet state’ini hemen güncelle (poll / realtime beklemeden). */
export function patchChatVideoMessageMedia(conversationId: string, messageId: string, mediaUrl: string): void {
  const hls = getMuxHlsPlaybackUrl(mediaUrl);
  if (!hls) return;
  const bridge = screens.get(conversationId);
  if (!bridge) return;
  bridge.patchMessages((prev) => {
    const cur = prev.find((m) => m.id === messageId);
    if (!cur || cur.message_type !== 'video') return prev;
    return replaceChatMessage(prev, {
      ...cur,
      media_url: hls,
      mime_type: 'application/x-mpegURL',
      media_thumbnail: getMuxThumbnailFromMessage(hls, cur.media_thumbnail),
    });
  });
}

export function getChatVideoUploadStates(conversationId: string): Record<string, ChatVideoUploadState> {
  return { ...(buckets.get(conversationId)?.states ?? {}) };
}

export function subscribeChatVideoUploads(
  conversationId: string,
  listener: (states: Record<string, ChatVideoUploadState>) => void
): () => void {
  const set = listeners.get(conversationId) ?? new Set();
  set.add(listener);
  listeners.set(conversationId, set);
  listener(getChatVideoUploadStates(conversationId));
  return () => {
    const s = listeners.get(conversationId);
    s?.delete(listener);
  };
}

export type SessionChatVideoHandlerExtras = {
  setMessages?: (patch: (prev: Message[]) => Message[]) => void;
  onConversationId?: (conversationId: string) => void;
  onBatchReady?: ChatVideoBatchHandlers['onBatchReady'];
  onBatchComplete?: ChatVideoBatchHandlers['onBatchComplete'];
};

export function createSessionChatVideoHandlers(
  conversationId: string,
  actor: ChatMediaActor,
  extra?: SessionChatVideoHandlerExtras
): ChatVideoBatchHandlers {
  return createChatVideoBatchHandlers({
    setUploadStates: (states) => {
      setBucketStates(conversationId, actor, states);
    },
    setMessages: (patch) => {
      screens.get(conversationId)?.patchMessages(patch);
      extra?.setMessages?.(patch);
    },
    onConversationId: extra?.onConversationId,
    onBatchReady: extra?.onBatchReady,
    onBatchComplete: (info) => {
      extra?.onBatchComplete?.(info);
      void persistAll();
    },
  });
}

export function startChatVideoUpload(
  actor: ChatMediaActor,
  uris: string[],
  handlers: ChatVideoBatchHandlers
): { conversationId: string; queued: number } {
  initChatVideoUploadSession();
  const conversationId = actor.conversationId;
  buckets.set(conversationId, {
    actor,
    states: buckets.get(conversationId)?.states ?? {},
  });
  return sendChatVideoBatch(actor, uris, handlers);
}

export async function sendChatVideoFromPickerWithSession(
  actor: ChatMediaActor,
  source: 'camera' | 'library',
  handlers: ChatVideoBatchHandlers
): Promise<{ conversationId: string; queued: number }> {
  initChatVideoUploadSession();
  const uris =
    source === 'camera'
      ? ([await pickChatVideoFromCamera()].filter(Boolean) as string[])
      : await pickChatVideosFromLibrary();
  if (!uris.length) return { conversationId: actor.conversationId, queued: 0 };
  return startChatVideoUpload(actor, uris, handlers);
}

export async function retryChatVideoUploadWithSession(
  actor: ChatMediaActor,
  state: ChatVideoUploadState,
  extra?: SessionChatVideoHandlerExtras
): Promise<boolean> {
  initChatVideoUploadSession();
  const localUri = state.localUri?.trim();
  if (!localUri) return false;
  try {
    const info = await getInfoAsync(localUri);
    if (!info.exists) {
      const key = state.messageId ?? state.clientId;
      const bucket = buckets.get(actor.conversationId);
      if (bucket) {
        bucket.states[key] = {
          ...state,
          phase: 'failed',
          progress: 0,
          error: CHAT_VIDEO_DELIVERY_TIMEOUT_MESSAGE,
        };
        setBucketStates(actor.conversationId, actor, bucket.states);
      }
      return false;
    }
  } catch {
    return false;
  }
  return retryChatVideoUpload(actor, state, createSessionChatVideoHandlers(actor.conversationId, actor, extra));
}

export function expireStaleChatVideoUploadsForConversation(conversationId: string) {
  const bucket = buckets.get(conversationId);
  if (!bucket?.actor) return;
  const next = expireStaleChatVideoUploadStates(bucket.states);
  setBucketStates(conversationId, bucket.actor, next);
}

export function pruneDoneChatVideoUploads(conversationId: string) {
  const bucket = buckets.get(conversationId);
  if (!bucket?.actor) return;
  const next = { ...bucket.states };
  let changed = false;
  for (const [k, s] of Object.entries(next)) {
    if (s.phase === 'done') {
      delete next[k];
      changed = true;
    }
  }
  if (changed) setBucketStates(conversationId, bucket.actor, next);
}

export function clearChatVideoUploadState(conversationId: string, messageKey: string) {
  const bucket = buckets.get(conversationId);
  if (!bucket) return;
  const next = { ...bucket.states };
  delete next[messageKey];
  if (bucket.actor) setBucketStates(conversationId, bucket.actor, next);
}

/** Yarım kalan video yüklemesini iptal et — UI ve oturum durumundan kaldırır. */
export function cancelChatVideoUpload(conversationId: string, state: ChatVideoUploadState): string[] {
  const tempKey = `temp-video-${state.clientId}`;
  const messageIds = [state.messageId, tempKey].filter((id): id is string => Boolean(id));

  const bucket = buckets.get(conversationId);
  if (bucket?.actor) {
    const next = { ...bucket.states };
    for (const [key, s] of Object.entries(next)) {
      if (s.clientId === state.clientId || key === tempKey || key === state.messageId) {
        delete next[key];
      }
    }
    setBucketStates(conversationId, bucket.actor, next);
  }

  screens.get(conversationId)?.patchMessages((prev) =>
    prev.filter((m) => !messageIds.includes(m.id))
  );
  void persistAll();
  return messageIds;
}

export function isChatVideoInterruptedError(error?: string): boolean {
  return error === INTERRUPTED_ERROR;
}

export { getChatVideoBatchSummary } from '@/lib/chatVideoBatchSend';
export type { ChatVideoUploadState } from '@/lib/chatVideoBatchSend';

export function useChatVideoUploadStates(conversationId: string | undefined) {
  const [states, setStates] = useState<Record<string, ChatVideoUploadState>>({});

  useEffect(() => {
    initChatVideoUploadSession();
    if (!conversationId) {
      setStates({});
      return;
    }
    void hydrateChatVideoUploadSession().then(() => {
      setStates(getChatVideoUploadStates(conversationId));
    });
    return subscribeChatVideoUploads(conversationId, setStates);
  }, [conversationId]);

  return states;
}
