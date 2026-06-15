/**
 * Sohbet: sesli mesaj yükleme ve gönderme.
 */
import {
  staffSendMessage,
  guestSendMessage,
  uploadVoiceMessageForStaff,
  uploadVoiceMessageForGuest,
  resolveStaffConversationIdForSend,
  formatChatMessageSendError,
} from '@/lib/messagingApi';
import type { Message } from '@/lib/messaging';
import type { ChatMediaActor } from '@/lib/chatMediaSend';
import { encodeVoiceContent } from '@/lib/voiceMessageMeta';

export type VoiceSendOptions = {
  preUploadedMediaUrl?: string | null;
  durationSec?: number;
};

export async function sendStaffVoiceMessage(
  actor: Extract<ChatMediaActor, { kind: 'staff' }>,
  localUri: string,
  resolvedConversationId?: string,
  opts?: VoiceSendOptions
): Promise<{ message: Message | null; error: string | null; conversationId: string }> {
  const convId =
    resolvedConversationId ??
    (await resolveStaffConversationIdForSend(actor.conversationId, actor.staffId));
  const content = encodeVoiceContent(opts?.durationSec ?? 1);
  try {
    const mediaUrl =
      opts?.preUploadedMediaUrl?.trim() || (await uploadVoiceMessageForStaff(localUri));
    const { data, error, conversationId } = await staffSendMessage(
      convId,
      actor.staffId,
      actor.staffName,
      actor.staffAvatar,
      content,
      'voice',
      mediaUrl,
      null,
      convId
    );
    if (error) return { message: null, error, conversationId };
    if (!data) return { message: null, error: 'voice_send_failed', conversationId };
    return { message: data, error: null, conversationId };
  } catch (e) {
    return {
      message: null,
      error: formatChatMessageSendError(e, 'Sesli mesaj gönderilemedi'),
      conversationId: convId,
    };
  }
}

export async function sendGuestVoiceMessage(
  actor: Extract<ChatMediaActor, { kind: 'guest' }>,
  localUri: string,
  resolvedConversationId?: string,
  opts?: VoiceSendOptions
): Promise<{ message: Message | null; error: string | null; conversationId: string }> {
  const convId = resolvedConversationId ?? actor.conversationId;
  const content = encodeVoiceContent(opts?.durationSec ?? 1);
  try {
    const mediaUrl =
      opts?.preUploadedMediaUrl?.trim() ||
      (await uploadVoiceMessageForGuest(actor.appToken, convId, localUri));
    const { messageId, conversationId: nextConvId } = await guestSendMessage(
      actor.appToken,
      convId,
      content,
      'voice',
      mediaUrl,
      null,
      convId
    );
    if (!messageId) {
      return { message: null, error: 'voice_send_failed', conversationId: nextConvId ?? convId };
    }
    const now = new Date().toISOString();
    const message: Message = {
      id: messageId,
      conversation_id: nextConvId ?? convId,
      sender_id: '',
      sender_type: 'guest',
      sender_name: null,
      sender_avatar: null,
      message_type: 'voice',
      content,
      media_url: mediaUrl,
      media_thumbnail: null,
      file_name: null,
      file_size: null,
      mime_type: 'audio/m4a',
      is_delivered: true,
      delivered_at: now,
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
    return { message, error: null, conversationId: nextConvId ?? convId };
  } catch (e) {
    return {
      message: null,
      error: formatChatMessageSendError(e, 'Sesli mesaj gönderilemedi'),
      conversationId: convId,
    };
  }
}
