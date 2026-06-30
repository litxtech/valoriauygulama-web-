import { encodeVoiceContent } from '@/lib/voiceMessageMeta';

export function isTempMessageId(id: string): boolean {
  return id.startsWith('temp-');
}

export function createOptimisticTextMessage(params: {
  tempId: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  text: string;
  replyToId?: string | null;
  mentions?: ChatMention[];
}): Message {
  const now = new Date().toISOString();
  return {
    id: params.tempId,
    conversation_id: params.conversationId,
    sender_id: params.senderId,
    sender_type: 'staff',
    sender_name: params.senderName,
    sender_avatar: params.senderAvatar,
    message_type: 'text',
    content: params.text,
    media_url: null,
    media_thumbnail: null,
    file_name: null,
    file_size: null,
    mime_type: null,
    is_delivered: false,
    delivered_at: null,
    is_read: false,
    read_at: null,
    is_edited: false,
    edited_at: null,
    is_deleted: false,
    deleted_at: null,
    reply_to_id: params.replyToId ?? null,
    scheduled_at: null,
    created_at: now,
    mentions: params.mentions?.length ? params.mentions : [],
  };
}

export function createOptimisticVoiceMessage(params: {
  tempId: string;
  conversationId: string;
  senderId: string;
  senderType: 'staff' | 'guest' | 'admin' | 'partner';
  senderName: string;
  senderAvatar: string | null;
  localUri: string;
  durationSec?: number;
}): Message {
  const now = new Date().toISOString();
  return {
    id: params.tempId,
    conversation_id: params.conversationId,
    sender_id: params.senderId,
    sender_type: params.senderType,
    sender_name: params.senderName,
    sender_avatar: params.senderAvatar,
    message_type: 'voice',
    content: encodeVoiceContent(params.durationSec ?? 1),
    media_url: params.localUri,
    media_thumbnail: null,
    file_name: null,
    file_size: null,
    mime_type: 'audio/m4a',
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
    created_at: now,
    mentions: [],
  };
}

export function createOptimisticImageMessage(params: {
  tempId: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  senderType?: 'staff' | 'partner';
  localUri: string;
  albumContent?: string;
}): Message {
  const now = new Date().toISOString();
  return {
    id: params.tempId,
    conversation_id: params.conversationId,
    sender_id: params.senderId,
    sender_type: params.senderType ?? 'staff',
    sender_name: params.senderName,
    sender_avatar: params.senderAvatar,
    message_type: 'image',
    content: params.albumContent ?? '',
    media_url: params.localUri,
    media_thumbnail: params.localUri,
    file_name: null,
    file_size: null,
    mime_type: 'image/jpeg',
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
    created_at: now,
    mentions: [],
  };
}
