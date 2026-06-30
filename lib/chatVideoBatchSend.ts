/**
 * Video gönderimi: anında albüm UI → mesajlar hızlı DB → yükleme arka planda (sırayla).
 */
import type { Message } from '@/lib/messaging';
import { dedupeChatMessagesById, upsertIncomingChatMessage, replaceChatMessage } from '@/lib/messaging';
import { LOCAL_VIDEO_PREVIEW_PREFIX, MUX_PENDING_PREFIX } from '@/lib/muxChat';
import { uploadChatVideoForGuest, uploadChatVideoForStaff } from '@/lib/muxChatUpload';
import {
  staffSendMessage,
  guestSendMessage,
  partnerSendMessage,
  patchChatMessageThumbnail,
  resolveStaffConversationIdForSend,
  resolveGuestConversationIdForSend,
} from '@/lib/messagingApi';
import { makeChatVideoAlbumContent } from '@/lib/chatImageAlbum';
import {
  buildEarlyVideoPreview,
  ensureChatVideoLocalUri,
  extractChatVideoThumbnailUri,
  uploadChatVideoThumbnail,
} from '@/lib/chatVideoThumbnail';
import type { ChatMediaActor } from '@/lib/chatMediaSend';
import {
  CHAT_VIDEO_DELIVERY_TIMEOUT_MESSAGE,
  isChatVideoUploadStale,
} from '@/lib/chatVideoDelivery';

export type ChatVideoUploadPhase =
  | 'queued'
  | 'creating'
  | 'compressing'
  | 'uploading'
  | 'processing'
  | 'done'
  | 'failed';

export type ChatVideoUploadState = {
  clientId: string;
  localUri: string;
  messageId?: string;
  phase: ChatVideoUploadPhase;
  progress: number;
  error?: string;
  startedAt?: number;
};

export type ChatVideoBatchHandlers = {
  onUploadStates: (states: Record<string, ChatVideoUploadState>) => void;
  onMessagesPatch: (patch: (prev: Message[]) => Message[]) => void;
  onConversationId?: (conversationId: string) => void;
  /** Tüm mesajlar DB'de — bildirim / scroll burada */
  onBatchReady?: (info: { conversationId: string; messageCount: number }) => void;
  onBatchComplete?: (info: {
    conversationId: string;
    sent: number;
    failed: number;
    lastError?: string;
  }) => void;
};

function tempMessageId(clientId: string): string {
  return `temp-video-${clientId}`;
}

