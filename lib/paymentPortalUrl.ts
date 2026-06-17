import { supabaseUrl } from '@/lib/supabase';
import { resolveShareablePublicOrigin } from '@/lib/appPublicUrl';
import {
  LEGACY_PAYMENT_PATH,
  LEGACY_PAYMENT_QR_PATH,
  PUBLIC_PAYMENT_PATH,
  PUBLIC_PAYMENT_QR_PATH,
} from '@/constants/publicWebPaths';

export type PaymentEdgeFunction = 'open-payment' | 'open-payment-qr';

export function buildPaymentEdgeBase(edgeFunction: PaymentEdgeFunction): string {
  const base = (supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!base) return '';
  return `${base}/functions/v1/${edgeFunction}`;
}

/** Tarayıcı yönlendirmesi — sorgu dizesi (?t=…) korunur */
export function buildPaymentEdgeUrl(edgeFunction: PaymentEdgeFunction, search?: string): string {
  const edgeBase = buildPaymentEdgeBase(edgeFunction);
  if (!edgeBase) return '';
  const raw = (search ?? '').trim();
  if (!raw) return edgeBase;
  return raw.startsWith('?') ? `${edgeBase}${raw}` : `${edgeBase}?${raw.replace(/^\?/, '')}`;
}

export function buildPaymentWebBridgeUrl(kind: 'single' | 'qr', token?: string): string {
  const base = resolveShareablePublicOrigin();
  const path = kind === 'qr' ? PUBLIC_PAYMENT_QR_PATH : PUBLIC_PAYMENT_PATH;
  const t = token?.trim();
  return t ? `${base}/${path}?t=${encodeURIComponent(t)}` : `${base}/${path}`;
}

function paymentBridgePathFromPathname(pathname: string): string {
  const p = (pathname || '').replace(/\/$/, '') || '/';
  if (p === `/${PUBLIC_PAYMENT_QR_PATH}` || p === `/${LEGACY_PAYMENT_QR_PATH}`) {
    return PUBLIC_PAYMENT_QR_PATH;
  }
  if (p === `/${LEGACY_PAYMENT_PATH}`) {
    return LEGACY_PAYMENT_PATH;
  }
  return PUBLIC_PAYMENT_PATH;
}

/** Misafir köprüsü — valoria.tr/payment/qr?t=… (Vercel → Edge → Stripe) */
export function buildPaymentPublicBridgeUrl(pathname: string, search?: string): string {
  const base = resolveShareablePublicOrigin();
  const path = paymentBridgePathFromPathname(pathname);
  const q = (search ?? '').trim();
  if (!q) return `${base}/${path}`;
  return `${base}/${path}${q.startsWith('?') ? q : `?${q.replace(/^\?/, '')}`}`;
}

export function paymentPublicBridgeFromToken(kind: 'single' | 'qr', token?: string | null): string {
  const path =
    kind === 'qr'
      ? PUBLIC_PAYMENT_QR_PATH
      : PUBLIC_PAYMENT_PATH;
  const base = resolveShareablePublicOrigin();
  const t = token?.trim();
  return t ? `${base}/${path}?t=${encodeURIComponent(t)}` : `${base}/${path}`;
}

export function isPaymentPublicPath(pathname: string): boolean {
  const p = (pathname || '').replace(/\/$/, '') || '/';
  return (
    p === `/${PUBLIC_PAYMENT_PATH}` ||
    p === `/${PUBLIC_PAYMENT_QR_PATH}` ||
    p === `/${LEGACY_PAYMENT_PATH}` ||
    p === `/${LEGACY_PAYMENT_QR_PATH}`
  );
}

export function resolvePaymentEdgeFunctionFromPath(pathname: string): PaymentEdgeFunction | null {
  const p = (pathname || '').replace(/\/$/, '') || '/';
  if (p === `/${PUBLIC_PAYMENT_QR_PATH}` || p === `/${LEGACY_PAYMENT_QR_PATH}`) {
    return 'open-payment-qr';
  }
  if (p === `/${PUBLIC_PAYMENT_PATH}` || p === `/${LEGACY_PAYMENT_PATH}`) {
    return 'open-payment';
  }
  return null;
}
