import { supabaseUrl } from '@/lib/supabase';
import { DEFAULT_PUBLIC_APP_ORIGIN } from '@/constants/appOrigin';
import { PUBLIC_PAYMENT_QR_PATH } from '@/constants/publicWebPaths';

export const PAYMENT_BRAND_NAME = 'Valoria Hotel';

function paymentFunctionsBase(): string {
  const base = (supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  return base ? `${base}/functions/v1` : '';
}

function paymentPublicGuestBase(baseOverride?: string | null): string {
  const raw = (baseOverride ?? process.env.EXPO_PUBLIC_APP_URL ?? DEFAULT_PUBLIC_APP_ORIGIN).trim().replace(/\/$/, '');
  if (!raw || raw.includes('supabase.co')) return '';
  return raw;
}

/** Tek seferlik ödeme — Supabase Edge → Stripe */
export function paymentRequestOpenUrl(publicToken: string, _baseOverride?: string | null): string {
  const base = paymentFunctionsBase();
  if (!base) return '';
  const q = `t=${encodeURIComponent(publicToken.trim())}`;
  return `${base}/open-payment?${q}`;
}

/** Sabit / serbest QR — valoria.tr köprüsü (Vercel proxy); yedek: doğrudan Edge */
export function paymentQrStandOpenUrl(publicToken: string, baseOverride?: string | null): string {
  const q = `t=${encodeURIComponent(publicToken.trim())}`;
  const publicBase = paymentPublicGuestBase(baseOverride);
  if (publicBase) return `${publicBase}/${PUBLIC_PAYMENT_QR_PATH}?${q}`;
  const base = paymentFunctionsBase();
  if (!base) return '';
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
