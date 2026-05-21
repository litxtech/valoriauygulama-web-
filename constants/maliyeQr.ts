import { buildPublicMaliyeUrl } from '@/lib/appPublicUrl';

/**
 * Sabit maliye QR token (tek QR mantigi).
 */
export const FIXED_MALIYE_QR_TOKEN = 'valoria-maliye-qr';

/** valoria.tr/maliye (yoksa Edge yedek) */
export const FIXED_MALIYE_QR_URL_FALLBACK = buildPublicMaliyeUrl(FIXED_MALIYE_QR_TOKEN);
