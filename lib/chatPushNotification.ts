/**
 * Valoria — sohbet push bildirimi başlık/gövde (WhatsApp / iMessage tarzı).
 * Doğrudan sohbet: başlık = gönderen, gövde = mesaj.
 * Grup: başlık = grup adı, alt başlık = gönderen, gövde = mesaj.
 */
import i18n from '@/i18n';

const PREVIEW_MAX = 120;

export function truncateChatPushPreview(text: string, max = PREVIEW_MAX): string {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return '';
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export type ChatPushCopy = {
  title: string;
  body: string;
  subtitle?: string;
};

export function buildChatMessagePushCopy(params: {
  senderDisplayName: string;
  messagePreview: string;
  conversationTitle?: string | null;
  isGroup?: boolean;
}): ChatPushCopy {
  const sender = (params.senderDisplayName ?? '').trim() || i18n.t('guestDefaultName');
  const preview =
    truncateChatPushPreview(params.messagePreview) || i18n.t('chatPushPreviewFallback');
  const convTitle = (params.conversationTitle ?? '').trim();
  const isGroup = Boolean(params.isGroup);

  if (isGroup && convTitle) {
    return {
      title: convTitle,
      subtitle: sender,
      body: preview,
    };
  }

  // Birebir sohbet: yalnızca gönderen + mesaj (subtitle = karşı taraf adı olur, alıcıda yanlış görünür).
  return {
    title: sender,
    body: preview,
  };
}

export function buildChatMentionPushCopy(params: {
  senderDisplayName: string;
  messagePreview: string;
  conversationTitle?: string | null;
  isGroup?: boolean;
}): ChatPushCopy {
  const preview = truncateChatPushPreview(params.messagePreview);
  const sender = (params.senderDisplayName ?? '').trim() || i18n.t('guestDefaultName');
  const body = i18n.t('chatMentionPushBody', {
    name: sender,
    preview: preview || '…',
  });
  const base = buildChatMessagePushCopy({
    ...params,
    messagePreview: body,
  });
  return { ...base, body };
}

export type ChatMediaKind = 'photo' | 'video' | 'voice' | 'file' | 'screenshot';

const MEDIA_BODY_KEYS: Record<ChatMediaKind, string> = {
  photo: 'staffChatPhotoSentBody',
  video: 'staffChatVideoSentBody',
  voice: 'staffChatVoiceSentBody',
  file: 'staffChatListMediaFile',
  screenshot: 'chatScreenshotNotice',
};

export function buildChatMediaPushCopy(params: {
  senderDisplayName: string;
  kind: ChatMediaKind;
  conversationTitle?: string | null;
  isGroup?: boolean;
}): ChatPushCopy {
  const sender = (params.senderDisplayName ?? '').trim() || i18n.t('guestDefaultName');
  const mediaLabel =
    params.kind === 'screenshot'
      ? i18n.t(MEDIA_BODY_KEYS.screenshot, { name: sender })
      : i18n.t(MEDIA_BODY_KEYS[params.kind]);
  return buildChatMessagePushCopy({
    senderDisplayName: sender,
    messagePreview: mediaLabel,
    conversationTitle: params.conversationTitle,
    isGroup: params.isGroup,
  });
}

/** Edge push + ön plan toast için ortak data alanları. */
export function chatPushDataExtras(params: {
  conversationId: string;
  senderDisplayName: string;
  messagePreview?: string;
  messageId?: string;
  isGroup?: boolean;
  subtitle?: string;
  url?: string;
  notificationType?: string;
}): Record<string, unknown> {
  const sender = (params.senderDisplayName ?? '').trim();
  const preview = truncateChatPushPreview(params.messagePreview ?? '');
  return {
    conversationId: params.conversationId,
    senderName: sender,
    senderDisplayName: sender,
    isGroupChat: Boolean(params.isGroup),
    ...(preview ? { messagePreview: preview, messageBody: preview } : {}),
    ...(params.messageId ? { messageId: params.messageId } : {}),
    ...(params.subtitle ? { pushSubtitle: params.subtitle } : {}),
    ...(params.url ? { url: params.url } : {}),
    notificationType: params.notificationType ?? 'chat_message',
    threadId: params.conversationId,
  };
}