function newChatVideoClientId(index: number): string {
  return `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyMessageFields(): Pick<
  Message,
  | 'file_name'
  | 'file_size'
  | 'mime_type'
  | 'location_lat'
  | 'location_lng'
  | 'location_name'
  | 'is_delivered'
  | 'delivered_at'
  | 'is_read'
  | 'read_at'
  | 'is_edited'
  | 'edited_at'
  | 'is_deleted'
  | 'deleted_at'
  | 'reply_to_id'
  | 'scheduled_at'
> {
  return {
    file_name: null,
    file_size: null,
    mime_type: null,
    location_lat: null,
    location_lng: null,
    location_name: null,
    is_delivered: false,
    delivered_at: null,
    is_read: false,
    read_at: null,
    is_edited: false,
    edited_at: null,
    is_deleted: false,
    deleted_at: null,
    reply_to_id: null,
    scheduled_at: null,
  };
}

function buildOptimisticVideoMessage(
  actor: ChatMediaActor,
  clientId: string,
  localUri: string,
  conversationId: string,
  albumContent: string | null,
  orderIndex: number
): Message {
  const now = new Date(Date.now() + orderIndex).toISOString();
  const base = {
    id: tempMessageId(clientId),
    conversation_id: conversationId,
    message_type: 'video' as const,
    content: albumContent,
    media_url: LOCAL_VIDEO_PREVIEW_PREFIX,
    media_thumbnail: localUri,
    ...emptyMessageFields(),
    created_at: now,
  };
  if (actor.kind === 'staff') {
    return {
      ...base,
      sender_id: actor.staffId,
      sender_type: 'staff',
      sender_name: actor.staffName,
      sender_avatar: actor.staffAvatar,
    };
  }
  if (actor.kind === 'partner') {
    return {
      ...base,
      sender_id: actor.partnerUserId,
      sender_type: 'partner',
      sender_name: actor.partnerDisplayName,
      sender_avatar: null,
    };
  }
  return {
    ...base,
    sender_id: '',
    sender_type: 'guest',
    sender_name: null,
    sender_avatar: null,
  };
}

function phaseProgress(phase: ChatVideoUploadPhase, uploadRatio = 0): number {
  const upload = Math.min(1, Math.max(0, uploadRatio));
  switch (phase) {
    case 'queued':
      return 2;
    case 'creating':
      return 8;
    case 'compressing':
      return 12 + Math.round(upload * 20);
    case 'uploading':
      return 34 + Math.round(upload * 58);
    case 'processing':
      return 96;
    case 'done':
      return 100;
    case 'failed':
      return 0;
    default:
      return 0;
  }
}

async function createVideoMessage(
  actor: ChatMediaActor,
  resolvedConversationId: string,
  thumbnailUrl: string | null,
  albumContent: string | null
): Promise<{ message: Message | null; error: string | null }> {
  const pendingUrl = `${MUX_PENDING_PREFIX}`;
  const content = albumContent ?? '';
  if (actor.kind === 'staff') {
    const { data, error } = await staffSendMessage(
      resolvedConversationId,
      actor.staffId,
      actor.staffName,
      actor.staffAvatar,
      content,
      'video',
      pendingUrl,
      thumbnailUrl,
      resolvedConversationId
    );
    return { message: data, error };
  }
  if (actor.kind === 'partner') {
    const { messageId, error } = await partnerSendMessage(
      resolvedConversationId,
      content,
      'video',
      pendingUrl,
      thumbnailUrl
    );
    if (!messageId) return { message: null, error: error ?? 'partner_send_failed' };
    return {
      message: {
        id: messageId,
        conversation_id: resolvedConversationId,
        sender_id: actor.partnerUserId,
        sender_type: 'partner',
        sender_name: actor.partnerDisplayName,
        sender_avatar: null,
        message_type: 'video',
        content: albumContent,
        media_url: pendingUrl,
        media_thumbnail: thumbnailUrl,
        ...emptyMessageFields(),
        created_at: new Date().toISOString(),
      },
      error: null,
    };
  }
  const { messageId, conversationId: cid } = await guestSendMessage(
    actor.appToken,
    resolvedConversationId,
    content,
    'video',
    pendingUrl,
    thumbnailUrl,
    resolvedConversationId
  );
  if (!messageId) return { message: null, error: 'guest_send_failed' };
  return {
    message: {
      id: messageId,
      conversation_id: cid ?? resolvedConversationId,
      sender_id: '',
      sender_type: 'guest',
      sender_name: null,
      sender_avatar: null,
      message_type: 'video',
      content: albumContent,
      media_url: pendingUrl,
      media_thumbnail: thumbnailUrl,
      ...emptyMessageFields(),
      created_at: new Date().toISOString(),
    },
    error: null,
  };
}

function patchThumbLater(
  actor: ChatMediaActor,
  conversationId: string,
  messageId: string,
  preparedLocalUri: string,
  handlers: ChatVideoBatchHandlers
) {
  void (async () => {
    const thumbLocal = await extractChatVideoThumbnailUri(preparedLocalUri);
    if (!thumbLocal) return;
    const thumbnailUrl = await uploadChatVideoThumbnail({ ...actor, conversationId } as ChatMediaActor, thumbLocal);
    if (!thumbnailUrl) return;
    await patchChatMessageThumbnail(messageId, thumbnailUrl);
    handlers.onMessagesPatch((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, media_thumbnail: thumbnailUrl } : m))
    );
  })();
}

type ClientRow = { clientId: string; localUri: string };

function patchMessageThumbnail(
  handlers: ChatVideoBatchHandlers,
  messageId: string,
  thumbnailUri: string
): void {
  handlers.onMessagesPatch((prev) =>
    prev.map((m) => (m.id === messageId ? { ...m, media_thumbnail: thumbnailUri } : m))
  );
}

/** Optimistik mesajlara seçimden hemen sonra poster koy (pipeline beklemeden). */
function warmEarlyVideoPreviews(clients: ClientRow[], handlers: ChatVideoBatchHandlers): void {
  void (async () => {
    for (const { clientId, localUri } of clients) {
      const tempKey = tempMessageId(clientId);
      try {
        const early = await buildEarlyVideoPreview(localUri);
        if (early.posterUri) {
          patchMessageThumbnail(handlers, tempKey, early.posterUri);
        }
      } catch {
        /* poster opsiyonel */
      }
    }
  })();
}

type UploadJob = {
  clientId: string;
  localUri: string;
  preparedLocalUri: string;
  message: Message;
  tempKey: string;
  realKey: string;
};

async function runChatVideoUploadPipeline(
  actor: ChatMediaActor,
  clients: ClientRow[],
  albumContent: string | null,
  handlers: ChatVideoBatchHandlers,
  initialConversationId: string
): Promise<{ conversationId: string; sent: number; failed: number; lastError?: string }> {
  let lastError: string | undefined;
  let sent = 0;
  let failed = 0;

  let states: Record<string, ChatVideoUploadState> = {};
  const publishStates = () => handlers.onUploadStates({ ...states });
  const setState = (messageKey: string, patch: Partial<ChatVideoUploadState>) => {
    const prev = states[messageKey];
    if (!prev) return;
    states = { ...states, [messageKey]: { ...prev, ...patch } };
    publishStates();
  };

  const ownSenderId =
    actor.kind === 'staff' ? actor.staffId : actor.kind === 'partner' ? actor.partnerUserId : undefined;
  const ownSenderType =
    actor.kind === 'guest' ? ('guest' as const) : actor.kind === 'partner' ? ('partner' as const) : undefined;

  let resolvedConversationId = initialConversationId;
  try {
    if (actor.kind === 'staff') {
      resolvedConversationId = await resolveStaffConversationIdForSend(initialConversationId, actor.staffId);
    } else if (actor.kind === 'guest') {
      resolvedConversationId = await resolveGuestConversationIdForSend(actor.appToken, initialConversationId);
    }
    handlers.onConversationId?.(resolvedConversationId);
  } catch (e) {
    lastError = (e as Error)?.message ?? 'resolve_failed';
    for (const { clientId, localUri } of clients) {
      setState(tempMessageId(clientId), { phase: 'failed', progress: 0, error: lastError });
    }
    handlers.onBatchComplete?.({
      conversationId: resolvedConversationId,
      sent: 0,
      failed: clients.length,
      lastError,
    });
    return { conversationId: resolvedConversationId, sent: 0, failed: clients.length, lastError };
  }

  const jobs: UploadJob[] = [];

  for (const row of clients) {
    const { clientId, localUri } = row;
    const tempKey = tempMessageId(clientId);
    setState(tempKey, { phase: 'creating', progress: phaseProgress('creating') });

    let preparedLocalUri = localUri;
    let earlyPoster: string | null = null;
    try {
      const early = await buildEarlyVideoPreview(localUri);
      preparedLocalUri = early.localUri;
      earlyPoster = early.posterUri;
      patchMessageThumbnail(handlers, tempKey, earlyPoster ?? preparedLocalUri);
    } catch (e) {
      lastError = (e as Error)?.message ?? 'prep_failed';
      failed += 1;
      setState(tempKey, { phase: 'failed', progress: 0, error: lastError });
      continue;
    }

    let message: Message | null = null;
    let remoteThumb: string | null = null;
    try {
      if (earlyPoster) {
        try {
          remoteThumb = await uploadChatVideoThumbnail(
            { ...actor, conversationId: resolvedConversationId } as ChatMediaActor,
            earlyPoster
          );
        } catch {
          remoteThumb = null;
        }
      }
      const created = await createVideoMessage(actor, resolvedConversationId, remoteThumb, albumContent);
      if (created.error || !created.message?.id) {
        throw new Error(created.error ?? 'create_failed');
      }
      message = created.message;
    } catch (e) {
      const errText = (e as Error)?.message ?? 'create_failed';
      lastError = errText;
      failed += 1;
      setState(tempKey, { phase: 'failed', progress: 0, error: errText });
      continue;
    }

    const realKey = message.id;
    const prevState = states[tempKey];
    states = { ...states };
    delete states[tempKey];
    states[realKey] = {
      ...prevState,
      messageId: message.id,
      phase: 'queued',
      progress: phaseProgress('queued'),
      startedAt: prevState?.startedAt ?? Date.now(),
    };
    publishStates();

    const displayThumb = remoteThumb ?? earlyPoster ?? preparedLocalUri;
    handlers.onMessagesPatch((prev) => {
      const withoutTemp = prev.filter((m) => m.id !== tempKey);
      const withThumb = { ...message!, media_thumbnail: displayThumb, content: albumContent };
      return upsertIncomingChatMessage(withoutTemp, withThumb, {
        ownSenderId,
        ownSenderType,
        replaceTempId: tempKey,
      });
    });

    if (!remoteThumb) {
      patchThumbLater(actor, resolvedConversationId, message.id, preparedLocalUri, handlers);
    }

    jobs.push({ clientId, localUri, preparedLocalUri, message, tempKey, realKey });
  }

  if (jobs.length > 0) {
    handlers.onBatchReady?.({ conversationId: resolvedConversationId, messageCount: jobs.length });
  }

  for (const job of jobs) {
    const { realKey, message, localUri, preparedLocalUri } = job;
    try {
      setState(realKey, {
        phase: 'compressing',
        progress: phaseProgress('compressing', 0),
        startedAt: Date.now(),
      });
      const uploadParams = {
        conversationId: resolvedConversationId,
        messageId: message.id,
        videoUri: localUri,
        preparedLocalUri,
        onCompressing: () => setState(realKey, { phase: 'compressing', progress: phaseProgress('compressing', 0) }),
        onCompressProgress: (ratio: number) =>
          setState(realKey, { phase: 'compressing', progress: phaseProgress('compressing', ratio) }),
        onUploadProgress: (ratio: number) =>
          setState(realKey, { phase: 'uploading', progress: phaseProgress('uploading', ratio) }),
      };
      if (actor.kind === 'staff' || actor.kind === 'partner') {
        await uploadChatVideoForStaff(uploadParams);
      } else {
        await uploadChatVideoForGuest({ ...uploadParams, appToken: actor.appToken });
      }
      setState(realKey, { phase: 'done', progress: 100 });
      sent += 1;
    } catch (e) {
      const errText = (e as Error)?.message ?? 'upload_failed';
      lastError = errText;
      failed += 1;
      setState(realKey, { phase: 'failed', progress: 0, error: errText });
    }
  }

  handlers.onBatchComplete?.({ conversationId: resolvedConversationId, sent, failed, lastError });
  return { conversationId: resolvedConversationId, sent, failed, lastError };
}

/** Anında UI; yükleme arka planda biter. */
export function sendChatVideoBatch(
  actor: ChatMediaActor,
  uris: string[],
  handlers: ChatVideoBatchHandlers
): { conversationId: string; queued: number } {
  if (!uris.length) {
    return { conversationId: actor.conversationId, queued: 0 };
  }

  const batchId = uris.length > 1 ? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}` : null;
  const albumContent = batchId ? makeChatVideoAlbumContent(batchId) : null;

  const clients: ClientRow[] = uris.map((uri, i) => ({
    clientId: newChatVideoClientId(i),
    localUri: uri,
  }));

  const startedAt = Date.now();
  const states: Record<string, ChatVideoUploadState> = {};
  for (const { clientId, localUri } of clients) {
    states[tempMessageId(clientId)] = {
      clientId,
      localUri,
      phase: 'queued',
      progress: phaseProgress('queued'),
      startedAt,
    };
  }
  handlers.onUploadStates({ ...states });

  const optimistics = clients.map((c, i) =>
    buildOptimisticVideoMessage(actor, c.clientId, c.localUri, actor.conversationId, albumContent, i)
  );
  handlers.onMessagesPatch((prev) => dedupeChatMessagesById([...prev, ...optimistics]));

  warmEarlyVideoPreviews(clients, handlers);

  void runChatVideoUploadPipeline(actor, clients, albumContent, handlers, actor.conversationId).catch((e) => {
    handlers.onBatchComplete?.({
      conversationId: actor.conversationId,
      sent: 0,
      failed: clients.length,
      lastError: (e as Error)?.message ?? 'batch_failed',
    });
  });

  return { conversationId: actor.conversationId, queued: clients.length };
}

