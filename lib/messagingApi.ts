/**
 * Valoria Hotel - Mesajlaşma API (Staff = Supabase client, Guest = RPC + app_token)
 */
import { encode as encodeBase64 } from 'base64-arraybuffer';
import { supabase, supabaseMessaging, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { uriToArrayBuffer, readVoiceRecordingBuffer, getMimeAndExt } from '@/lib/uploadMedia';
import { uploadBufferToPublicBucket } from '@/lib/storagePublicUpload';
import type { MessagingActor, Message, Conversation, ConversationWithMeta } from '@/lib/messaging';
import { isSupabaseUnavailableError, isTransientSupabaseDbError, sleepMs } from '@/lib/supabaseTransientErrors';
import { syncGuestMessagingAppToken } from '@/lib/getOrCreateGuestForCaller';
import { useGuestMessagingStore } from '@/stores/guestMessagingStore';

const GUEST_MESSAGING_SESSION_HINT =
  'Oturum doğrulanamadı. Çıkış yapıp yeniden giriş yapın; sorun sürerse uygulamayı yeniden başlatın.';

const PARTNER_MESSAGING_SESSION_HINT =
  'Partner oturumu doğrulanamadı. Çıkış yapıp yeniden giriş yapın.';

/** Sohbet gönderimi catch — RN ağ hatalarında kullanıcıya anlaşılır metin. */
export function formatChatMessageSendError(e: unknown, fallback: string): string {
  const row = e && typeof e === 'object' ? (e as { message?: string; code?: string }) : null;
  const code = row?.code ?? '';
  const msg =
    row?.message?.trim() ||
    (e instanceof Error ? e.message : typeof e === 'string' ? e : fallback);
  if (code === 'PGRST203' || msg.includes('Could not choose the best candidate')) {
    return 'Mesaj servisi geçici olarak yanıt vermiyor. Lütfen birkaç saniye sonra tekrar deneyin.';
  }
  if (
    code === 'SUPABASE_UNAVAILABLE' ||
    code === 'PGRST002' ||
    isSupabaseUnavailableError(msg)
  ) {
    return 'Sunucuya bağlanılamıyor. İnternet bağlantınızı kontrol edip tekrar deneyin.';
  }
  if (code === 'PGRST301' || /jwt|session|not authenticated/i.test(msg)) {
    return GUEST_MESSAGING_SESSION_HINT;
  }
  return msg.trim() || fallback;
}

/** Misafir RPC: sunucudaki app_token (anon JWT ile de çalışır). */
async function guestMessagingTokensToTry(appToken: string): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (t: string | null | undefined) => {
    const key = (t ?? '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };
  add(await syncGuestMessagingAppToken());
  add(useGuestMessagingStore.getState().appToken);
  add(appToken);
  return out;
}

async function invokeGuestSendMessageRpc(
  token: string,
  body: Record<string, unknown>
): Promise<{ data: unknown; error: { message?: string; code?: string } | null }> {
  const params = { ...body, p_app_token: token };
  let { data, error } = await supabaseMessaging.rpc('guest_send_chat_message', params);
  if (
    error &&
    (error.code === 'PGRST202' ||
      error.message?.includes('guest_send_chat_message') ||
      error.message?.includes('Could not find'))
  ) {
    ({ data, error } = await supabaseMessaging.rpc('messaging_send_message_guest', params));
  }
  return { data, error };
}

async function invokeGuestGetOrCreateStaffRpc(
  token: string,
  staffId: string
): Promise<{ data: unknown; error: { message?: string; code?: string } | null }> {
  const { data, error } = await supabaseMessaging.rpc('messaging_guest_get_or_create_with_staff', {
    p_app_token: token,
    p_staff_id: staffId,
  });
  return { data, error };
}

// ----- Staff (authenticated) -----

/**
 * Performans önbellekleri — her mesaj çekiminde tekrarlanan seri sorguları azaltır.
 * - staff.created_at değişmez → kalıcı önbellek (tur başına 1 sorgu eksilir).
 * - "benden silinen" mesaj kimlikleri → kısa TTL'li önbellek (gizleme anında geçersiz kılınır).
 */
const staffCreatedAtCache = new Map<string, string>();
const staffHiddenIdsCache = new Map<string, { ids: Set<string>; at: number }>();
const STAFF_HIDDEN_IDS_TTL_MS = 20_000;

async function getStaffCreatedAtCached(staffId: string): Promise<string | null> {
  const hit = staffCreatedAtCache.get(staffId);
  if (hit !== undefined) return hit;
  const { data: staffRow } = await supabase
    .from('staff')
    .select('created_at')
    .eq('id', staffId)
    .single();
  const created = (staffRow as { created_at: string } | null)?.created_at ?? null;
  if (created) staffCreatedAtCache.set(staffId, created);
  return created;
}

async function getStaffHiddenMessageIdsCached(staffId: string): Promise<Set<string>> {
  const hit = staffHiddenIdsCache.get(staffId);
  if (hit && Date.now() - hit.at < STAFF_HIDDEN_IDS_TTL_MS) return hit.ids;
  const { data: hidden } = await supabase
    .from('message_hidden_for_user')
    .select('message_id')
    .eq('user_id', staffId)
    .eq('user_type', 'staff');
  const ids = new Set((hidden ?? []).map((h) => (h as { message_id: string }).message_id));
  staffHiddenIdsCache.set(staffId, { ids, at: Date.now() });
  return ids;
}

function invalidateStaffHiddenIdsCache(staffId?: string): void {
  if (staffId) staffHiddenIdsCache.delete(staffId);
  else staffHiddenIdsCache.clear();
}

/**
 * Personel/admin sohbet listesi.
 * Önce tek-tur sunucu RPC'si (499) denenir; yoksa/başarısızsa istemci taraflı
 * (çok sorgulu) yedek uygulamaya düşülür — böylece migration deploy edilmeden de çalışır.
 */
export async function staffListConversations(staffId: string): Promise<ConversationWithMeta[]> {
  try {
    const { data, error } = await supabase.rpc('messaging_list_conversations_staff', {
      p_staff_id: staffId,
    });
    if (!error && Array.isArray(data)) {
      return (data as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        type: r.type as ConversationWithMeta['type'],
        name: (r.name as string) ?? null,
        avatar: (r.avatar as string | null) ?? null,
        group_theme_color: (r.group_theme_color as string | null) ?? null,
        created_by: (r.created_by as string | null) ?? null,
        created_by_type: (r.created_by_type as ConversationWithMeta['created_by_type']) ?? null,
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
        last_message_id: (r.last_message_id as string | null) ?? null,
        last_message_at: (r.last_message_at as string | null) ?? null,
        closed_at: (r.closed_at as string | null) ?? null,
        last_message_preview: (r.last_message_preview as string | null) ?? null,
        unread_count: Number(r.unread_count ?? 0),
        is_pinned: Boolean(r.is_pinned),
        is_muted: Boolean(r.is_muted),
        is_archived: Boolean(r.is_archived),
        other_avatar: (r.other_avatar as string | null) ?? null,
        other_participant:
          (r.other_participant as ConversationWithMeta['other_participant']) ?? undefined,
      }));
    }
  } catch {
    // RPC mevcut değil veya geçici hata → istemci yedeğine düş
  }
  return staffListConversationsClientFallback(staffId);
}

