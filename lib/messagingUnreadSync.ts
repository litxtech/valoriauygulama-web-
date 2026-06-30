/**
 * Tab menü mesaj rozeti — sohbet listesine girmeden güncelleme (realtime + push).
 */
import { AppState } from 'react-native';
import i18n from '@/i18n';
import { supabase } from '@/lib/supabase';
import { guestListConversations } from '@/lib/messagingApi';
import { fetchStaffMessagingUnreadCount } from '@/lib/messagingUnreadCount';
import { formatReplyMessagePreview } from '@/lib/chatPreviewText';
import type { Message, ParticipantType } from '@/lib/messaging';
import { playForegroundNotificationSound } from '@/lib/notificationSoundForeground';
import { useAuthStore } from '@/stores/authStore';
import { useGuestMessagingStore } from '@/stores/guestMessagingStore';
import { useStaffUnreadMessagesStore } from '@/stores/staffUnreadMessagesStore';
import { useMessagePushToastStore } from '@/stores/messagePushToastStore';

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleDebounced(key: string, fn: () => void, delayMs: number): void {
  const prev = debounceTimers.get(key);
  if (prev) clearTimeout(prev);
  if (delayMs <= 0) {
    debounceTimers.delete(key);
    fn();
    return;
  }
  debounceTimers.set(
    key,
    setTimeout(() => {
      debounceTimers.delete(key);
      fn();
    }, delayMs)
  );
}

export function isMessagePushPayload(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  if (data.screen === 'messages') return true;
  const nt =
    typeof data.notificationType === 'string'
      ? data.notificationType
      : typeof data.notification_type === 'string'
        ? data.notification_type
        : '';
  if (nt === 'message') return true;
  if (nt === 'chat_message' || nt === 'chat_mention') return true;
  if (typeof data.conversationId === 'string' && data.conversationId.trim()) return true;
  if (typeof data.conversation_id === 'string' && data.conversation_id.trim()) return true;
  const url = typeof data.url === 'string' ? data.url : '';
  if (url.includes('/chat/')) return true;
  return false;
}

export function scheduleStaffMessagingUnreadRefresh(staffId: string, delayMs = 1_200): void {
  scheduleDebounced(`staff:${staffId}`, () => {
    void useStaffUnreadMessagesStore.getState().refreshUnread(staffId);
  }, delayMs);
}

export function scheduleGuestMessagingUnreadRefresh(appToken: string, delayMs = 1_200): void {
  scheduleDebounced(`guest:${appToken}`, () => {
    void guestListConversations(appToken).then((list) => {
      const total = list.reduce((s, c) => s + (c.unread_count ?? 0), 0);
      useGuestMessagingStore.getState().setUnreadCount(total);
    });
  }, delayMs);
}

/** Ön planda modern Valoria mesaj banner'ı. */
export function showMessagePushToast(payload: {
  senderName: string;
  body: string;
  subtitle?: string;
  conversationId?: string;
  url?: string;
  isGroup?: boolean;
  avatarUri?: string;
}): void {
  const senderName = (payload.senderName ?? '').trim() || i18n.t('guestDefaultName');
  const body = (payload.body ?? '').trim() || i18n.t('chatPushPreviewFallback');
  useMessagePushToastStore.getState().show({
    senderName,
    body,
    subtitle: payload.subtitle,
    conversationId: payload.conversationId,
    url: payload.url,
    isGroup: payload.isGroup,
    avatarUri: payload.avatarUri,
  });
}

const recentToastMessageIds = new Map<string, number>();
const TOAST_DEDUP_MS = 12_000;

function shouldShowMessageToast(messageId: string | undefined): boolean {
  if (!messageId) return true;
  const now = Date.now();
  const prev = recentToastMessageIds.get(messageId);
  if (prev != null && now - prev < TOAST_DEDUP_MS) return false;
  recentToastMessageIds.set(messageId, now);
  if (recentToastMessageIds.size > 80) {
    for (const [id, ts] of recentToastMessageIds) {
      if (now - ts > TOAST_DEDUP_MS) recentToastMessageIds.delete(id);
    }
  }
  return true;
}

