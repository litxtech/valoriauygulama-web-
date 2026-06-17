import { supabaseUrl } from '@/lib/supabase';

export const PAYMENT_BRAND_NAME = 'Valoria Hotel';

export function paymentFunctionsBase(): string {
  const base = (supabaseUrl ?? '').replace(/\/$/, '');
  return `${base}/functions/v1`;
}

/** Ödeme köprüsü — doğrudan Supabase Edge (valoria.tr proxy güvenilir değil). */
export function paymentRequestOpenUrl(publicToken: string): string {
  const q = `t=${encodeURIComponent(publicToken)}`;
  return `${paymentFunctionsBase()}/open-payment?${q}`;
}

export function paymentQrStandOpenUrl(publicToken: string): string {
  const q = `t=${encodeURIComponent(publicToken)}`;
  return `${paymentFunctionsBase()}/open-payment-qr?${q}`;
}

/** Tek seferlik ödeme için paylaşım/QR: Stripe URL değil, Valoria köprü linki */
export function paymentShareUrl(publicToken: string, payUrl?: string | null): string {
  if (publicToken?.trim()) return paymentRequestOpenUrl(publicToken.trim());
  return payUrl?.trim() ?? '';
}
