/** Canlı web QR yolları — ASCII (tüm tarayıcı / QR okuyucu uyumu) */
export const PUBLIC_MENU_PATH = 'menu';
export const PUBLIC_CONTRACT_PATH = 'sozlesme';
export const PUBLIC_MALIYE_PATH = 'maliye';
/** Misafire paylaşılan Stripe köprü linki — valoria.tr/payment?t=… */
export const PUBLIC_PAYMENT_PATH = 'payment';
/** Sabit ödeme QR — valoria.tr/payment/qr?t=… */
export const PUBLIC_PAYMENT_QR_PATH = 'payment/qr';
/** Eski Türkçe yol — Vercel yönlendirmesi ile desteklenir */
export const LEGACY_PAYMENT_PATH = 'odeme';
export const LEGACY_PAYMENT_QR_PATH = 'odeme/qr';

/** Basılı eski QR’lar (Türkçe segment) — uygulama yönlendirme ile destekler */
export const LEGACY_MENU_PATH_TR = 'menü';
export const LEGACY_CONTRACT_PATH_TR = 'sözleşme';

/** Eski derin link */
export const LEGACY_MENU_PATH = 'menu';
export const LEGACY_CONTRACT_PATH = 'guest/sign-one';

export const DEFAULT_CONTRACT_QR_TOKEN = 'valoria-resepsiyon-qr';
export const DEFAULT_CONTRACT_QR_LANG = 'tr';

/** Ayarlardaki /sözleşme base URL → /sozlesme */
export function normalizePublicContractBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/$/, '');
  if (!trimmed) return trimmed;
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    decoded = trimmed;
  }
  if (/\/sözleşme$/iu.test(decoded) || /\/sozlesme$/iu.test(decoded)) {
    return trimmed.replace(/\/sözleşme$/iu, '/sozlesme').replace(/\/s%C3%B6zle%C5%9Fme$/iu, '/sozlesme');
  }
  return trimmed;
}