export function showMessagePushToastFromNotification(
  notification: {
    request?: {
      content?: {
        title?: string | null;
        body?: string | null;
        subtitle?: string | null;
        data?: Record<string, unknown>;
      };
    };
  } | null | undefined
): void {
  const content = notification?.request?.content;
  const data =
    content?.data && typeof content.data === 'object'
      ? (content.data as Record<string, unknown>)
      : {};
  if (!isMessagePushPayload(data)) return;

  const messageId =
    (typeof data.messageId === 'string' && data.messageId.trim()) ||
    (typeof data.message_id === 'string' && data.message_id.trim()) ||
    undefined;
  if (!shouldShowMessageToast(messageId)) return;

  const senderFromData =
    (typeof data.senderName === 'string' && data.senderName.trim()) ||
    (typeof data.senderDisplayName === 'string' && data.senderDisplayName.trim()) ||
    '';
  const subtitleFromData =
    (typeof data.pushSubtitle === 'string' && data.pushSubtitle.trim()) ||
    (typeof content?.subtitle === 'string' && content.subtitle.trim()) ||
    undefined;
  const isGroup = data.isGroupChat === true || data.isGroupChat === 'true' || data.isGroupChat === 1;
  const title = (content?.title ?? '').trim();
  const body = (content?.body ?? '').trim();
  const previewFromData =
    (typeof data.messagePreview === 'string' && data.messagePreview.trim()) ||
    (typeof data.messageBody === 'string' && data.messageBody.trim()) ||
    '';

  const messageBody = body || previewFromData || i18n.t('chatPushPreviewFallback');
  const conversationId =
    (typeof data.conversationId === 'string' && data.conversationId) ||
    (typeof data.conversation_id === 'string' && data.conversation_id) ||
    undefined;
  const url = typeof data.url === 'string' ? data.url : undefined;

  if (isGroup) {
    showMessagePushToast({
      senderName: senderFromData || subtitleFromData || title,
      body: messageBody,
      subtitle: title || undefined,
      conversationId,
      url,
      isGroup: true,
    });
    return;
  }

  showMessagePushToast({
    senderName: senderFromData || title,
    body: messageBody,
    conversationId,
    url,
    isGroup: false,
  });
}

/** Push geldiğinde tab rozeti anında artsın; ardından sunucu ile eşitlenir. */
export function bumpMessagingUnreadOnPush(payload: Record<string, unknown> | undefined): void {
  if (!isMessagePushPayload(payload)) return;
  const staff = useAuthStore.getState().staff;
  if (staff) {
    useStaffUnreadMessagesStore.getState().bumpUnread(1);
    scheduleStaffMessagingUnreadRefresh(staff.id, 1_200);
    return;
  }
  useGuestMessagingStore.getState().bumpUnread(1);
  const token = useGuestMessagingStore.getState().appToken;
  if (token) scheduleGuestMessagingUnreadRefresh(token, 1_200);
}

export type MessagingUnreadScope =
  | { kind: 'staff'; staffId: string }
  | { kind: 'guest'; guestId: string };

/**
 * Katılımcı satırı değişince tab rozeti güncelle (global messages dinleyicisi yok — pil/ısı).
 */
