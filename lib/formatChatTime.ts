/** Sohbet mesaj saatleri — her zaman Türkiye (Europe/Istanbul). */

export const CHAT_TIMEZONE = 'Europe/Istanbul';
const TR_LOCALE = 'tr-TR';

export function formatChatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(TR_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: CHAT_TIMEZONE,
  });
}

export function formatChatMessageDateTime(iso: string): string {
  return new Date(iso).toLocaleString(TR_LOCALE, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: CHAT_TIMEZONE,
  });
}