async function staffListConversationsClientFallback(staffId: string): Promise<ConversationWithMeta[]> {
  const staffCreatedAt = (await getStaffCreatedAtCached(staffId)) ?? '1970-01-01';

  const { data: participants, error: epErr } = await supabase
    .from('conversation_participants')
    .select('conversation_id, last_read_at, is_pinned, is_muted, is_archived')
    .eq('participant_id', staffId)
    .in('participant_type', ['staff', 'admin'])
    .is('left_at', null);

  if (epErr || !participants?.length) return [];

  const convIds = participants.map((p: { conversation_id: string }) => p.conversation_id);
  const { data: convsData, error: convErr } = await supabase
    .from('conversations')
    .select('id, type, name, avatar, group_theme_color, created_by, created_by_type, created_at, updated_at, last_message_id, last_message_at, closed_at')
    .in('id', convIds);

  if (convErr || !convsData?.length) return [];

  const convs = convsData as Conversation[];
  const lastMsgIds = convs.map((c) => c.last_message_id).filter(Boolean) as string[];

  let lastMessages: { id: string; content: string | null; created_at: string }[] = [];
  if (lastMsgIds.length) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('id, content, created_at')
      .in('id', lastMsgIds);
    lastMessages = (msgs ?? []) as { id: string; content: string | null; created_at: string }[];
  }

  // Direct sohbetlerde karşı tarafın adı (tek sorgu)
  const { data: allOthers } = await supabase
    .from('conversation_participants')
    .select('conversation_id, participant_id, participant_type')
    .in('conversation_id', convIds)
    .neq('participant_id', staffId)
    .is('left_at', null);
  const otherByConv = new Map<string, { id: string; type: string }>();
  for (const o of allOthers ?? []) {
    const row = o as { conversation_id: string; participant_id: string; participant_type: string };
    if (!otherByConv.has(row.conversation_id)) otherByConv.set(row.conversation_id, { id: row.participant_id, type: row.participant_type });
  }
  const guestIds = [...otherByConv.values()].filter((o) => o.type === 'guest').map((o) => o.id);
  const partnerIds = [...otherByConv.values()].filter((o) => o.type === 'partner').map((o) => o.id);
  const staffIds = [...otherByConv.values()].filter((o) => o.type === 'staff' || o.type === 'admin').map((o) => o.id);

  // Okunmamış sorgusunu tüm geçmişi indirmeyecek şekilde alt sınırla:
  // sohbet başına okunma kesimi = (last_read_at ?? hesap oluşturma), tabanı staffCreatedAt.
  const staffCreatedMs = new Date(staffCreatedAt).getTime();
  let unreadLowerBoundMs = Number.POSITIVE_INFINITY;
  for (const p of participants ?? []) {
    const row = p as { last_read_at: string | null };
    const cutoff = row.last_read_at ? Math.max(new Date(row.last_read_at).getTime(), staffCreatedMs) : staffCreatedMs;
    if (cutoff < unreadLowerBoundMs) unreadLowerBoundMs = cutoff;
  }
  if (!Number.isFinite(unreadLowerBoundMs)) unreadLowerBoundMs = staffCreatedMs;
  const unreadLowerBoundIso = new Date(unreadLowerBoundMs).toISOString();

  // Bağımsız aramaları paralel çalıştır (sıralı tur sayısını azaltır).
  const [guestRes, partnerRes, staffRes, recentRes] = await Promise.all([
    guestIds.length
      ? supabase.from('guests').select('id, full_name, photo_url, deleted_at').in('id', guestIds)
      : Promise.resolve({ data: [] as unknown[] }),
    partnerIds.length
      ? supabase
          .from('breakfast_partner_users')
          .select('id, full_name, is_active, breakfast_partner_hotels(name, status)')
          .in('id', partnerIds)
      : Promise.resolve({ data: [] as unknown[] }),
    staffIds.length
      ? supabase.from('staff').select('id, full_name, profile_image, deleted_at, is_online').in('id', staffIds)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase
      .from('messages')
      .select('id, conversation_id, created_at, sender_id, sender_type')
      .in('conversation_id', convIds)
      .eq('is_deleted', false)
      .gte('created_at', unreadLowerBoundIso),
  ]);
  const guestNames = guestRes.data;
  const partnerRows = partnerRes.data;
  const staffRows = staffRes.data;
  const recentMsgs = recentRes.data;
  const deletedGuestIds = new Set<string>();
  const deletedStaffIds = new Set<string>();
  const nameById = new Map<string, string>();
  const staffAvatarById = new Map<string, string | null>();
  const staffOnlineById = new Map<string, boolean>();
  const guestAvatarById = new Map<string, string | null>();
  for (const g of guestNames ?? []) {
    const row = g as { id: string; full_name: string; photo_url?: string | null; deleted_at?: string | null };
    if (row.deleted_at) {
      deletedGuestIds.add(row.id);
      continue;
    }
    nameById.set(row.id, row.full_name || 'Misafir');
    guestAvatarById.set(row.id, row.photo_url ?? null);
  }
  for (const s of staffRows ?? []) {
    const row = s as { id: string; full_name: string; profile_image: string | null; deleted_at?: string | null; is_online?: boolean | null };
    if (row.deleted_at) {
      deletedStaffIds.add(row.id);
      continue;
    }
    nameById.set(row.id, row.full_name || 'Personel');
    staffAvatarById.set(row.id, row.profile_image ?? null);
    staffOnlineById.set(row.id, Boolean(row.is_online));
  }
  for (const p of partnerRows ?? []) {
    const row = p as {
      id: string;
      full_name: string | null;
      is_active?: boolean | null;
      breakfast_partner_hotels?: { name?: string | null; status?: string | null } | { name?: string | null; status?: string | null }[] | null;
    };
    const hotel = Array.isArray(row.breakfast_partner_hotels)
      ? row.breakfast_partner_hotels[0]
      : row.breakfast_partner_hotels;
    if (!row.is_active || hotel?.status !== 'active') continue;
    const label = [row.full_name?.trim() || 'Partner', hotel?.name?.trim()].filter(Boolean).join(' · ');
    nameById.set(row.id, label || 'Partner');
  }

  // Okunmamış sayısı: kullanıcının göndermediği, last_read_at sonrası mesajlar
  const partByConv = new Map<string | undefined, { last_read_at: string | null }>();
  for (const p of participants ?? []) {
    const row = p as { conversation_id: string; last_read_at: string | null };
    partByConv.set(row.conversation_id, { last_read_at: row.last_read_at });
  }
  const unreadByConv = new Map<string, number>();
  for (const m of recentMsgs ?? []) {
    const row = m as { conversation_id: string; created_at: string; sender_id: string; sender_type: string };
    if (new Date(row.created_at) < new Date(staffCreatedAt)) continue;
    if (row.sender_id === staffId && (row.sender_type === 'staff' || row.sender_type === 'admin')) continue;
    const part = partByConv.get(row.conversation_id);
    const lastRead = part?.last_read_at ?? null;
    if (lastRead && new Date(row.created_at) <= new Date(lastRead)) continue;
    unreadByConv.set(row.conversation_id, (unreadByConv.get(row.conversation_id) ?? 0) + 1);
  }

  const list: ConversationWithMeta[] = convs
    .filter((c) => {
      const partRow = participants.find((p: { conversation_id: string }) => p.conversation_id === c.id) as
        | { is_archived?: boolean }
        | undefined;
      if (partRow?.is_archived) return false;
      const other = otherByConv.get(c.id);
      if (!other) return true;
      if (other.type === 'guest' && deletedGuestIds.has(other.id)) return false;
      if ((other.type === 'staff' || other.type === 'admin') && deletedStaffIds.has(other.id)) return false;
      return true;
    })
    .map((c) => {
    const lastMsg = lastMessages.find((m) => m.id === c.last_message_id);
    const preview =
      lastMsg && new Date(lastMsg.created_at) >= new Date(staffCreatedAt) ? lastMsg.content ?? null : null;
    const part = participants.find((p: { conversation_id: string }) => p.conversation_id === c.id) as {
      last_read_at: string | null;
      is_pinned: boolean;
      is_muted: boolean;
      is_archived?: boolean;
    } | undefined;
    const other = otherByConv.get(c.id);
    const displayName = c.name || (other ? nameById.get(other.id) || 'Sohbet' : 'Sohbet');
    const otherAvatar = other
      ? (other.type === 'staff' || other.type === 'admin')
        ? staffAvatarById.get(other.id) ?? null
        : guestAvatarById.get(other.id) ?? null
      : null;
    return {
      ...c,
      name: displayName,
      last_message_preview: preview,
      unread_count: unreadByConv.get(c.id) ?? 0,
      is_pinned: part?.is_pinned ?? false,
      is_muted: part?.is_muted ?? false,
      is_archived: part?.is_archived ?? false,
      other_avatar: c.type === 'direct' ? otherAvatar ?? null : undefined,
      other_participant:
        c.type === 'direct' && other
          ? {
              id: other.id,
              type: other.type as 'guest' | 'staff' | 'admin' | 'partner',
              name: nameById.get(other.id) || displayName,
              avatar: otherAvatar ?? null,
              is_online:
                other.type === 'staff' || other.type === 'admin'
                  ? staffOnlineById.get(other.id) ?? false
                  : undefined,
            }
          : undefined,
    };
  });
  list.sort((a, b) => (new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime()));
  return list;
}

