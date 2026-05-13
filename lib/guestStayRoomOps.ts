import type { SupabaseClient } from '@supabase/supabase-js';
import { computeStayAmounts } from '@/lib/guestStayFinancials';

type MinimalSupabase = Pick<SupabaseClient, 'from'>;

/**
 * Misafir konaklama tutarlarını günceller (check-in tarihi değişmez).
 */
export async function updateGuestStayFinancials(
  client: MinimalSupabase,
  params: { guestId: string; pricePerNight: number; nights: number }
): Promise<{ error: Error | null }> {
  const { totalNet, vatAmount, accommodationTaxAmount } = computeStayAmounts(params.pricePerNight, params.nights);
  const { error } = await client
    .from('guests')
    .update({
      total_amount_net: totalNet,
      vat_amount: vatAmount,
      accommodation_tax_amount: accommodationTaxAmount,
      nights_count: params.nights,
    })
    .eq('id', params.guestId);
  return { error: error ? new Error(error.message) : null };
}

/**
 * Misafiri başka odaya taşır: eski odayı müsait, yeni odayı dolu yapar; sözleşme onayı satırlarını eşitler.
 */
export async function moveGuestToRoom(
  client: MinimalSupabase,
  params: { guestId: string; oldRoomId: string | null; newRoomId: string }
): Promise<{ error: Error | null }> {
  const { guestId, oldRoomId, newRoomId } = params;
  if (oldRoomId === newRoomId) return { error: null };

  const { error: gErr } = await client.from('guests').update({ room_id: newRoomId }).eq('id', guestId);
  if (gErr) return { error: new Error(gErr.message) };

  if (oldRoomId) {
    const { error: oldErr } = await client.from('rooms').update({ status: 'available' }).eq('id', oldRoomId);
    if (oldErr) return { error: new Error(oldErr.message) };
  }

  const { error: newErr } = await client.from('rooms').update({ status: 'occupied' }).eq('id', newRoomId);
  if (newErr) return { error: new Error(newErr.message) };

  const { error: caErr } = await client.from('contract_acceptances').update({ room_id: newRoomId }).eq('guest_id', guestId);
  if (caErr) return { error: new Error(caErr.message) };

  return { error: null };
}
