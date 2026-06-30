import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase';
import i18n from '@/i18n';

export type PublicMenuCheckoutLine = { menu_item_id: string; quantity: number };

export type PublicMenuCheckoutInput = {
  orgSlug: string;
  items: PublicMenuCheckoutLine[];
  customerName: string;
  customerEmail?: string;
  roomNumber?: string;
  tableNumber?: string;
  guestHotelName?: string;
  deliveryLat?: number;
  deliveryLng?: number;
  deliveryAddress?: string;
  lang: string;
  /** Oturum varsa misafir kaydı siparişe bağlanır; yoksa anon devam eder. */
  accessToken?: string | null;
};

export type PublicMenuCheckoutResult = {
  order_id: string;
  payment_request_id: string;
  pay_url: string;
  amount: number;
  currency: string;
  status: string;
};

type CheckoutErrorPayload = {
  error?: string;
  error_code?: string;
  message?: string;
};

function edgeBaseUrl(): string {
  return (supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
}

function anonKey(): string {
  return supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
}

function readPayloadError(data: unknown): CheckoutErrorPayload | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const row = data as CheckoutErrorPayload;
  if (typeof row.error === 'string' || typeof row.error_code === 'string') return row;
  if (typeof row.message === 'string') return { error: row.message };
  return null;
}

/** Edge 4xx/5xx gövdesini misafire anlaşılır mesaja çevirir (aktif menü dili) */
export function mapPublicMenuCheckoutError(code: string | undefined, message: string): string {
  const msg = message.trim();
  const t = (key: string) => i18n.t(key);
  switch (code) {
    case 'EMAIL_REQUIRED':
      return t('publicKitchenMenuEmailRequired');
    case 'NAME_REQUIRED':
      return t('publicKitchenMenuNameRequired');
    case 'CART_EMPTY':
      return t('publicKitchenMenuCartEmpty');
    case 'ITEM_UNAVAILABLE':
      return t('publicKitchenMenuErrItemUnavailable');
    case 'MENU_DISABLED':
      return t('publicKitchenMenuErrMenuDisabled');
    case 'TABLE_REQUIRED':
      return t('publicKitchenMenuTableRequired');
    case 'ROOM_REQUIRED':
      return t('publicKitchenMenuRoomRequired');
    case 'INVALID_SLUG':
      return t('publicKitchenMenuNotFoundBody');
    case 'STRIPE_ERROR':
    case 'STRIPE_SESSION':
      if (/STRIPE_SECRET_KEY|yapılandırılmamış/i.test(msg)) {
        return t('publicKitchenMenuErrStripeConfig');
      }
      return msg || t('publicKitchenMenuErrStripe');
    case 'ORDER_INSERT':
    case 'ITEMS_INSERT':
      if (/kitchen_menu_orders|does not exist|schema cache/i.test(msg)) {
        return t('publicKitchenMenuErrOrderTable');
      }
      return msg || t('publicKitchenMenuErrOrder');
    case 'PAYMENT_INSERT':
      return msg || t('publicKitchenMenuErrPayment');
    case 'EDGE_DEPLOY':
    case 'EDGE_CRASH':
      return t('publicKitchenMenuErrEdgeDeploy');
    default:
      if (/Function not found|404|not found/i.test(msg)) {
        return t('publicKitchenMenuErrEdgeDeploy');
      }
      if (/server_unavailable|522|524|503/i.test(msg)) {
        return t('publicKitchenMenuCheckoutError');
      }
      return msg || t('publicKitchenMenuCheckoutError');
  }
}

async function parseCheckoutResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text.slice(0, 300), error_code: res.ok ? undefined : 'EDGE_HTTP' };
  }
}

/**
 * Web QR menü — doğrudan fetch (supabase.invoke "non-2xx" sarmalayıcısı yok).
 * Yanıt gövdesi her durumda JSON olarak okunur; gerçek hata mesajı kullanıcıya iletilir.
 */
export async function checkoutPublicKitchenMenu(
  input: PublicMenuCheckoutInput
): Promise<PublicMenuCheckoutResult> {
  const base = edgeBaseUrl();
  const key = anonKey();
  if (!base || !key) {
    throw new Error(mapPublicMenuCheckoutError('EDGE_DEPLOY', 'Supabase yapılandırması eksik'));
  }

  const body = {
    org_slug: input.orgSlug,
    items: input.items,
    customer_name: input.customerName,
    customer_email: input.customerEmail?.trim() || null,
    room_number: input.roomNumber?.trim() || null,
    table_number: input.tableNumber?.trim() || null,
    guest_hotel_name: input.guestHotelName?.trim() || null,
    delivery_lat: input.deliveryLat ?? null,
    delivery_lng: input.deliveryLng ?? null,
    delivery_address: input.deliveryAddress?.trim() || null,
    lang: input.lang,
  };

  const bearer = input.accessToken?.trim() || key;
  const res = await fetch(`${base}/functions/v1/create-public-kitchen-menu-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearer}`,
      apikey: key,
    },
    body: JSON.stringify(body),
  });

  const data = await parseCheckoutResponse(res);
  const payloadErr = readPayloadError(data);

  if (!res.ok || payloadErr?.error) {
    throw new Error(
      mapPublicMenuCheckoutError(
        payloadErr?.error_code,
        payloadErr?.error || payloadErr?.message || `HTTP ${res.status}`
      )
    );
  }

  const payload = data as PublicMenuCheckoutResult & CheckoutErrorPayload;
  if (!payload?.pay_url) {
    throw new Error(i18n.t('publicKitchenMenuCheckoutError'));
  }
  return payload;
}

export type ConfirmPublicMenuPaymentInput = {
  orgSlug: string;
  paymentRequestId: string;
  publicToken: string;
  orderId?: string;
};

export type ConfirmPublicMenuPaymentResult = {
  ok: boolean;
  order_id: string;
  status: string;
  skipped?: string;
};

/** Stripe dönüşünde webhook gecikirse ödemeyi doğrula ve siparişi paid yap. */
export async function confirmPublicKitchenMenuPayment(
  input: ConfirmPublicMenuPaymentInput
): Promise<ConfirmPublicMenuPaymentResult> {
  const base = edgeBaseUrl();
  const key = anonKey();
  if (!base || !key) {
    throw new Error(mapPublicMenuCheckoutError('EDGE_DEPLOY', 'Supabase yapılandırması eksik'));
  }

  const res = await fetch(`${base}/functions/v1/confirm-public-kitchen-menu-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    body: JSON.stringify({
      payment_request_id: input.paymentRequestId,
      public_token: input.publicToken,
      org_slug: input.orgSlug,
      order_id: input.orderId ?? null,
    }),
  });

  const data = await parseCheckoutResponse(res);
  const payloadErr = readPayloadError(data);

  if (!res.ok || payloadErr?.error) {
    throw new Error(
      mapPublicMenuCheckoutError(
        payloadErr?.error_code,
        payloadErr?.error || payloadErr?.message || `HTTP ${res.status}`
      )
    );
  }

  const payload = data as ConfirmPublicMenuPaymentResult & CheckoutErrorPayload;
  if (!payload?.order_id) {
    throw new Error(i18n.t('publicKitchenMenuCheckoutError'));
  }
  return payload;
}
