import { supabase } from '@/lib/supabase';
import { invokeEdgeWithAuth } from '@/lib/invokeEdgeWithAuth';

export type PublicMenuCheckoutLine = { menu_item_id: string; quantity: number };

export type PublicMenuCheckoutInput = {
  orgSlug: string;
  items: PublicMenuCheckoutLine[];
  customerName: string;
  customerEmail?: string;
  roomNumber?: string;
  tableNumber?: string;
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
    lang: input.lang,
  };

  const { data: sessionData } = await supabase.auth.getSession();
  const hasSession = Boolean(sessionData.session?.access_token);

  const { data, error } = hasSession
    ? await invokeEdgeWithAuth('create-public-kitchen-menu-payment', body)
    : await supabase.functions.invoke('create-public-kitchen-menu-payment', { body });

  if (error) {
    throw new Error(error.message || 'Checkout failed');
  }

  const payload = data as PublicMenuCheckoutResult & { error?: string; error_code?: string };
  if (payload?.error) {
    throw new Error(payload.error);
  }
  if (!payload?.pay_url) {
    throw new Error('Payment URL missing');
  }
  return payload;
}