export type StaffGetMessagesOpts = {
  /** Sunucuda bundan sonra oluşan mesajlar (önbellekten girişte tam listeyi yeniden çekmemek için). */
  afterCreatedAt?: string;
};

export async function staffGetMessages(
  conversationId: string,
  limit = 50,
  beforeId?: string,
  staffId?: string,
  opts?: StaffGetMessagesOpts
): Promise<Message[]> {
  // staff.created_at değişmez → önbellekten; "benden silinen" kimlikleri kısa TTL'li önbellekten.
  // İkisi de mesaj sorgusundan bağımsız olduğundan paralel çalıştırılır (seri tur sayısı azalır).
  const staffCreatedAtP = staffId ? getStaffCreatedAtCached(staffId) : Promise.resolve(null);
  const hiddenIdsP = staffId ? getStaffHiddenMessageIdsCached(staffId) : Promise.resolve(new Set<string>());

  // beforeId varsa imleç (created_at) için tek küçük sorgu gerekir; o da paralel.
  const beforeP = beforeId
    ? supabase.from('messages').select('created_at').eq('id', beforeId).single()
    : Promise.resolve({ data: null } as { data: { created_at?: string } | null });

  const [staffCreatedAt, hiddenIds, before] = await Promise.all([
    staffCreatedAtP,
    hiddenIdsP,
    beforeP,
  ]);
  const filterFrom = staffCreatedAt ?? '1970-01-01';

  let q = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .gte('created_at', filterFrom)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (beforeId) {
    const beforeCreatedAt = (before.data as { created_at?: string } | null)?.created_at;
    if (beforeCreatedAt) q = q.lt('created_at', beforeCreatedAt);
  } else if (opts?.afterCreatedAt?.trim()) {
    q = q.gt('created_at', opts.afterCreatedAt.trim());
  }
  const { data, error } = await q;
  if (error) return [];
  let rows = (data ?? []).reverse() as Message[];
  if (hiddenIds.size) rows = rows.filter((m) => !hiddenIds.has(m.id));
  return rows;
}

export async function resolveStaffConversationIdForSend(
  conversationId: string,
  staffId: string
): Promise<string> {
  return resolveStaffConversationForSend(conversationId, staffId);
}

export async function resolveGuestConversationIdForSend(
  appToken: string,
  conversationId: string
): Promise<string> {
  return (await resolveGuestConversationForSend(appToken, conversationId)) ?? conversationId;
}