export async function retryChatVideoUpload(
  actor: ChatMediaActor,
  state: ChatVideoUploadState,
  handlers: ChatVideoBatchHandlers
): Promise<boolean> {
  const messageId = state.messageId;
  if (!messageId || !state.localUri) return false;
  const messageKey = messageId;
  const conversationId = actor.conversationId;

  const setState = (patch: Partial<ChatVideoUploadState>) => {
    handlers.onUploadStates({
      [messageKey]: {
        ...state,
        ...patch,
        clientId: state.clientId,
        localUri: state.localUri,
        messageId,
        startedAt: patch.startedAt ?? state.startedAt ?? Date.now(),
      },
    });
  };

  try {
    setState({ phase: 'compressing', progress: phaseProgress('compressing', 0), error: undefined, startedAt: Date.now() });
    const preparedLocalUri = await ensureChatVideoLocalUri(state.localUri);
    const retryUpload = {
      conversationId,
      messageId,
      videoUri: state.localUri,
      preparedLocalUri,
      onCompressing: () => setState({ phase: 'compressing', progress: phaseProgress('compressing', 0) }),
      onCompressProgress: (ratio: number) =>
        setState({ phase: 'compressing', progress: phaseProgress('compressing', ratio) }),
      onUploadProgress: (ratio: number) =>
        setState({ phase: 'uploading', progress: phaseProgress('uploading', ratio) }),
    };
    if (actor.kind === 'staff' || actor.kind === 'partner') {
      await uploadChatVideoForStaff(retryUpload);
    } else {
      await uploadChatVideoForGuest({ ...retryUpload, appToken: actor.appToken });
    }
    setState({ phase: 'done', progress: 100, error: undefined });
    return true;
  } catch (e) {
    setState({
      phase: 'failed',
      progress: 0,
      error: (e as Error)?.message ?? 'upload_failed',
    });
    return false;
  }
}

