import { resolveShareablePublicOrigin } from '@/lib/appPublicUrl';
import {
  PUBLIC_PAYMENT_PATH,
  PUBLIC_PAYMENT_QR_PATH,
} from '@/constants/publicWebPaths';

export const PAYMENT_BRAND_NAME = 'Valoria Hotel';

function paymentPublicBase(baseOverride?: string | null): string {
  return resolveShareablePublicOrigin(baseOverride);
}

/** Tek seferlik ödeme köprüsü — valoria.tr/payment?t=… */
export function paymentRequestOpenUrl(publicToken: string, baseOverride?: string | null): string {
  const q = `t=${encodeURIComponent(publicToken.trim())}`;
  return `${paymentPublicBase(baseOverride)}/${PUBLIC_PAYMENT_PATH}?${q}`;
}

/** Sabit QR köprüsü — valoria.tr/payment/qr?t=… */
export function paymentQrStandOpenUrl(publicToken: string, baseOverride?: string | null): string {
  const q = `t=${encodeURIComponent(publicToken.trim())}`;
  return `${paymentPublicBase(baseOverride)}/${PUBLIC_PAYMENT_QR_PATH}?${q}`;
}

/** Tek seferlik ödeme için paylaşım/QR: Stripe URL değil, Valoria köprü linki */
export function paymentShareUrl(
  publicToken: string,
  payUrl?: string | null,
  baseOverride?: string | null
): string {
  if (publicToken?.trim()) return paymentRequestOpenUrl(publicToken.trim(), baseOverride);
  return payUrl?.trim() ?? '';
}