async function staffInsertMessage(
  resolvedConversationId: string,
  staffId: string,
  staffName: string,
  staffAvatar: string | null,
  content: string,
  messageType: 'text' | 'image' | 'file' | 'voice' | 'video',
  mediaUrl?: string,
  mediaThumbnail?: string | null,
  mentions?: import('@/lib/messaging').ChatMention[] | null,
  replyToId?: string | null
): Promise<{ data: Message | null; error: string | null }> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: resolvedConversationId,
      sender_id: staffId,
      sender_type: 'staff',
      sender_name: staffName,
      sender_avatar: staffAvatar,
      message_type: messageType,
      content: content || null,
      media_url: mediaUrl || null,
      media_thumbnail: mediaThumbnail?.trim() ? mediaThumbnail.trim() : null,
      mentions: mentions?.length ? mentions : [],
      reply_to_id: replyToId?.trim() ? replyToId.trim() : null,
    })
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  void supabase
    .from('conversations')
    .update({ last_message_id: data.id, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', resolvedConversationId)
    .then(() => {})
    .catch(() => {});
  return { data: data as Message, error: null };
}

export async function staffSendMessage(
  conversationId: string,
  staffId: string,
  staffName: string,
  staffAvatar: string | null,
  content: string,
  messageType: 'text' | 'image' | 'file' | 'voice' | 'video' = 'text',
  mediaUrl?: string,
  mediaThumbnail?: string | null,
  resolvedConversationId?: string,
  mentions?: import('@/lib/messaging').ChatMention[] | null,
  replyToId?: string | null
): Promise<{ data: Message | null; error: string | null; conversationId: string }> {
  const convId =
    resolvedConversationId ?? (await resolveStaffConversationForSend(conversationId, staffId));
  const { data, error } = await staffInsertMessage(
    convId,
    staffId,
    staffName,
    staffAvatar,
    content,
    messageType,
    mediaUrl,
    mediaThumbnail,
    mentions,
    replyToId
  );
  return { data, error, conversationId: convId };
}

export async function staffListMentionParticipants(
  conversationId: string
): Promise<import('@/lib/chatMentions').ChatMentionParticipant[]> {
  const { data, error } = await supabase.rpc('messaging_list_mention_participants_staff', {
    p_conversation_id: conversationId,
  });
  if (error || !data) return [];
  return (data as import('@/lib/chatMentions').ChatMentionParticipant[]).map((row) => ({
    participant_id: row.participant_id,
    participant_type: row.participant_type as import('@/lib/messaging').ParticipantType,
    display_name: row.display_name,
    avatar: row.avatar ?? null,
  }));
}

export async function guestListMentionParticipants(
  appToken: string,
  conversationId: string
): Promise<import('@/lib/chatMentions').ChatMentionParticipant[]> {
  const { data, error } = await supabase.rpc('messaging_list_mention_participants_guest', {
    p_app_token: appToken,
    p_conversation_id: conversationId,
  });
  if (error || !data) return [];
  return (data as import('@/lib/chatMentions').ChatMentionParticipant[]).map((row) => ({
    participant_id: row.participant_id,
    participant_type: row.participant_type as import('@/lib/messaging').ParticipantType,
    display_name: row.display_name,
    avatar: row.avatar ?? null,
  }));
}

export async function patchChatMessageThumbnail(messageId: string, thumbnailUrl: string): Promise<void> {
  const url = thumbnailUrl.trim();
  if (!url) return;
  await supabase.from('messages').update({ media_thumbnail: url }).eq('id', messageId);
}

const staffDirectConversationResolveCache = new Map<string, string>();

async function resolveStaffConversationForSend(conversationId: string, staffId: string): Promise<string> {
  const cacheKey = `${staffId}:${conversationId}`;
  const cached = staffDirectConversationResolveCache.get(cacheKey);
  if (cached) return cached;

  const { data: conv } = await supabase
    .from('conversations')
    .select('type')
    .eq('id', conversationId)
    .maybeSingle();
  if ((conv as { type?: string } | null)?.type !== 'direct') {
    staffDirectConversationResolveCache.set(cacheKey, conversationId);
    return conversationId;
  }

  const { data: other } = await supabase
    .from('conversation_participants')
    .select('participant_id, participant_type')
    .eq('conversation_id', conversationId)
    .neq('participant_id', staffId)
    .limit(1)
    .maybeSingle();
  const otherRow = other as { participant_id: string; participant_type: 'guest' | 'staff' | 'admin' } | null;
  if (!otherRow?.participant_id || !otherRow?.participant_type) {
    staffDirectConversationResolveCache.set(cacheKey, conversationId);
    return conversationId;
  }

  const nextConversationId = await staffGetOrCreateDirectConversation(staffId, otherRow.participant_id, otherRow.participant_type);
  const resolved = nextConversationId ?? conversationId;
  staffDirectConversationResolveCache.set(cacheKey, resolved);
  if (resolved !== conversationId) {
    staffDirectConversationResolveCache.set(`${staffId}:${resolved}`, resolved);
  }
  return resolved;
}

async function staffParticipantTypeForId(staffRowId: string): Promise<'staff' | 'admin'> {
  const { data } = await supabase.from('staff').select('role').eq('id', staffRowId).maybeSingle();
  return (data as { role?: string } | null)?.role === 'admin' ? 'admin' : 'staff';
}

async function staffGetOrCreateDirectConversationFallback(
  staffId: string,
  otherId: string,
  otherType: 'guest' | 'staff' | 'admin' | 'partner'
): Promise<string | null> {
  const actorType = await staffParticipantTypeForId(staffId);
  const staffTypes = ['staff', 'admin'] as const;
  const otherTypes: ('guest' | 'staff' | 'admin' | 'partner')[] =
    otherType === 'guest' ? ['guest'] : otherType === 'partner' ? ['partner'] : ['staff', 'admin'];

  const { data: myRows, error: myErr } = await supabase
    .from('conversation_participants')
    .select('conversation_id, conversations!inner(type)')
    .eq('participant_id', staffId)
    .in('participant_type', [...staffTypes]);

  if (myErr) {
    log.warn('messagingApi', 'staffGetOrCreateDirect fallback list', myErr.message);
    return null;
  }

  const directConvIds = (myRows ?? [])
    .filter((row) => (row.conversations as { type?: string } | null)?.type === 'direct')
    .map((row) => row.conversation_id as string);

  if (directConvIds.length > 0) {
    const { data: otherRows, error: otherErr } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .in('conversation_id', directConvIds)
      .eq('participant_id', otherId)
      .in('participant_type', otherTypes)
      .limit(1);

    if (otherErr) {
      log.warn('messagingApi', 'staffGetOrCreateDirect fallback match', otherErr.message);
    } else if (otherRows?.[0]?.conversation_id) {
      const convId = otherRows[0].conversation_id as string;
      await supabase
        .from('conversation_participants')
        .update({ left_at: null })
        .eq('conversation_id', convId)
        .eq('participant_id', staffId)
        .in('participant_type', [...staffTypes]);
      return convId;
    }
  }

  const otherParticipantType: 'guest' | 'staff' | 'admin' =
    otherType === 'guest' ? 'guest' : await staffParticipantTypeForId(otherId);

  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .insert({
      type: 'direct',
      created_by: staffId,
      created_by_type: actorType,
    })
    .select('id')
    .single();

  if (convErr || !conv?.id) {
    log.warn('messagingApi', 'staffGetOrCreateDirect fallback create', convErr?.message);
    return null;
  }

  const convId = (conv as { id: string }).id;
  const { error: selfErr } = await supabase.from('conversation_participants').insert({
    conversation_id: convId,
    participant_id: staffId,
    participant_type: actorType,
  });
  if (selfErr) {
    log.warn('messagingApi', 'staffGetOrCreateDirect fallback self', selfErr.message);
    return null;
  }

  const { error: otherInsertErr } = await supabase.from('conversation_participants').insert({
    conversation_id: convId,
    participant_id: otherId,
    participant_type: otherParticipantType,
  });
  if (otherInsertErr) {
    log.warn('messagingApi', 'staffGetOrCreateDirect fallback other', otherInsertErr.message);
    return null;
  }

  return convId;
}

export async function staffGetOrCreateDirectConversation(
  staffId: string,
  otherId: string,
  otherType: 'guest' | 'staff' | 'admin' | 'partner'
): Promise<string | null> {
  const { data, error } = await supabase.rpc('messaging_staff_get_or_create_direct', {
    p_other_id: otherId,
    p_other_type: otherType,
  });
  if (!error && data != null) return data as string;

  if (error) {
    log.warn('messagingApi', 'messaging_staff_get_or_create_direct', error.message, error.code);
    const legacy = await supabase.rpc('messaging_get_or_create_direct', {
      p_actor_id: staffId,
      p_actor_type: 'staff',
      p_other_id: otherId,
      p_other_type: otherType,
    });
    if (!legacy.error && legacy.data != null) return legacy.data as string;
    if (legacy.error) {
      log.warn('messagingApi', 'messaging_get_or_create_direct legacy', legacy.error.message, legacy.error.code);
    }
  }

  return staffGetOrCreateDirectConversationFallback(staffId, otherId, otherType);
}

/** Personel/admin için grup sohbeti oluşturur. */
export async function staffCreateGroupConversation(params: {
  creatorStaffId: string;
  creatorType?: 'staff' | 'admin';
  groupName: string;
  memberStaffIds: string[];
}): Promise<{ conversationId: string | null; error: string | null }> {
  const { creatorStaffId, creatorType = 'staff', groupName, memberStaffIds } = params;
  const trimmed = groupName.trim();
  if (!creatorStaffId || !trimmed) return { conversationId: null, error: 'Eksik grup bilgisi.' };

  const uniqueMembers = [...new Set(memberStaffIds.filter(Boolean))].filter((id) => id !== creatorStaffId);

  const { data: conversation, error: convErr } = await supabase
    .from('conversations')
    .insert({
      type: 'group',
      name: trimmed,
      created_by: creatorStaffId,
      created_by_type: creatorType,
    })
    .select('id')
    .single();
  if (convErr || !conversation?.id) return { conversationId: null, error: convErr?.message ?? 'Grup oluşturulamadı.' };

  const conversationId = (conversation as { id: string }).id;

  // Önce oluşturan kişiyi ekle (RLS için güvenli yol).
  const { error: selfErr } = await supabase.from('conversation_participants').insert({
    conversation_id: conversationId,
    participant_id: creatorStaffId,
    participant_type: creatorType,
    role: 'admin',
  });
  if (selfErr) return { conversationId: null, error: selfErr.message };

  if (uniqueMembers.length > 0) {
    const rows = uniqueMembers.map((id) => ({
      conversation_id: conversationId,
      participant_id: id,
      participant_type: 'staff' as const,
      role: 'member' as const,
    }));
    const { error: membersErr } = await supabase.from('conversation_participants').insert(rows);
    if (membersErr) return { conversationId: null, error: membersErr.message };
  }

  return { conversationId, error: null };
}

export type GroupMemberRow = {
  participant_id: string;
  participant_type: string;
  role: string;
  display_name: string;
  avatar: string | null;
  department: string | null;
};

function formatGroupMemberRpcError(error: { message?: string } | null | undefined, fallback: string): string {
  const msg = (error?.message ?? '').toLowerCase();
  if (msg.includes('admin_required')) return 'group_members_admin_required';
  if (msg.includes('all_staff_group_locked')) return 'group_members_all_staff_locked';
  if (msg.includes('not_a_group')) return 'group_members_not_a_group';
  if (msg.includes('cannot_remove_self')) return 'group_members_cannot_remove_self';
  if (msg.includes('already_closed') || msg.includes('group_closed')) return 'group_members_group_closed';
  if (msg.includes('forbidden') || msg.includes('not_a_member')) return 'group_members_forbidden';
  return error?.message ?? fallback;
}

export async function staffCloseGroup(
  conversationId: string,
  staffId: string
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('messaging_close_group_staff', {
    p_conversation_id: conversationId,
    p_staff_id: staffId,
  });
  if (error) return { ok: false, error: formatGroupMemberRpcError(error, error.message) };
  return { ok: Boolean(data), error: null };
}

export async function staffVerifyGroupAccess(
  conversationId: string,
  staffId: string
): Promise<{ ok: boolean; reason?: 'closed' | 'removed' }> {
  const { data: part } = await supabase
    .from('conversation_participants')
    .select('left_at')
    .eq('conversation_id', conversationId)
    .eq('participant_id', staffId)
    .in('participant_type', ['staff', 'admin'])
    .maybeSingle();
  if (!part || (part as { left_at: string | null }).left_at) {
    return { ok: false, reason: 'removed' };
  }
  const { data: conv } = await supabase
    .from('conversations')
    .select('type, closed_at')
    .eq('id', conversationId)
    .maybeSingle();
  const row = conv as { type: string; closed_at: string | null } | null;
  if (row?.type === 'group' && row.closed_at) {
    const { data: staffRow } = await supabase.from('staff').select('role').eq('id', staffId).maybeSingle();
    if ((staffRow as { role: string } | null)?.role !== 'admin') {
      return { ok: false, reason: 'closed' };
    }
  }
  return { ok: true };
}

export async function staffListGroupMembers(
  conversationId: string,
  staffId: string
): Promise<{ members: GroupMemberRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('messaging_list_group_members_staff', {
    p_conversation_id: conversationId,
    p_staff_id: staffId,
  });
  if (error) return { members: [], error: formatGroupMemberRpcError(error, error.message) };
  return { members: (data ?? []) as GroupMemberRow[], error: null };
}

export async function staffAddGroupMembers(
  conversationId: string,
  staffId: string,
  memberStaffIds: string[]
): Promise<{ addedIds: string[]; error: string | null }> {
  const unique = [...new Set(memberStaffIds.filter(Boolean))];
  if (unique.length === 0) return { addedIds: [], error: null };
  const { data, error } = await supabase.rpc('messaging_add_group_members_staff', {
    p_conversation_id: conversationId,
    p_staff_id: staffId,
    p_member_staff_ids: unique,
  });
  if (error) return { addedIds: [], error: formatGroupMemberRpcError(error, error.message) };
  const addedIds = ((data ?? []) as { added_id: string }[]).map((r) => r.added_id).filter(Boolean);
  return { addedIds, error: null };
}

export async function staffRemoveGroupMember(
  conversationId: string,
  staffId: string,
  memberStaffId: string
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('messaging_remove_group_member_staff', {
    p_conversation_id: conversationId,
    p_staff_id: staffId,
    p_member_staff_id: memberStaffId,
  });
  if (error) return { ok: false, error: formatGroupMemberRpcError(error, error.message) };
  return { ok: Boolean(data), error: null };
}

export async function staffMarkConversationRead(conversationId: string, staffId: string): Promise<void> {
  await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('participant_id', staffId)
    .in('participant_type', ['staff', 'admin']);
}

/** Personel/admin sohbeti kendi listesinden kaldırır. */
export async function staffDeleteConversation(
  conversationId: string,
  staffId: string
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('conversation_participants')
    .update({ left_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('participant_id', staffId)
    .in('participant_type', ['staff', 'admin'])
    .is('left_at', null)
    .select('id')
    .limit(1);

  if (error) return { error: error.message };
  if (!data?.length) return { error: 'Sohbet silinemedi.' };
  for (const key of [...staffDirectConversationResolveCache.keys()]) {
    if (key.startsWith(`${staffId}:`)) staffDirectConversationResolveCache.delete(key);
  }
  return { error: null };
}

/** Sohbet header’ı: gösterilecek isim ve avatar (personel/admin için). */
export async function staffGetConversationHeader(
  conversationId: string,
  staffId: string
): Promise<{ name: string; avatar: string | null }> {
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('type, name, avatar, group_theme_color')
    .eq('id', conversationId)
    .single();
  if (convErr || !conv) return { name: 'Sohbet', avatar: null };
  const row = conv as { type: string; name: string | null; avatar: string | null };
  if (row.type === 'group' && (row.name || row.avatar != null)) {
    return { name: row.name || 'Sohbet', avatar: row.avatar ?? null };
  }
  const { data: other } = await supabase
    .from('conversation_participants')
    .select('participant_id, participant_type')
    .eq('conversation_id', conversationId)
    .neq('participant_id', staffId)
    .is('left_at', null)
    .limit(1)
    .maybeSingle();
  if (!other) return { name: row.name || 'Sohbet', avatar: row.avatar ?? null };
  const o = other as { participant_id: string; participant_type: string };
  if (o.participant_type === 'guest') {
    const { data: g } = await supabase.from('guests').select('full_name, photo_url').eq('id', o.participant_id).maybeSingle();
    const gr = g as { full_name: string; photo_url?: string | null } | null;
    const name = gr?.full_name || 'Misafir';
    return { name, avatar: gr?.photo_url ?? null };
  }
  if (o.participant_type === 'partner') {
    const { data: p } = await supabase
      .from('breakfast_partner_users')
      .select('full_name, breakfast_partner_hotels(name)')
      .eq('id', o.participant_id)
      .maybeSingle();
    const pr = p as {
      full_name: string | null;
      breakfast_partner_hotels?: { name?: string | null } | { name?: string | null }[] | null;
    } | null;
    const hotel = Array.isArray(pr?.breakfast_partner_hotels)
      ? pr.breakfast_partner_hotels[0]
      : pr?.breakfast_partner_hotels;
    const name = [pr?.full_name?.trim() || 'Partner', hotel?.name?.trim()].filter(Boolean).join(' · ');
    return { name: name || 'Partner', avatar: null };
  }
  const { data: s } = await supabase
    .from('staff')
    .select('full_name, profile_image')
    .eq('id', o.participant_id)
    .maybeSingle();
  const st = s as { full_name: string; profile_image: string | null } | null;
  return { name: st?.full_name || 'Personel', avatar: st?.profile_image ?? null };
}

/** Personel sohbeti sessize alır / sessizi kaldırır. */
export async function staffSetConversationMuted(
  conversationId: string,
  staffId: string,
  muted: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('conversation_participants')
    .update({ is_muted: muted })
    .eq('conversation_id', conversationId)
    .eq('participant_id', staffId)
    .in('participant_type', ['staff', 'admin']);
  return { error: error?.message ?? null };
}

/** Bu sohbette benden silinen mesaj kimlikleri. */
export async function staffListHiddenMessageIdsForConversation(
  _conversationId: string,
  staffId: string
): Promise<string[]> {
  // Mesaj kimlikleri global benzersiz olduğundan, kullanıcının tüm gizli kimlik setini
  // döndürmek yeterli (sohbet ekranı yalnızca id ile filtreler). Böylece sohbet açılışındaki
  // "bu sohbetteki tüm mesaj id'lerini çek" ağır sorgusu kaldırılır ve önbellek paylaşılır.
  const ids = await getStaffHiddenMessageIdsCached(staffId);
  return [...ids];
}

/** Mesajı sadece bu personel için gizler (benden sil). */
export async function staffHideMessageForMe(
  conversationId: string,
  messageId: string
): Promise<{ error: string | null }> {
  if (!isPersistedChatMessageId(messageId)) {
    return { error: 'Mesaj henüz kaydedilmedi.' };
  }
  const { data, error } = await supabase.rpc('messaging_hide_message_staff', {
    p_conversation_id: conversationId,
    p_message_id: messageId,
  });
  if (error) return { error: error.message };
  if (data !== true) return { error: 'Mesaj gizlenemedi.' };
  invalidateStaffHiddenIdsCache();
  return { error: null };
}

/** Sohbeti arşivler / arşivden çıkarır. */
export async function staffSetConversationArchived(
  conversationId: string,
  staffId: string,
  archived: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('conversation_participants')
    .update({ is_archived: archived })
    .eq('conversation_id', conversationId)
    .eq('participant_id', staffId)
    .in('participant_type', ['staff', 'admin']);
  return { error: error?.message ?? null };
}

const CHAT_MESSAGE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Sunucuda kayıtlı mesaj kimliği (temp-* değil). */
export function isPersistedChatMessageId(messageId: string): boolean {
  return CHAT_MESSAGE_UUID_RE.test(messageId);
}

/** Personel/admin kendi metin mesajını düzenler. */
export async function staffEditMessage(
  conversationId: string,
  messageId: string,
  content: string,
  mentions?: import('@/lib/messaging').ChatMention[] | null
): Promise<{ ok: boolean; error: string | null }> {
  if (!isPersistedChatMessageId(messageId)) {
    return { ok: false, error: 'Mesaj henüz kaydedilmedi.' };
  }
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: 'Mesaj boş olamaz.' };
  const { data, error } = await supabase.rpc('messaging_edit_message_staff', {
    p_conversation_id: conversationId,
    p_message_id: messageId,
    p_content: trimmed,
    p_mentions: mentions?.length ? mentions : [],
  });
  if (error) return { ok: false, error: error.message };
  if (data !== true) return { ok: false, error: 'Mesaj düzenlenemedi.' };
  return { ok: true, error: null };
}

/** Personel mesajı siler (soft delete). Silinen mesaj listeden kalkar. */
export async function staffDeleteMessage(
  conversationId: string,
  messageId: string
): Promise<{ error: string | null }> {
  if (!isPersistedChatMessageId(messageId)) {
    return { error: 'Mesaj henüz kaydedilmedi.' };
  }
  const { data, error } = await supabase.rpc('messaging_delete_message_staff', {
    p_conversation_id: conversationId,
    p_message_id: messageId,
  });
  if (error) return { error: error.message };
  if (data !== true) return { error: 'Mesaj silinemedi.' };
  return { error: null };
}

export function subscribeToMessages(
  conversationId: string,
  onMessage: (m: Message) => void,
  options?: {
    onMessageDeleted?: (messageId: string) => void;
    onMessageUpdated?: (m: Message) => void;
    onSubscribeStatus?: (status: string) => void;
  }
) {
  const channel = supabase
    .channel(`staff-chat-messages:${conversationId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => {
        onMessage(payload.new as Message);
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => {
        const row = payload.new as Message & { is_deleted?: boolean };
        if (row?.is_deleted) {
          options?.onMessageDeleted?.(row.id);
          return;
        }
        options?.onMessageUpdated?.(row as Message);
      }
    );
  channel.subscribe((status, err) => {
    options?.onSubscribeStatus?.(status);
    if (status === 'CHANNEL_ERROR' && err) {
      console.warn('[subscribeToMessages]', conversationId, err.message ?? err);
    }
  });
  return {
    unsubscribe() {
      void supabase.removeChannel(channel);
    },
  };
}

/** Grup kapatıldığında veya üyelik sonlandırıldığında anlık bildirim. */
export function subscribeToGroupAccess(
  conversationId: string,
  staffId: string,
  onAccessRevoked: () => void,
  options?: { onGroupClosed?: () => void }
) {
  const channel = supabase
    .channel(`group-access:${conversationId}:${staffId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversation_participants',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const row = payload.new as { participant_id: string; left_at: string | null };
        if (row.participant_id === staffId && row.left_at) {
          onAccessRevoked();
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
        filter: `id=eq.${conversationId}`,
      },
      (payload) => {
        const row = payload.new as { closed_at: string | null };
        if (row.closed_at) {
          options?.onGroupClosed?.();
        }
      }
    )
    .subscribe();
  return {
    unsubscribe() {
      void supabase.removeChannel(channel);
    },
  };
}

export type TypingPresenceState = { displayName: string; userId: string };

const TYPING_PRESENCE_MIN_TRACK_MS = 2800;

/** Yazıyor göstergesi: aynı sohbet odasında kimlerin yazdığını dinler. */
export function subscribeToTypingPresence(
  conversationId: string,
  myState: TypingPresenceState,
  onTypingChange: (typerDisplayNames: string[]) => void,
  options?: { enabled?: boolean }
): { updateTyping: (typing: boolean) => void; unsubscribe: () => void } {
  const noop = { updateTyping: (_typing: boolean) => {}, unsubscribe: () => {} };
  if (options?.enabled === false) return noop;

  const channel = supabase.channel(`typing:${conversationId}`);
  let lastTracked: boolean | null = null;
  let lastTrackAt = 0;
  let subscribed = false;

  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState() as Record<string, { displayName?: string; userId?: string; typing?: boolean }[]>;
    const typers = Object.values(state)
      .flat()
      .filter((p) => p.typing && p.userId !== myState.userId)
      .map((p) => p.displayName || '?')
      .filter(Boolean);
    onTypingChange(typers);
  });

  const trackTyping = (typing: boolean) => {
    if (!subscribed) return;
    const now = Date.now();
    if (typing === lastTracked && now - lastTrackAt < TYPING_PRESENCE_MIN_TRACK_MS) return;
    lastTracked = typing;
    lastTrackAt = now;
    void channel.track({ ...myState, typing }).catch(() => {});
  };

  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      subscribed = true;
      lastTracked = false;
      lastTrackAt = Date.now();
      await channel.track({ ...myState, typing: false }).catch(() => {});
    }
    if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
      subscribed = false;
    }
  });

  return {
    updateTyping: trackTyping,
    unsubscribe() {
      subscribed = false;
      void supabase.removeChannel(channel);
    },
  };
}

