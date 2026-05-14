/**
 * Sabit maliye QR token (tek QR mantigi).
 * QR hedefi (onerilen): Vercel statik `maliye.html` — tarayici Supabase `public-maliye` JSON API ile canli veri ceker.
 * Dogrudan Edge URL de kullanilabilir (tek HTML yaniti).
 */
export const FIXED_MALIYE_QR_TOKEN = 'valoria-maliye-qr';

/** Env yokken; kendi Vercel domain'inizle degistirin. */
export const FIXED_MALIYE_QR_URL_FALLBACK =
  'https://valoriahotel-el4r.vercel.app/maliye.html?token=valoria-maliye-qr';
