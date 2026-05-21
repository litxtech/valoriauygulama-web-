/**
 * Valoria Hotel - Realtime mesajlaşma tipleri ve API yardımcıları
 */

import { parseChatAlbumId, parseChatVideoAlbumId } from '@/lib/chatImageAlbum';

export type ParticipantType = 'guest' | 'staff' | 'admin';
export type ConversationType = 'direct' | 'group' | 'department';
export type MessageType =
  | 'text'
  | 'image'
  | 'file'
  | 'location'
  | 'voice'
  | 'video'
  | 'screenshot_notice';

export interface Conversation {
  id: string;
  type: ConversationType;
  name: string | null;
  avatar: string | null;
  group_theme_color?: string | null;
  created_by: string | null;
  created_by_type: ParticipantType | null;
  created_at: string;
  updated_at: string;
  last_message_id: string | null;
  last_message_at: string | null;
}

export interface ConversationWithMeta extends Conversation {
  last_message_preview?: string | null;
  unread_count?: number;
  is_pinned?: boolean;
  is_muted?: boolean;
  /** Direct sohbetlerde karşı tarafın profil resmi (staff profile_image). */
  other_avatar?: string | null;
  other_participant?: { id: string; type: ParticipantType; name: string; avatar: string | null; is_online?: boolean; last_seen?: string | null };
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: ParticipantType;
  sender_name: string | null;
  sender_avatar: string | null;
  message_type: MessageType;
  content: string | null;
  media_url: string | null;
  media_thumbnail: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_name?: string | null;
  is_delivered: boolean;
  delivered_at: string | null;
  is_read: boolean;
  read_at: string | null;
  is_edited: boolean;
  edited_at: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  reply_to_id: string | null;
  scheduled_at: string | null;
  created_at: string;
  mentions?: import('@/lib/chatMentions').ChatMention[] | null;
}

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  participant_id: string;
  participant_type: ParticipantType;
  role: string;
  joined_at: string;
  left_at: string | null;
  last_read_at: string | null;
  is_muted: boolean;
  is_pinned: boolean;
}

/** Mevcut kullanıcı: staff (auth) veya guest (app_token) */
export type MessagingActor =
  | { type: 'staff'; staffId: string; name: string; avatar: string | null; isAdmin: boolean }
  | { type: 'guest'; guestId: string; appToken: string; name: string; roomNumber: string | null };

export const MESSAGING_COLORS = {
  primary: '#C5A059',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  info: '#3B82F6',
  background: '#FFFFFF',
  text: '#1F2937',
  textSecondary: '#6B7280',
} as const;

function messageSortKey(m: Message): number {
  return new Date(m.created_at).getTime();
}

/** Belleği ve giriş süresini sınırlamak için tutulan son mesaj sayısı. */
export const CHAT_MESSAGES_RETAIN_MAX = 400;

/** temp- hariç en yeni mesajın created_at değeri (artımlı çekim için). */
export function latestMessageCreatedAtIso(messages: Message[]): string | null {
  let max = -Infinity;
  let iso: string | null = null;
  for (const m of messages) {
    if (String(m.id).startsWith('temp-')) continue;
    const t = new Date(m.created_at).getTime();
    if (!Number.isFinite(t)) continue;
    if (t >= max) {
      max = t;
      iso = m.created_at;
    }
  }
  return iso;
}

/** Uzun geçmişlerde bellek / FlatList maliyetini düşürür (en yeni N mesaj). */
export function capChatMessageList(messages: Message[]): Message[] {
  if (messages.length <= CHAT_MESSAGES_RETAIN_MAX) return messages;
  return [...messages].sort((a, b) => messageSortKey(a) - messageSortKey(b)).slice(-CHAT_MESSAGES_RETAIN_MAX);
}

/** Aynı id ile yinelenen optimistik satırları birleştirir. */
export function dedupeChatMessagesById(messages: Message[]): Message[] {
  const map = new Map<string, Message>();
  for (const m of messages) {
    const prev = map.get(m.id);
    map.set(m.id, prev ? pickNewerChatMessage(prev, m) : m);
  }
  return [...map.values()].sort((a, b) => messageSortKey(a) - messageSortKey(b));
}

