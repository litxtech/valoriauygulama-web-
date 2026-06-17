import { supabaseUrl } from '@/lib/supabase';
import {
  LEGACY_PAYMENT_PATH,
  LEGACY_PAYMENT_QR_PATH,
  PUBLIC_PAYMENT_PATH,
  PUBLIC_PAYMENT_QR_PATH,
} from '@/constants/publicWebPaths';
import {
  paymentQrStandOpenUrl,
  paymentRequestOpenUrl,
} from '@/lib/paymentOpenUrl';

export type PaymentEdgeFunction = 'open-payment' | 'open-payment-qr';

export function buildPaymentEdgeBase(edgeFunction: PaymentEdgeFunction): string {
  const base = (supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!base) return '';
  return `${base}/functions/v1/${edgeFunction}`;
}

/** Supabase Edge tam URL — misafir / QR paylaşımı */
export function buildPaymentEdgeUrl(edgeFunction: PaymentEdgeFunction, search?: string): string {
  const edgeBase = buildPaymentEdgeBase(edgeFunction);
  if (!edgeBase) return '';
  const raw = (search ?? '').trim();
  if (!raw) return edgeBase;
  return raw.startsWith('?') ? edgeBase + raw : `${edgeBase}?${raw.replace(/^\?/, '')}`;
}

/** Eski valoria.tr /payment yolları → Supabase Edge (Unmatched Route önlemi) */
export function navigateToPaymentBridge(pathname: string, search?: string): void {
  if (typeof window === 'undefined') return;
  const fn = resolvePaymentEdgeFunctionFromPath(pathname);
  if (!fn) return;
  const target = buildPaymentEdgeUrl(fn, search);
  if (!target) return;
  window.location.replace(target);
}

export function buildPaymentWebBridgeUrl(kind: 'single' | 'qr', token?: string): string {
  const t = token?.trim();
  return kind === 'qr'
    ? paymentQrStandOpenUrl(t ?? '')
    : paymentRequestOpenUrl(t ?? '');
}

export function buildPaymentPublicBridgeUrl(pathname: string, search?: string): string {
  const fn = resolvePaymentEdgeFunctionFromPath(pathname);
  if (!fn) return '';
  return buildPaymentEdgeUrl(fn, search);
}

export function paymentPublicBridgeFromToken(kind: 'single' | 'qr', token?: string | null): string {
  const t = token?.trim();
  return kind === 'qr' ? paymentQrStandOpenUrl(t ?? '') : paymentRequestOpenUrl(t ?? '');
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
