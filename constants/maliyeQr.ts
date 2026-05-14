/**
 * Sabit maliye QR token (tek QR mantigi).
 * QR URL: Vercel maliye.html veya dogrudan public-maliye — misafir sozlesmesi (public-contract) ile karistirilmamali.
 */
export const FIXED_MALIYE_QR_TOKEN = 'valoria-maliye-qr';

/** Env yokken; kendi Vercel domain'inizle degistirin. */
export const FIXED_MALIYE_QR_URL_FALLBACK =
  'https://valoriahotel-el4r.vercel.app/maliye.html?token=valoria-maliye-qr';
