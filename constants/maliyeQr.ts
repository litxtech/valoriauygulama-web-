/**
 * Sabit maliye QR token (tek QR mantigi).
 * Statik portal: repo `netlify-maliye` — Vercel'de ayri proje (sozlesme klasoru degil).
 */
export const FIXED_MALIYE_QR_TOKEN = 'valoria-maliye-qr';

/** Env yokken; tam URL yerine Edge (QR yine calisir). Vercel maliye URL'ini app_settings ile verin. */
export const FIXED_MALIYE_QR_URL_FALLBACK =
  'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/public-maliye?token=valoria-maliye-qr';
