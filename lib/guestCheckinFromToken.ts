import { supabase } from '@/lib/supabase';

export async function bootstrapGuestCheckinToken(
  token: string,
  setQR: (token: string, roomId: string, roomNumber: string) => void
): Promise<{ ok: true } | { ok: false }> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false };

  const { data: qrRow, error } = await supabase
    .from('room_qr_codes')
    .select('room_id, rooms(room_number)')
    .eq('token', trimmed)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !qrRow) return { ok: false };

  const roomId = (qrRow as { room_id: string }).room_id;
  const roomNumber = (qrRow as { rooms: { room_number: string } | null })?.rooms?.room_number ?? '';
  setQR(trimmed, roomId, roomNumber);
  return { ok: true };
}

export function readGuestCheckinTokenFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search || '');
  return (params.get('token') ?? params.get('t') ?? '').trim() || null;
}
