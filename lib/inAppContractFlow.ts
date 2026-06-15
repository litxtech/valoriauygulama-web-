import { supabase } from '@/lib/supabase';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { isSupabaseUnavailableError, sanitizeSupabaseErrorMessage } from '@/lib/supabaseTransientErrors';

export type InAppContractContext = {
  guestId: string;
  token: string;
  roomId: string;
  roomNumber: string;
};

export type GuestContractPrefill = {
  full_name?: string | null;
  id_number?: string | null;
  id_type?: string | null;
  phone?: string | null;
  phone_country_code?: string | null;
  email?: string | null;
  nationality?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  address?: string | null;
  check_in_at?: string | null;
  check_out_at?: string | null;
  room_type?: string | null;
  adults?: number | null;
  children?: number | null;
  room_id?: string | null;
  contract_approved?: boolean | null;
};

async function fetchValidRoomToken(roomId: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('room_qr_codes')
    .select('token')
    .eq('room_id', roomId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.token) return existing.token;

  const { data: created, error } = await supabase.rpc('generate_room_qr_token', { p_room_id: roomId });
  if (error || !created) return null;
  return String(created);
}

/** Misafir uygulaması profilden sözleşme onayı — QR taraması gerekmez. */
export async function resolveInAppContractContext(): Promise<
  | { ok: true; ctx: InAppContractContext; prefill: GuestContractPrefill | null }
  | { ok: false; message: string }
> {
  let sessionGuest = await getOrCreateGuestForCurrentSession();
  if (!sessionGuest?.guest_id) {
    const { data: statusRows } = await supabase.rpc('get_my_guest_status');
    const statusRow = Array.isArray(statusRows) ? statusRows[0] : statusRows;
    const guestIdFromStatus = (statusRow as { guest_id?: string } | null)?.guest_id;
    if (guestIdFromStatus) {
      sessionGuest = { guest_id: guestIdFromStatus, app_token: '' };
    }
  }
  if (!sessionGuest?.guest_id) {
    return { ok: false, message: 'Misafir oturumu bulunamadı. Lütfen giriş yapın veya uygulamayı yeniden başlatın.' };
  }

  const { data: guestRow, error } = await supabase
    .from('guests')
    .select(
      'id, full_name, id_number, id_type, phone, phone_country_code, email, nationality, date_of_birth, gender, address, check_in_at, check_out_at, room_type, adults, children, room_id, contract_approved, rooms(room_number)'
    )
    .eq('id', sessionGuest.guest_id)
    .maybeSingle();

  if (error || !guestRow) {
    const msg = error?.message ?? '';
    if (isSupabaseUnavailableError(msg)) {
      return { ok: false, message: sanitizeSupabaseErrorMessage(msg) };
    }
    return { ok: false, message: 'Konaklama bilgileriniz yüklenemedi.' };
  }

  const row = guestRow as GuestContractPrefill & {
    rooms?: { room_number?: string } | null;
  };
  const roomId = row.room_id ?? null;
  const roomNumber = row.rooms?.room_number ?? '';

  let token: string;
  if (roomId) {
    token = (await fetchValidRoomToken(roomId)) ?? `app:${sessionGuest.guest_id}`;
  } else {
    token = `app:${sessionGuest.guest_id}`;
  }

  return {
    ok: true,
    ctx: {
      guestId: sessionGuest.guest_id,
      token,
      roomId: roomId ?? '',
      roomNumber,
    },
    prefill: row,
  };
}

export function isoDateToFormDisplay(iso: string | null | undefined): string {
  if (!iso) return '';
  const part = iso.slice(0, 10);
  const [y, m, d] = part.split('-');
  if (!y || !m || !d) return '';
  return `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`;
}