// ----- Guest (app_token) -----

export async function guestListConversations(appToken: string): Promise<ConversationWithMeta[]> {
  const { data, error } = await supabase.rpc('messaging_list_conversations_guest', { p_app_token: appToken });
  if (error || !data?.length) return [];
  return data as ConversationWithMeta[];
}

/** Misafir sohbet açıldığında okundu işaretle; mesaj badge'i güncellenir. */
export async function guestMarkConversationRead(appToken: string, conversationId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('messaging_guest_mark_conversation_read', {
    p_app_token: appToken,
    p_conversation_id: conversationId,
  });
  return !error && data === true;
}

/** Sohbet header’ı: gösterilecek isim ve avatar (misafir için). */
export async function guestGetConversationHeader(
  appToken: string,
  conversationId: string
): Promise<{ name: string; avatar: string | null }> {
  const { data, error } = await supabase.rpc('messaging_get_conversation_header_guest', {
    p_app_token: appToken,
    p_conversation_id: conversationId,
  });
  if (error || !data?.length) return { name: 'Sohbet', avatar: null };
  const row = Array.isArray(data) ? data[0] : data;
  const r = row as { display_name: string | null; display_avatar: string | null };
  return { name: r?.display_name || 'Sohbet', avatar: r?.display_avatar ?? null };
}

