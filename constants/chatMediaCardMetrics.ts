/** Sohbet video / resim kartı — ortak boyutlar */
export const CHAT_MEDIA_CARD_MAX_W = 300;
export const CHAT_MEDIA_CARD_MIN_W = 268;
export const CHAT_MEDIA_CARD_WIDTH_RATIO = 0.76;
export const CHAT_MEDIA_CARD_GAP = 3;
export const CHAT_MEDIA_CARD_RADIUS = 16;

export function getChatMediaCardWidth(windowWidth: number): number {
  return Math.min(
    CHAT_MEDIA_CARD_MAX_W,
    Math.max(CHAT_MEDIA_CARD_MIN_W, Math.round(windowWidth * CHAT_MEDIA_CARD_WIDTH_RATIO))
  );
}
