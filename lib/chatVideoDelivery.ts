/** Sohbet videosu: sıkıştırma + Mux PUT (büyük dosyalar için geniş süre). */
export const CHAT_VIDEO_DELIVERY_TIMEOUT_MS = 600_000;

export const CHAT_VIDEO_DELIVERY_TIMEOUT_MESSAGE =
  'Video gönderilemedi. Bağlantınızı kontrol edip tekrar deneyin.';

export function withChatVideoDeliveryTimeout<T>(
  promise: Promise<T>,
  message = CHAT_VIDEO_DELIVERY_TIMEOUT_MESSAGE
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), CHAT_VIDEO_DELIVERY_TIMEOUT_MS);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

export function isChatVideoUploadStale(startedAt: number | undefined, now = Date.now()): boolean {
  if (!startedAt) return false;
  return now - startedAt > CHAT_VIDEO_DELIVERY_TIMEOUT_MS;
}