/** Takılı kalan yüklemeleri iptal et (UI döngüsünü keser). */
export function expireStaleChatVideoUploadStates(
  states: Record<string, ChatVideoUploadState>
): Record<string, ChatVideoUploadState> {
  let changed = false;
  const next: Record<string, ChatVideoUploadState> = { ...states };
  for (const [key, s] of Object.entries(next)) {
    if (s.phase === 'done' || s.phase === 'failed') continue;
    if (!isChatVideoUploadStale(s.startedAt)) continue;
    changed = true;
    next[key] = {
      ...s,
      phase: 'failed',
      progress: 0,
      error: CHAT_VIDEO_DELIVERY_TIMEOUT_MESSAGE,
    };
  }
  return changed ? next : states;
}

export function getChatVideoBatchSummary(states: Record<string, ChatVideoUploadState>): {
  active: boolean;
  total: number;
  done: number;
  failed: number;
  overallPercent: number;
} {
  const list = Object.values(states);
  if (!list.length) {
    return { active: false, total: 0, done: 0, failed: 0, overallPercent: 0 };
  }
  const total = list.length;
  const done = list.filter((s) => s.phase === 'done').length;
  const failed = list.filter((s) => s.phase === 'failed').length;
  const active = list.some((s) => s.phase !== 'done' && s.phase !== 'failed');
  const overallPercent =
    total > 0 ? Math.round(list.reduce((sum, s) => sum + s.progress, 0) / total) : 0;
  return { active, total, done, failed, overallPercent };
}

export function patchMessageFromRealtime(prev: Message[], updated: Message): Message[] {
  return replaceChatMessage(prev, updated);
}

export function createChatVideoBatchHandlers(opts: {
  setUploadStates: (states: Record<string, ChatVideoUploadState>) => void;
  setMessages: (patch: (prev: Message[]) => Message[]) => void;
  onConversationId?: (conversationId: string) => void;
  onBatchReady?: (info: { conversationId: string; messageCount: number }) => void;
  onBatchComplete?: (info: {
    conversationId: string;
    sent: number;
    failed: number;
    lastError?: string;
  }) => void;
}): ChatVideoBatchHandlers {
  return {
    onUploadStates: opts.setUploadStates,
    onMessagesPatch: opts.setMessages,
    onConversationId: opts.onConversationId,
    onBatchReady: opts.onBatchReady,
    onBatchComplete: opts.onBatchComplete,
  };
}
