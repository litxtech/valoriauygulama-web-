import i18n from '@/i18n';
import type { MessageType } from '@/lib/messaging';

function mediaLabels(): Record<string, string> {
  return {
    image: i18n.t('staffReplyPhoto'),
    video: i18n.t('staffChatListMediaVideo'),
    voice: i18n.t('staffChatListMediaVoice'),
    file: i18n.t('staffChatListMediaFile'),
    location: i18n.t('staffChatListMediaLocation'),
    screenshot_notice: i18n.t('staffChatListMediaScreenshot'),
  };
}

/** Son mesaj önizlemesi — Telegram tarzı kısa etiketler. */
export function formatChatListPreview(
  preview: string | null | undefined,
  messageType?: string | null,
  opts?: { isReply?: boolean; unreadCount?: number }
): string {
  const labels = mediaLabels();
  if (opts?.isReply || preview?.startsWith('↩')) {
    return preview?.trim() || i18n.t('staffChatListReplied');
  }
  const trimmed = (preview ?? '').trim();
  if (trimmed) {
    const lower = trimmed.toLowerCase();
    if (lower.includes('foto') || lower === 'photo') return labels.image;
    if (lower.includes('video')) return labels.video;
    if (lower.includes('ses') || lower.includes('voice')) return labels.voice;
    return trimmed;
  }
  if (messageType && labels[messageType]) return labels[messageType];
  return '';
}

export function formatUnreadPreview(count: number): string {
  if (count <= 0) return '';
  return count === 1 ? i18n.t('staffChatUnreadOne') : i18n.t('staffChatUnreadMany', { count });
}

export function inferMessageTypeFromPreview(preview: string | null | undefined): MessageType | null {
  if (!preview) return null;
  const p = preview.toLowerCase();
  if (p.includes('foto') || p === 'photo' || p.includes('📷')) return 'image';
  if (p.includes('video') || p.includes('🎥')) return 'video';
  if (p.includes('ses') || p.includes('voice') || p.includes('🎙')) return 'voice';
  return null;
}

/** Yanıt önizlemesi (girdi çubuğu / alıntı şeridi). */
export function formatReplyMessagePreview(messageType: string, content?: string | null): string {
  if (messageType === 'text') return (content ?? '').trim().slice(0, 120);
  if (messageType === 'image') return i18n.t('staffReplyPhoto');
  if (messageType === 'video') return i18n.t('staffChatPreviewVideo');
  if (messageType === 'voice') return i18n.t('staffChatPreviewVoice');
  return i18n.t('staffChatPreviewMessage');
}

/** Alıntı şeridi — daha kısa ses etiketi. */
export function formatQuotedReplyPreview(messageType: string, content?: string | null): string {
  if (messageType === 'text') return (content ?? '').trim().slice(0, 80);
  if (messageType === 'image') return i18n.t('staffReplyPhoto');
  if (messageType === 'video') return i18n.t('staffChatPreviewVideo');
  if (messageType === 'voice') return i18n.t('staffChatPreviewVoiceShort');
  return i18n.t('staffChatPreviewMessage');
}
