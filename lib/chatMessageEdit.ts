import { isPersistedChatMessageId } from '@/lib/messagingApi';
import type { Message, ParticipantType } from '@/lib/messaging';

export function isChatMessageEditable(
  msg: Message,
  opts?: { ownSenderId?: string; ownSenderType?: ParticipantType }
): boolean {
  if (msg.is_deleted || msg.message_type !== 'text') return false;
  if (!isPersistedChatMessageId(msg.id)) return false;
  if (opts?.ownSenderId) return msg.sender_id === opts.ownSenderId;
  if (opts?.ownSenderType) return msg.sender_type === opts.ownSenderType;
  return false;
}
