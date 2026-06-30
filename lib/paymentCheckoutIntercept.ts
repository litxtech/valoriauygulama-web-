import * as Linking from 'expo-linking';

export type PaymentCheckoutReturnHit = {
  status: 'success' | 'cancel';
  id?: string;
  token?: string;
};

function pickQueryParam(
  params: Record<string, string | string[] | undefined> | null | undefined,
  key: string
): string | undefined {
  const raw = params?.[key];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0];
  return undefined;
}

/** Stripe Checkout WebView — success/cancel yönlendirmesini yakala. */
export function parsePaymentCheckoutReturnUrl(url: string): PaymentCheckoutReturnHit | null {
  const raw = url.trim();
  if (!raw) return null;

  const looksLikeReturn =
    /valoria:\/\/payment\/(success|cancel)/i.test(raw) ||
    /\/payment\/(success|cancel)/i.test(raw) ||
    /payment-return/i.test(raw) ||
    (/status=(success|cancel)/i.test(raw) && /[?&]id=/i.test(raw));

  if (!looksLikeReturn) return null;

  try {
    if (/payment-return/i.test(raw)) {
      const parsed = new URL(raw);
      const status = parsed.searchParams.get('status') === 'cancel' ? 'cancel' : 'success';
      return {
        status,
        id: parsed.searchParams.get('id') ?? undefined,
        token: parsed.searchParams.get('token') ?? undefined,
      };
    }

    const parsed = Linking.parse(raw);
    const path = String(parsed.path ?? '').replace(/^\/+/, '');
    const status =
      path.startsWith('payment/cancel') || /\/cancel/i.test(raw) || /status=cancel/i.test(raw)
        ? 'cancel'
        : 'success';

    return {
      status,
      id: pickQueryParam(parsed.queryParams, 'id'),
      token: pickQueryParam(parsed.queryParams, 'token'),
    };
  } catch {
    return null;
  }
}