export async function guestGetMessages(
  appToken: string,
  conversationId: string,
  limit = 50,
  beforeId?: string,
  afterCreatedAt?: string | null
): Promise<Message[]> {
  const { data, error } = await supabase.rpc('messaging_get_messages_guest', {
    p_app_token: appToken,
    p_conversation_id: conversationId,
    p_limit: limit,
    p_before_id: beforeId ?? null,
    p_after_created_at: afterCreatedAt?.trim() ? afterCreatedAt.trim() : null,
  });
  if (error || !data) return [];
  return (Array.isArray(data) ? data : [data]) as Message[];
}

export async function guestSendMessage(
  appToken: string,
  conversationId: string,
  content: string,
  messageType: 'text' | 'image' | 'file' | 'voice' | 'video' = 'text',
  mediaUrl?: string | null,
  mediaThumbnail?: string | null,
  resolvedConversationId?: string,
  mentions?: import('@/lib/messaging').ChatMention[] | null
): Promise<{ messageId: string | null; conversationId: string | null; error?: string }> {
  const convId = resolvedConversationId ?? conversationId;
  const rpcBody = {
    p_conversation_id: convId,
    p_content: content,
    p_message_type: messageType,
    p_media_url: mediaUrl ?? null,
    p_media_thumbnail: mediaThumbnail?.trim() ? mediaThumbnail.trim() : null,
    p_mentions: mentions?.length ? mentions : [],
  };

  const tokens = await guestMessagingTokensToTry(appToken);
  if (!tokens.length) {
    return {
      messageId: null,
      conversationId: convId,
      error: 'Misafir oturumu bulunamadı. Çıkış yapıp tekrar giriş yapın.',
    };
  }

  let lastError: string | null = null;

  for (const token of tokens) {
    const { data, error } = await invokeGuestSendMessageRpc(token, rpcBody);
    if (error) {
      log.warn('messagingApi', 'guestSendMessage RPC', token.slice(0, 8), error.message, error.code);
      lastError = formatChatMessageSendError(error, error.message);
      continue;
    }
    if (data != null) {
      return { messageId: data as string, conversationId: convId };
    }
    lastError =
      'Mesaj kaydedilemedi. Yeni sohbet başlatın veya çıkış yapıp yeniden giriş yapın.';
  }

  return {
    messageId: null,
    conversationId: convId,
    error: lastError ?? GUEST_MESSAGING_SESSION_HINT,
  };
}

