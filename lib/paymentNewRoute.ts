import { Platform } from 'react-native';
import type { Href } from 'expo-router';
import { PAYMENT_SERVICE_KINDS, type PaymentServiceKind } from '@/lib/paymentsI18n';

export type PublicPaymentQrMode = 'standing' | 'standing_variable';
export type PaymentNewQrMode = 'single' | 'standing' | 'standing_variable';

function firstSearchParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export function parsePaymentNewMode(raw: string | string[] | undefined): PaymentNewQrMode | undefined {
  const m = firstSearchParam(raw);
  if (m === 'standing' || m === 'standing_variable' || m === 'single') return m;
  return undefined;
}

export function parsePaymentNewKind(raw: string | string[] | undefined): PaymentServiceKind | undefined {
  const k = firstSearchParam(raw);
  if (!k) return undefined;
  return PAYMENT_SERVICE_KINDS.includes(k as PaymentServiceKind) ? (k as PaymentServiceKind) : undefined;
}

/** valoria.tr — personel ödeme QR oluşturma (sabit / serbest) */
export function publicPaymentNewHref(
  mode: PublicPaymentQrMode,
  opts?: { admin?: boolean; serviceKind?: string }
): Href {
  const kind = opts?.serviceKind ?? 'food';
  if (Platform.OS === 'web') {
    return `/payment/new?mode=${encodeURIComponent(mode)}&kind=${encodeURIComponent(kind)}` as Href;
  }
  const base = opts?.admin ? '/admin/payments/new' : '/staff/payments/new';
  return { pathname: base, params: { mode, kind } } as Href;
}
