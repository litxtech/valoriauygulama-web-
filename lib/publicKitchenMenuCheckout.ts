import { supabase } from '@/lib/supabase';
import { getEdgeFunctionErrorMessage, parseEdgeFunctionErrorBody } from '@/lib/functionsError';
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
      return t('publicKitchenMenuErrEdgeDeploy');
    default:
      if (/Function not found|404|not found/i.test(msg)) {
        return t('publicKitchenMenuErrEdgeDeploy');
      }
      if (/non-2xx|2xx status/i.test(msg)) {
        return t('publicKitchenMenuCheckoutError');
      }
      return msg || t('publicKitchenMenuCheckoutError');
  }
}

export async function checkoutPublicKitchenMenu(
  input: PublicMenuCheckoutInput
): Promise<PublicMenuCheckoutResult> {
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

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const { data, error } = await supabase.functions.invoke('create-public-kitchen-menu-payment', {
    body,
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  });

  const payloadErr = readPayloadError(data);
  if (payloadErr?.error) {
    throw new Error(mapPublicMenuCheckoutError(payloadErr.error_code, payloadErr.error));
  }

  if (error) {
    const parsed = await parseEdgeFunctionErrorBody(error);
    const rawMsg = parsed?.message ?? (await getEdgeFunctionErrorMessage(error));
    throw new Error(mapPublicMenuCheckoutError(parsed?.code ?? payloadErr?.error_code, rawMsg));
  }

  const payload = data as PublicMenuCheckoutResult & CheckoutErrorPayload;
  if (payload?.error) {
    throw new Error(mapPublicMenuCheckoutError(payload.error_code, payload.error));
  }
  if (!payload?.pay_url) {
    throw new Error(i18n.t('publicKitchenMenuCheckoutError'));
  }
  return payload;
}
