export type AdminGuestAccountSummary = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  id_number: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  created_at: string | null;
  auth_user_id: string | null;
  is_guest_app_account?: boolean | null;
  rooms?: { room_number: string } | null;
};

const GUEST_STATUS_LABELS: Record<string, string> = {
  pending: 'Giriş bekliyor',
  checked_in: 'Odada',
  checked_out: 'Çıkış yaptı',
};

export function guestStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return GUEST_STATUS_LABELS[status] ?? status;
}

export function formatAdminDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function guestRoomNumber(guest: AdminGuestAccountSummary | null | undefined): string | null {
  return guest?.rooms?.room_number?.trim() || null;
}

export function guestSearchHaystack(
  guest: AdminGuestAccountSummary | null | undefined,
  extra: string[] = []
): string {
  const parts = [
    guest?.full_name,
    guest?.phone,
    guest?.email,
    guest?.id_number,
    guestRoomNumber(guest),
    guest?.id,
    ...extra,
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

export type GuestAccountDetailLine = { label: string; value: string; highlight?: boolean };

export function buildGuestAccountDetailLines(guest: AdminGuestAccountSummary | null | undefined): GuestAccountDetailLine[] {
  if (!guest?.id) return [];

  const room = guestRoomNumber(guest);
  const lines: GuestAccountDetailLine[] = [
    { label: 'Misafir', value: guest.full_name?.trim() || '—', highlight: true },
    { label: 'Hesap durumu', value: guestStatusLabel(guest.status) },
  ];

  if (room) lines.push({ label: 'Oda', value: room });
  if (guest.phone?.trim()) lines.push({ label: 'Telefon', value: guest.phone.trim() });
  if (guest.email?.trim()) lines.push({ label: 'E-posta', value: guest.email.trim() });
  if (guest.id_number?.trim()) lines.push({ label: 'Kimlik / pasaport', value: guest.id_number.trim() });
  if (guest.check_in_at) lines.push({ label: 'Check-in', value: formatAdminDateTime(guest.check_in_at) });
  if (guest.check_out_at) lines.push({ label: 'Check-out', value: formatAdminDateTime(guest.check_out_at) });
  lines.push({ label: 'Kayıt tarihi', value: formatAdminDateTime(guest.created_at) });
  if (guest.is_guest_app_account) lines.push({ label: 'Uygulama hesabı', value: 'Evet' });
  if (guest.auth_user_id) lines.push({ label: 'Hesap ID', value: guest.auth_user_id.slice(0, 8) + '…' });

  return lines;
}