async function resolveGuestConversationForSend(appToken: string, conversationId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('messaging_guest_resolve_direct_conversation', {
    p_app_token: appToken,
    p_conversation_id: conversationId,
  });
  if (error || data == null) return conversationId;
  return data as string;
}

export type GuestOpenStaffChatResult = {
  conversationId: string | null;
  error?: string;
};

export async function guestGetOrCreateConversationWithStaff(
  appToken: string,
  staffId: string
): Promise<string | null> {
  const { conversationId } = await guestOpenStaffChat(appToken, staffId);
  return conversationId;
}

/** Misafir → personel sohbeti: token + oturum (auth) ile oluşturur; hatayı UI'da göstermek için. */
export async function guestOpenStaffChat(
  appToken: string,
  staffId: string
): Promise<GuestOpenStaffChatResult> {
  const tokens = await guestMessagingTokensToTry(appToken);
  let lastError: string | null = null;

  if (!tokens.length) {
    return { conversationId: null, error: 'Misafir oturumu bulunamadı. Çıkış yapıp tekrar giriş yapın.' };
  }

  for (const token of tokens) {
    const { data, error } = await invokeGuestGetOrCreateStaffRpc(token, staffId);
    if (error) {
      log.warn('messagingApi', 'guestOpenStaffChat', error.message, error.code);
      lastError = formatChatMessageSendError(error, error.message);
      continue;
    }
    if (data != null) {
      return { conversationId: data as string };
    }
    lastError = GUEST_MESSAGING_SESSION_HINT;
  }

  return { conversationId: null, error: lastError ?? GUEST_MESSAGING_SESSION_HINT };
}

/** Misafir kendi metin mesajını düzenler. */
export async function guestEditMessage(
  appToken: string,
  messageId: string,
  content: string,
  mentions?: import('@/lib/messaging').ChatMention[] | null
): Promise<{ ok: boolean; error: string | null }> {
  if (!isPersistedChatMessageId(messageId)) {
    return { ok: false, error: 'Mesaj henüz kaydedilmedi.' };
  }
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: 'Mesaj boş olamaz.' };
  const { data, error } = await supabase.rpc('messaging_edit_message_guest', {
    p_app_token: appToken,
    p_message_id: messageId,
    p_content: trimmed,
    p_mentions: mentions?.length ? mentions : [],
  });
  if (error) return { ok: false, error: error.message };
  if (data !== true) return { ok: false, error: 'Mesaj düzenlenemedi.' };
  return { ok: true, error: null };
}

/** Misafir kendi mesajını siler (soft delete). Silinen mesaj listeden kalkar. */
export async function guestDeleteMessage(appToken: string, messageId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('messaging_delete_message_guest', {
    p_app_token: appToken,
    p_message_id: messageId,
  });
  return !error && data === true;
}

/** Misafir sohbeti kendi listesinden kaldırır. */
export async function guestDeleteConversation(appToken: string, conversationId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('messaging_delete_conversation_guest', {
    p_app_token: appToken,
    p_conversation_id: conversationId,
  });
  return !error && data === true;
}

/** Misafir ses dosyasını yükler; Edge Function ile storage’a koyar, public URL döner. */
export async function uploadVoiceMessageForGuest(
  appToken: string,
  conversationId: string,
  localUri: string
): Promise<string> {
  const convId = typeof conversationId === 'string' ? conversationId.trim() : conversationId;
  const token = typeof appToken === 'string' ? appToken.trim() : appToken;
  const buffer = await readVoiceRecordingBuffer(localUri);
  const { mime } = getMimeAndExt(localUri, 'audio');
  const base64 = encodeBase64(buffer);

  const url = `${supabaseUrl}/functions/v1/upload-message-media`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      app_token: token,
      conversation_id: convId,
      audio_base64: base64,
      mime_type: mime,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok) {
    throw new Error(data?.error || res.statusText || 'Ses yüklenemedi');
  }
  if (!data?.url) {
    throw new Error(data?.error || 'Ses yüklenemedi');
  }
  return data.url;
}

const MESSAGE_MEDIA_BUCKET = 'message-media';

/** Personel ses dosyasını storage'a yükler (authenticated). */
export async function uploadVoiceMessageForStaff(localUri: string): Promise<string> {
  const buffer = await readVoiceRecordingBuffer(localUri);
  const { mime, ext } = getMimeAndExt(localUri, 'audio');
  const { publicUrl } = await uploadBufferToPublicBucket({
    bucketId: MESSAGE_MEDIA_BUCKET,
    buffer,
    contentType: mime,
    extension: ext,
    subfolder: 'voice',
  });
  return publicUrl;
}

