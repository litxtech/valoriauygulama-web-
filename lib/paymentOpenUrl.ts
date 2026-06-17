import { supabaseUrl } from '@/lib/supabase';

export const PAYMENT_BRAND_NAME = 'Valoria Hotel';

function paymentFunctionsBase(): string {
  const base = (supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  return base ? `${base}/functions/v1` : '';
}

/** Tek seferlik ödeme — Supabase Edge → Stripe */
export function paymentRequestOpenUrl(publicToken: string, _baseOverride?: string | null): string {
  const base = paymentFunctionsBase();
  if (!base) return '';
  const q = `t=${encodeURIComponent(publicToken.trim())}`;
  return `${base}/open-payment?${q}`;
}

/** Sabit QR — Supabase Edge → Stripe */
export function paymentQrStandOpenUrl(publicToken: string, _baseOverride?: string | null): string {
  const base = paymentFunctionsBase();
  if (!base) return '';
  const q = `t=${encodeURIComponent(publicToken.trim())}`;
  return `${base}/open-payment-qr?${q}`;
}

/** Paylaşım / QR: doğrudan Supabase Edge linki */
export function paymentShareUrl(
  publicToken: string,
  payUrl?: string | null,
  _baseOverride?: string | null
): string {
  if (publicToken?.trim()) return paymentRequestOpenUrl(publicToken.trim());
  const fallback = payUrl?.trim() ?? '';
  if (!fallback || fallback.includes('checkout.stripe.com')) return '';
  return fallback;
}