export function subscribeMessagingUnreadLive(scope: MessagingUnreadScope, onUpdate: () => void): () => void {
  const participantId = scope.kind === 'staff' ? scope.staffId : scope.guestId;
  const debounced = () => scheduleDebounced(`messaging_unread:${participantId}`, onUpdate, 1_400);
  const channel = supabase
    .channel(`messaging_unread_${participantId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'conversation_participants',
        filter: `participant_id=eq.${participantId}`,
      },
      debounced
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversation_participants',
        filter: `participant_id=eq.${participantId}`,
      },
      debounced
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Personel sohbet listesi — yalnızca yeni sohbet katılımında hafif yenileme.
 * Önizleme güncellemesi: sekme odağı + pull-to-refresh (global messages/conversations yok).
 */
export function subscribeStaffInboxLive(staffId: string, onInboxChange: () => void): () => void {
  const notify = () => scheduleDebounced(`staff_inbox:${staffId}`, onInboxChange, 2_000);
  const channel = supabase
    .channel(`staff_inbox_${staffId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'conversation_participants',
        filter: `participant_id=eq.${staffId}`,
      },
      () => {
        invalidateParticipantConvIdsCache({ kind: 'staff', staffId });
        notify();
      }
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Sohbet listesi ekranı odaktayken yeni mesajları canlı dinler (ağ turu gerektirmez).
 * Liste önizleme/sıralama/okunmamış sayısı anında güncellenir; abonelik yalnızca ekran
 * odaktayken açık tutulduğundan pil/ısı maliyeti sınırlıdır.
 */
export function subscribeStaffInboxMessageInserts(
  staffId: string,
  onMessage: (msg: Message) => void
): () => void {
  let cancelled = false;
  let channel: ReturnType<typeof supabase.channel> | null = null;
  void (async () => {
    const ids = await fetchParticipantConversationIds({ kind: 'staff', staffId });
    if (cancelled || ids.size === 0) return;
    channel = supabase.channel(`staff_inbox_msgs_${staffId}`);
    attachScopedMessageInsertListeners(channel, ids, onMessage);
    channel.subscribe();
  })();
  return () => {
    cancelled = true;
    if (channel) void supabase.removeChannel(channel);
  };
}

/** Misafir sohbet listesi — odaktayken yeni mesajları canlı dinler (ağ turu yok). */
export function subscribeGuestInboxMessageInserts(
  guestId: string,
  onMessage: (msg: Message) => void
): () => void {
  let cancelled = false;
  let channel: ReturnType<typeof supabase.channel> | null = null;
  void (async () => {
    const ids = await fetchParticipantConversationIds({ kind: 'guest', guestId });
    if (cancelled || ids.size === 0) return;
    channel = supabase.channel(`guest_inbox_msgs_${guestId}`);
    attachScopedMessageInsertListeners(channel, ids, onMessage);
    channel.subscribe();
  })();
  return () => {
    cancelled = true;
    if (channel) void supabase.removeChannel(channel);
  };
}

/** Misafir sohbet listesi — yalnızca yeni katılım; liste odağında yenilenir. */
export function subscribeGuestInboxLive(guestId: string, onInboxChange: () => void): () => void {
  const notify = () => scheduleDebounced(`guest_inbox:${guestId}`, onInboxChange, 2_000);
  const channel = supabase
    .channel(`guest_inbox_${guestId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'conversation_participants',
        filter: `participant_id=eq.${guestId}`,
      },
      () => {
        invalidateParticipantConvIdsCache({ kind: 'guest', guestId });
        notify();
      }
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Personel: tam liste yenileme (sohbet listesi ekranı). */
export async function refreshStaffMessagingUnreadFull(staffId: string): Promise<number> {
  const total = await fetchStaffMessagingUnreadCount(staffId);
  useStaffUnreadMessagesStore.getState().setUnreadCount(total);
  return total;
}

const convMetaCache = new Map<string, { isGroup: boolean; name: string }>();
const participantConvIdsCache = new Map<string, { ids: Set<string>; at: number }>();
const PARTICIPANT_CONV_IDS_TTL_MS = 120_000;
const MAX_REALTIME_IN_FILTER = 40;

async function fetchParticipantConversationIds(
  scope: LiveMessagePushScope | MessagingUnreadScope
): Promise<Set<string>> {
  const cacheKey = scope.kind === 'staff' ? `staff:${scope.staffId}` : `guest:${scope.guestId}`;
  const hit = participantConvIdsCache.get(cacheKey);
  if (hit && Date.now() - hit.at < PARTICIPANT_CONV_IDS_TTL_MS) return hit.ids;

  const participantId = scope.kind === 'staff' ? scope.staffId : scope.guestId;
  const participantTypes =
    scope.kind === 'staff' ? (['staff', 'admin'] as const) : (['guest'] as const);

  let query = supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('participant_id', participantId)
    .is('left_at', null);
  query =
    scope.kind === 'staff'
      ? query.in('participant_type', [...participantTypes])
      : query.eq('participant_type', 'guest');

  const { data } = await query;
  const ids = new Set((data ?? []).map((r: { conversation_id: string }) => r.conversation_id));
  participantConvIdsCache.set(cacheKey, { ids, at: Date.now() });
  return ids;
}

function invalidateParticipantConvIdsCache(scope: MessagingUnreadScope | LiveMessagePushScope): void {
  const cacheKey = scope.kind === 'staff' ? `staff:${scope.staffId}` : `guest:${scope.guestId}`;
  participantConvIdsCache.delete(cacheKey);
}

function attachScopedMessageInsertListeners(
  channel: ReturnType<typeof supabase.channel>,
  convIds: Set<string>,
  onInsert: (msg: Message) => void
): void {
  const ids = [...convIds];
  if (ids.length === 0) return;
  for (let i = 0; i < ids.length; i += MAX_REALTIME_IN_FILTER) {
    const chunk = ids.slice(i, i + MAX_REALTIME_IN_FILTER);
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=in.(${chunk.join(',')})`,
      },
      (payload) => {
        onInsert(payload.new as Message);
      }
    );
  }
}

async function loadConversationMeta(conversationId: string): Promise<{ isGroup: boolean; name: string }> {
  const cached = convMetaCache.get(conversationId);
  if (cached) return cached;
  const { data } = await supabase
    .from('conversations')
    .select('name, type')
    .eq('id', conversationId)
    .maybeSingle();
  const row = data as { name?: string | null; type?: string | null } | null;
  const meta = {
    isGroup: row?.type === 'group' || row?.type === 'department',
    name: (row?.name ?? '').trim(),
  };
  convMetaCache.set(conversationId, meta);
  return meta;
}

