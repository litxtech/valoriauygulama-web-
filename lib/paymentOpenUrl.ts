import { PUBLIC_PAYMENT_PATH, PUBLIC_PAYMENT_QR_PATH } from '@/constants/publicWebPaths';
import { resolvePublicAppOrigin } from '@/lib/appPublicUrl';
import { supabaseUrl } from '@/lib/supabase';

export const PAYMENT_BRAND_NAME = 'Valoria Hotel';

export function paymentFunctionsBase(): string {
  const base = (supabaseUrl ?? '').replace(/\/$/, '');
  return `${base}/functions/v1`;
}

/** Misafire paylaşılan link tabanı — valoria.tr varsa Supabase yerine o kullanılır */
function paymentShareBase(): string | null {
  const origin = resolvePublicAppOrigin();
  if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) return null;
  return origin;
}

export function paymentRequestOpenUrl(publicToken: string): string {
  const q = `t=${encodeURIComponent(publicToken)}`;
  const pub = paymentShareBase();
  if (pub) return `${pub}/${PUBLIC_PAYMENT_PATH}?${q}`;
  return `${paymentFunctionsBase()}/open-payment?${q}`;
}

export function paymentQrStandOpenUrl(publicToken: string): string {
  const q = `t=${encodeURIComponent(publicToken)}`;
  const pub = paymentShareBase();
  if (pub) return `${pub}/${PUBLIC_PAYMENT_QR_PATH}?${q}`;
  return `${paymentFunctionsBase()}/open-payment-qr?${q}`;
}

/** Tek seferlik ödeme için paylaşım/QR: Stripe URL değil, Valoria köprü linki */
export function paymentShareUrl(publicToken: string, payUrl?: string | null): string {
  if (publicToken?.trim()) return paymentRequestOpenUrl(publicToken.trim());
  return payUrl?.trim() ?? '';
}
