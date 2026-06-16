import { supabase } from '@/lib/supabase';

export type PublicMenuCheckoutLine = { menu_item_id: string; quantity: number };

export type PublicMenuCheckoutInput = {
  orgSlug: string;
  items: PublicMenuCheckoutLine[];
  customerName: string;
  customerEmail: string;
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
  const { data, error } = await supabase.functions.invoke('create-public-kitchen-menu-payment', {
    body: {
      org_slug: input.orgSlug,
      items: input.items,
      customer_name: input.customerName,
      customer_email: input.customerEmail,
      room_number: input.roomNumber?.trim() || null,
      table_number: input.tableNumber?.trim() || null,
      lang: input.lang,
    },
  });

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