function parseOpenChatConversationId(pathname: string): string | null {
  const m = pathname.match(/\/chat\/([^/?#]+)/);
  const id = m?.[1]?.trim();
  return id && id !== 'new' ? id : null;
}

function isOwnMessage(
  msg: Message,
  viewerId: string,
  viewerType: ParticipantType
): boolean {
  return msg.sender_id === viewerId && msg.sender_type === viewerType;
}

export function showMessagePushToastFromRow(
  msg: Message,
  opts: {
    viewerId: string;
    viewerType: ParticipantType;
    buildChatUrl: (conversationId: string) => string;
    isGroup?: boolean;
    groupName?: string;
  }
): void {
  if (msg.is_deleted) return;
  if (isOwnMessage(msg, opts.viewerId, opts.viewerType)) return;
  if (!shouldShowMessageToast(msg.id)) return;
  if (AppState.currentState !== 'active') return;

  const senderName = (msg.sender_name ?? '').trim() || i18n.t('guestDefaultName');
  const body = formatReplyMessagePreview(msg.message_type, msg.content);

  showMessagePushToast({
    senderName,
    body,
    subtitle: opts.isGroup ? opts.groupName : undefined,
    conversationId: msg.conversation_id,
    url: opts.buildChatUrl(msg.conversation_id),
    isGroup: opts.isGroup,
    avatarUri: msg.sender_avatar ?? undefined,
  });

  bumpMessagingUnreadOnPush({
    conversationId: msg.conversation_id,
    screen: 'messages',
    notificationType: 'chat_message',
    messageId: msg.id,
  });

  const staff = useAuthStore.getState().staff;
  void playForegroundNotificationSound(
    { notificationType: 'chat_message', conversationId: msg.conversation_id },
    staff?.organization_id
  );
}

export type LiveMessagePushScope =
  | {
      kind: 'staff';
      staffId: string;
      buildChatUrl: (conversationId: string) => string;
    }
  | {
      kind: 'guest';
      guestId: string;
      buildChatUrl: (conversationId: string) => string;
    };

/**
 * Uygulama öndeyken yeni mesajları Supabase realtime ile dinler;
 * gönderen adı + içerik canlı toast olarak gösterilir (push ile çift gösterim dedup).
 */
export function subscribeLiveMessagePushToasts(
  scope: LiveMessagePushScope,
  options?: { getPathname?: () => string }
): () => void {
  const viewerId = scope.kind === 'staff' ? scope.staffId : scope.guestId;
  const viewerType: ParticipantType = scope.kind === 'staff' ? 'staff' : 'guest';
  const buildChatUrl = scope.buildChatUrl;
  let cancelled = false;
  let convIds = new Set<string>();
  let messagesChannel: ReturnType<typeof supabase.channel> | null = null;
  let bindGeneration = 0;

  const handleInsert = (msg: Message) => {
    if (AppState.currentState !== 'active') return;
    if (!msg?.id || !msg.conversation_id) return;
    if (!convIds.has(msg.conversation_id)) return;
    if (isOwnMessage(msg, viewerId, viewerType)) return;

    const openConv = parseOpenChatConversationId(options?.getPathname?.() ?? '');
    if (openConv && openConv === msg.conversation_id) return;

    void (async () => {
      const meta = await loadConversationMeta(msg.conversation_id);
      if (cancelled) return;
      showMessagePushToastFromRow(msg, {
        viewerId,
        viewerType,
        buildChatUrl,
        isGroup: meta.isGroup,
        groupName: meta.name || undefined,
      });
    })();
  };

  const teardownMessagesChannel = () => {
    if (messagesChannel) {
      void supabase.removeChannel(messagesChannel);
      messagesChannel = null;
    }
  };

  const bindMessagesChannel = async () => {
    const generation = ++bindGeneration;
    convIds = await fetchParticipantConversationIds(scope);
    if (cancelled || generation !== bindGeneration) return;

    teardownMessagesChannel();
    if (convIds.size === 0) return;

    messagesChannel = supabase.channel(`live_msg_push_${viewerType}_${viewerId}`);
    attachScopedMessageInsertListeners(messagesChannel, convIds, handleInsert);
    messagesChannel.subscribe();
  };

  const scheduleRebind = () =>
    scheduleDebounced(`live_msg_rebind:${viewerType}:${viewerId}`, () => {
      void bindMessagesChannel();
    }, 3_000);

  const participantChannel = supabase
    .channel(`live_msg_part_${viewerType}_${viewerId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'conversation_participants',
        filter: `participant_id=eq.${viewerId}`,
      },
      (payload) => {
        const row = payload.new as { conversation_id?: string };
        if (row.conversation_id) convIds.add(row.conversation_id);
        invalidateParticipantConvIdsCache(scope);
        scheduleRebind();
      }
    )
    .subscribe();

  void bindMessagesChannel();

  return () => {
    cancelled = true;
    teardownMessagesChannel();
    void supabase.removeChannel(participantChannel);
  };
}