/** Misafir resim mesajı: önce imzalı URL alınır (küçük istek), sonra resim doğrudan Storage’a yüklenir. */
export async function uploadImageMessageForGuest(
  appToken: string,
  conversationId: string,
  imageArrayBuffer: ArrayBuffer,
  mimeType = 'image/jpeg'
): Promise<string> {
  const convId = typeof conversationId === 'string' ? conversationId.trim() : conversationId;
  const token = typeof appToken === 'string' ? appToken.trim() : appToken;
  const base64 = encodeBase64(imageArrayBuffer);
  console.log('[messagingApi] uploadImageMessageForGuest: conversationId=', convId, 'mimeType=', mimeType, 'size=', imageArrayBuffer?.byteLength);

  const url = `${supabaseUrl}/functions/v1/upload-message-media`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      app_token: token,
      conversation_id: convId,
      image_base64: base64,
      mime_type: mimeType,
    }),
  });
  const data = await res.json().catch(() => ({})) as { url?: string; error?: string };
  if (!res.ok) {
    const msg = data?.error || res.statusText || 'Resim yüklenemedi.';
    console.warn('[messagingApi] upload-message-media fetch error:', res.status, msg);
    throw new Error(msg);
  }
  const publicUrl = data?.url;
  if (!publicUrl) {
    console.warn('[messagingApi] upload-message-media url yok, data:', typeof data === 'object' ? JSON.stringify(data).slice(0, 200) : data);
    throw new Error(data?.error || 'Resim yüklenemedi.');
  }
  return publicUrl;
}

/** Personel resim mesajını storage'a yükler (authenticated). arrayBuffer: uriToArrayBuffer(uri) ile alınır. Hata durumunda throw eder. */
export async function uploadImageMessageForStaff(arrayBuffer: ArrayBuffer, mimeType: string): Promise<string> {
  console.log('[messagingApi] uploadImageMessageForStaff: mimeType=', mimeType, 'size=', arrayBuffer?.byteLength);
  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const { publicUrl } = await uploadBufferToPublicBucket({
    bucketId: MESSAGE_MEDIA_BUCKET,
    buffer: arrayBuffer,
    contentType: mimeType,
    extension: ext,
    subfolder: 'images',
  });
  return publicUrl;
}

/** Partner resim mesajı — authenticated oturum ile personel ile aynı bucket. */
export async function uploadImageMessageForPartner(
  arrayBuffer: ArrayBuffer,
  mimeType: string = 'image/jpeg'
): Promise<string> {
  return uploadImageMessageForStaff(arrayBuffer, mimeType);
}

/** Partner ses dosyası — authenticated oturum ile personel ile aynı bucket. */
export async function uploadVoiceMessageForPartner(localUri: string): Promise<string> {
  return uploadVoiceMessageForStaff(localUri);
}

// ----- Partner (authenticated breakfast partner user) -----
// Ham fetch client — resilient sarmalayıcı geçici 503 üretip "sunucuya bağlanmıyor" göstermesin.

function formatPartnerChatSendError(e: unknown, fallback: string): string {
  const row = e && typeof e === 'object' ? (e as { message?: string; code?: string }) : null;
  const code = row?.code ?? '';
  const msg =
    row?.message?.trim() ||
    (e instanceof Error ? e.message : typeof e === 'string' ? e : fallback);
  if (code === 'PGRST301' || /jwt|session|not authenticated/i.test(msg)) {
    return PARTNER_MESSAGING_SESSION_HINT;
  }
  return formatChatMessageSendError(e, fallback);
}

export type PartnerStaffPickerRow = {
  id: string;
  full_name: string;
  department: string | null;
  profile_image: string | null;
  is_online: boolean;
  role: string | null;
  verification_badge: string | null;
};

export async function partnerListStaffForChat(): Promise<PartnerStaffPickerRow[]> {
  const { data, error } = await supabaseMessaging.rpc('messaging_list_staff_for_partner');
  if (error || !data?.length) return [];
  return data as PartnerStaffPickerRow[];
}

export async function partnerListConversations(): Promise<ConversationWithMeta[]> {
  const { data, error } = await supabaseMessaging.rpc('messaging_list_conversations_partner');
  if (error || !data?.length) return [];
  return data as ConversationWithMeta[];
}

export async function partnerUnreadCount(): Promise<number> {
  const { data, error } = await supabaseMessaging.rpc('messaging_unread_count_partner');
  if (error) return 0;
  return Number(data) || 0;
}

export async function partnerMarkConversationRead(conversationId: string): Promise<boolean> {
  const { data, error } = await supabaseMessaging.rpc('messaging_partner_mark_conversation_read', {
    p_conversation_id: conversationId,
  });
  return !error && data === true;
}

export async function partnerGetConversationHeader(
  conversationId: string
): Promise<{ name: string; avatar: string | null }> {
  const { data, error } = await supabaseMessaging.rpc('messaging_get_conversation_header_partner', {
    p_conversation_id: conversationId,
  });
  if (error || !data?.length) return { name: 'Sohbet', avatar: null };
  const row = Array.isArray(data) ? data[0] : data;
  const r = row as { display_name: string | null; display_avatar: string | null };
  return { name: r?.display_name || 'Sohbet', avatar: r?.display_avatar ?? null };
}

export async function partnerGetMessages(
  conversationId: string,
  limit = 50,
  beforeId?: string,
  afterCreatedAt?: string | null
): Promise<Message[]> {
  const { data, error } = await supabaseMessaging.rpc('messaging_get_messages_partner', {
    p_conversation_id: conversationId,
    p_limit: limit,
    p_before_id: beforeId ?? null,
    p_after_created_at: afterCreatedAt?.trim() ? afterCreatedAt.trim() : null,
  });
  if (error || !data) return [];
  return (Array.isArray(data) ? data : [data]) as Message[];
}

export async function partnerSendMessage(
  conversationId: string,
  content: string,
  messageType: 'text' | 'image' | 'file' | 'voice' | 'video' = 'text',
  mediaUrl?: string | null,
  mediaThumbnail?: string | null
): Promise<{ messageId: string | null; error?: string }> {
  const rpcBody = {
    p_conversation_id: conversationId,
    p_content: content,
    p_message_type: messageType,
    p_media_url: mediaUrl ?? null,
    p_media_thumbnail: mediaThumbnail?.trim() ? mediaThumbnail.trim() : null,
  };

  let lastError: string | null = null;
  for (const delayMs of [0, 400, 1200]) {
    if (delayMs) await sleepMs(delayMs);
    const { data, error } = await supabaseMessaging.rpc('messaging_send_message_partner', rpcBody);
    if (error) {
      log.warn('messagingApi', 'partnerSendMessage', error.code, error.message);
      if (isTransientSupabaseDbError(error) && delayMs < 1200) continue;
      return { messageId: null, error: formatPartnerChatSendError(error, error.message) };
    }
    if (data != null) return { messageId: data as string };
    lastError = 'Mesaj kaydedilemedi. Sohbeti yenileyip tekrar deneyin.';
  }

  return { messageId: null, error: lastError ?? 'Mesaj kaydedilemedi.' };
}

export async function partnerOpenStaffChat(staffId: string): Promise<{ conversationId: string | null; error?: string }> {
  const { data, error } = await supabaseMessaging.rpc('messaging_partner_get_or_create_with_staff', {
    p_staff_id: staffId,
  });
  if (error) return { conversationId: null, error: formatPartnerChatSendError(error, error.message) };
  if (data == null) return { conversationId: null, error: 'Sohbet başlatılamadı.' };
  return { conversationId: data as string };
}

export async function partnerDeleteConversation(conversationId: string): Promise<boolean> {
  const { data, error } = await supabaseMessaging.rpc('messaging_delete_conversation_partner', {
    p_conversation_id: conversationId,
  });
  return !error && data === true;
}
