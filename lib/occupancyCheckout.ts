import type { SupabaseClient } from '@supabase/supabase-js';
import { sendNotification } from '@/lib/notificationService';
import { GUEST_TYPES, guestMessageTemplate } from '@/lib/notifications';

export type CheckoutGuestRow = {
  id: string;
  full_name: string;
  room_id: string | null;
  contract_lang?: string | null;
};

/** Tek misafir check-out — oda müsait, bildirim gider. */
export async function checkoutGuest(
  client: SupabaseClient,
  guest: CheckoutGuestRow,
  createdByStaffId?: string
): Promise<{ error: Error | null }> {
  const rid = guest.room_id;
  const { error } = await client
    .from('guests')
    .update({ status: 'checked_out', check_out_at: new Date().toISOString(), room_id: null })
    .eq('id', guest.id);
  if (error) return { error: new Error(error.message) };

  if (rid) {
    const { error: roomErr } = await client.from('rooms').update({ status: 'available' }).eq('id', rid);
    if (roomErr) return { error: new Error(roomErr.message) };
  }

  const msg = guestMessageTemplate(GUEST_TYPES.checkout_done, {}, guest.contract_lang);
  await sendNotification({
    guestId: guest.id,
    title: msg.title,
    body: msg.body,
    notificationType: GUEST_TYPES.checkout_done,
    category: 'guest',
    createdByStaffId,
  });

  return { error: null };
}

/** Toplu check-out — hata olanları döndürür. */
export async function checkoutGuestsBulk(
  client: SupabaseClient,
  guests: CheckoutGuestRow[],
  createdByStaffId?: string
): Promise<{ failed: { id: string; name: string; message: string }[]; succeeded: number }> {
  const failed: { id: string; name: string; message: string }[] = [];
  let succeeded = 0;
  for (const g of guests) {
    const res = await checkoutGuest(client, g, createdByStaffId);
    if (res.error) failed.push({ id: g.id, name: g.full_name, message: res.error.message });
    else succeeded += 1;
  }
  return { failed, succeeded };
}
