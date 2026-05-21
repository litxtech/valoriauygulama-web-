import { buildPublicContractUrl } from '@/lib/appPublicUrl';

/**
 * Tüm sözleşme QR kodları bu tek URL'ye gider.
 * Admin tek QR, oda QR'ları, müşteri anahtar sayfası – hepsi aynı link.
 */
export const FIXED_CONTRACT_QR_URL = buildPublicContractUrl();