function isMuxVideoReady(m: Message): boolean {
  return m.message_type === 'video' && Boolean(m.media_url?.includes('stream.mux.com'));
}

/** Aynı id için daha “hazır” video satırını seç (poll/realtime gecikmesini önler). */
export function pickNewerChatMessage(a: Message, b: Message): Message {
  if (isMuxVideoReady(a) && !isMuxVideoReady(b)) return a;
  if (isMuxVideoReady(b) && !isMuxVideoReady(a)) return b;
  if ((a.media_thumbnail ?? '') && !(b.media_thumbnail ?? '')) return a;
  if ((b.media_thumbnail ?? '') && !(a.media_thumbnail ?? '')) return b;
  return b;
}

/** Sunucudan gelen liste ile bellekteki (temp / realtime) mesajları birleştirir. */
export function mergeChatMessages(fetched: Message[], existing: Message[]): Message[] {
  const map = new Map<string, Message>();
  for (const m of fetched) map.set(m.id, m);
  for (const m of existing) {
    const id = String(m.id);
    if (id.startsWith('temp-')) {
      map.set(id, m);
      continue;
    }
    const prev = map.get(m.id);
    if (prev) map.set(m.id, pickNewerChatMessage(prev, m));
    else map.set(m.id, m);
  }
  return [...map.values()].sort((a, b) => messageSortKey(a) - messageSortKey(b));
}

export function mergeChatMessagesCapped(fetched: Message[], existing: Message[]): Message[] {
  return capChatMessageList(mergeChatMessages(fetched, existing));
}

/** Realtime UPDATE: mevcut mesajı günceller (ör. Mux video hazır). */
export function replaceChatMessage(prev: Message[], updated: Message): Message[] {
  const idx = prev.findIndex((m) => m.id === updated.id);
  if (idx < 0) {
    return capChatMessageList([...prev, updated].sort((a, b) => messageSortKey(a) - messageSortKey(b)));
  }
  const next = [...prev];
  next[idx] = pickNewerChatMessage(next[idx], updated);
  return capChatMessageList(next.sort((a, b) => messageSortKey(a) - messageSortKey(b)));
}

type UpsertIncomingOpts = {
  ownSenderId?: string;
  ownSenderType?: ParticipantType;
};

/** Realtime veya gönderim sonrası tek mesaj ekler; eşleşen optimistik temp'i kaldırır. */
export function upsertIncomingChatMessage(
  prev: Message[],
  newMsg: Message,
  opts?: UpsertIncomingOpts
): Message[] {
  if (prev.some((m) => m.id === newMsg.id)) return prev;
  const isOwnById = !!opts?.ownSenderId && newMsg.sender_id === opts.ownSenderId;
  const isOwnByType = !!opts?.ownSenderType && newMsg.sender_type === opts.ownSenderType;
  const albumNew = parseChatVideoAlbumId(newMsg.content) ?? parseChatAlbumId(newMsg.content);
  let removedMatchingTemp = false;
  const filtered = prev.filter((m) => {
    if (!String(m.id).startsWith('temp-')) return true;
    if (m.message_type !== newMsg.message_type) return true;
    const albumM = parseChatVideoAlbumId(m.content) ?? parseChatAlbumId(m.content);
    if (albumNew && albumM) {
      if (albumNew !== albumM) return true;
      if (isOwnById && m.sender_id === newMsg.sender_id && !removedMatchingTemp) {
        removedMatchingTemp = true;
        return false;
      }
      return true;
    }
    if (albumNew || albumM) return true;
    if (isOwnById && m.sender_id === newMsg.sender_id && !removedMatchingTemp) {
      removedMatchingTemp = true;
      return false;
    }
    if (isOwnByType && m.sender_type === newMsg.sender_type && !removedMatchingTemp) {
      removedMatchingTemp = true;
      return false;
    }
    return true;
  });
  return capChatMessageList(dedupeChatMessagesById([...filtered, newMsg]));
}
