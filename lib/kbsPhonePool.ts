import { supabase } from '@/lib/supabase';
import { normalizeKbsGuestPhone } from '@/lib/kbsCaptureHistory';
import { resolveOpsHotelIdForCaller } from '@/lib/resolveOpsHotelId';

export type KbsPhonePoolRow = {
  id: string;
  hotel_id: string;
  phone: string;
  phone_digits: string;
  display_name: string | null;
  note: string | null;
  created_by_auth_id: string | null;
  created_by_staff_name: string | null;
  created_at: string;
  updated_at: string;
};

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

function mapRow(raw: Record<string, unknown>): KbsPhonePoolRow {
  return {
    id: String(raw.id),
    hotel_id: String(raw.hotel_id),
    phone: String(raw.phone ?? ''),
    phone_digits: String(raw.phone_digits ?? ''),
    display_name: raw.display_name ? String(raw.display_name) : null,
    note: raw.note ? String(raw.note) : null,
    created_by_auth_id: raw.created_by_auth_id ? String(raw.created_by_auth_id) : null,
    created_by_staff_name: raw.created_by_staff_name ? String(raw.created_by_staff_name) : null,
    created_at: String(raw.created_at),
    updated_at: String(raw.updated_at),
  };
}

const SELECT_COLS =
  'id, hotel_id, phone, phone_digits, display_name, note, created_by_auth_id, created_by_staff_name, created_at, updated_at';

export async function fetchKbsPhonePool(opts?: {
  hotelId?: string | null;
  hotelIds?: string[] | null;
  limit?: number;
}): Promise<KbsPhonePoolRow[]> {
  const limit = opts?.limit ?? 500;
  let q = supabase
    .schema('ops')
    .from('phone_pool')
    .select(SELECT_COLS)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts?.hotelId) q = q.eq('hotel_id', opts.hotelId);
  else if (opts?.hotelIds?.length) q = q.in('hotel_id', opts.hotelIds);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

export async function createKbsPhonePoolEntry(input: {
  phone: string;
  displayName?: string | null;
  note?: string | null;
  hotelId?: string | null;
  createdByAuthId?: string | null;
  createdByStaffName?: string | null;
}): Promise<{ ok: true; row: KbsPhonePoolRow } | { ok: false; message: string }> {
  const phone = normalizeKbsGuestPhone(input.phone);
  if (!phone) return { ok: false, message: 'Telefon numarası girin' };
  const phoneDigits = digitsOnly(phone);
  if (phoneDigits.length < 7) return { ok: false, message: 'Geçerli bir telefon numarası girin (en az 7 rakam)' };

  const displayName = input.displayName?.trim() || null;
  const note = input.note?.trim() || null;
  if (note && note.length > 500) return { ok: false, message: 'Not çok uzun (max 500)' };

  let hotelId = input.hotelId?.trim() || null;
  if (!hotelId) {
    const ctx = await resolveOpsHotelIdForCaller(input.createdByAuthId);
    if (!ctx.ok) return { ok: false, message: ctx.message };
    hotelId = ctx.hotelId;
  }

  const { data, error } = await supabase
    .schema('ops')
    .from('phone_pool')
    .upsert(
      {
        hotel_id: hotelId,
        phone,
        phone_digits: phoneDigits,
        display_name: displayName,
        note,
        created_by_auth_id: input.createdByAuthId ?? null,
        created_by_staff_name: input.createdByStaffName ?? null,
      },
      { onConflict: 'hotel_id,phone_digits' }
    )
    .select(SELECT_COLS)
    .single();

  if (error) {
    if (error.code === '23505') return { ok: false, message: 'Bu numara zaten rehberde' };
    return { ok: false, message: error.message };
  }

  return { ok: true, row: mapRow(data as Record<string, unknown>) };
}

export async function updateKbsPhonePoolEntry(input: {
  id: string;
  phone?: string;
  displayName?: string | null;
  note?: string | null;
}): Promise<{ ok: true; row: KbsPhonePoolRow } | { ok: false; message: string }> {
  const patch: Record<string, unknown> = {};
  if (input.phone !== undefined) {
    const phone = normalizeKbsGuestPhone(input.phone);
    if (!phone) return { ok: false, message: 'Telefon numarası girin' };
    const phoneDigits = digitsOnly(phone);
    if (phoneDigits.length < 7) return { ok: false, message: 'Geçerli bir telefon numarası girin' };
    patch.phone = phone;
    patch.phone_digits = phoneDigits;
  }
  if (input.displayName !== undefined) {
    patch.display_name = input.displayName?.trim() || null;
  }
  if (input.note !== undefined) {
    const note = input.note?.trim() || null;
    if (note && note.length > 500) return { ok: false, message: 'Not çok uzun (max 500)' };
    patch.note = note;
  }

  const { data, error } = await supabase
    .schema('ops')
    .from('phone_pool')
    .update(patch)
    .eq('id', input.id)
    .select(SELECT_COLS)
    .single();

  if (error) {
    if (error.code === '23505') return { ok: false, message: 'Bu numara zaten rehberde' };
    return { ok: false, message: error.message };
  }
  return { ok: true, row: mapRow(data as Record<string, unknown>) };
}

export async function deleteKbsPhonePoolEntry(
  id: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.schema('ops').from('phone_pool').delete().eq('id', id);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
