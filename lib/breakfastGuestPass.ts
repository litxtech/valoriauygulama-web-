/**
 * Partner otel misafirleri için kişisel kahvaltı QR biletleri.
 */
import { supabase, supabaseMessaging } from '@/lib/supabase';
import { getShareablePublicOrigin } from '@/lib/appPublicUrl';
import type { StaffPermissionSlice } from '@/lib/staffPermissions';

const partnerDb = supabaseMessaging;

export type BreakfastGuestPassStatus = 'pending' | 'redeemed' | 'cancelled';

export type BreakfastGuestPass = {
  id: string;
  partnerHotelId: string;
  organizationId: string;
  recordDate: string;
  guestName: string;
  roomNumber: string | null;
  token: string;
  createdAt: string;
  redeemedAt: string | null;
  redeemedByStaffId: string | null;
  cancelledAt: string | null;
  status: BreakfastGuestPassStatus;
  partnerHotelName?: string;
  redeemedByStaffName?: string;
};

export type BreakfastGuestPassRedeemedRow = {
  id: string;
  partnerHotelId: string;
  partnerHotelName: string;
  recordDate: string;
  guestName: string;
  roomNumber: string | null;
  redeemedAt: string;
  redeemedByStaffName: string;
  status: 'redeemed';
};

export type BreakfastGuestPassRedeemedBoard = {
  recordDate: string;
  passes: BreakfastGuestPassRedeemedRow[];
  summary: {
    totalRedeemed: number;
    totalPending: number;
  };
};

const RECEPTION_ROLES = new Set(['admin', 'reception_chief', 'receptionist']);
const RECEPTION_DEPARTMENTS = new Set([
  'reception',
  'receptionist',
  'reception_chief',
  'resepsiyon',
  'front_desk',
  'kitchen',
  'kitchen_staff',
  'mutfak',
  'chef',
  'head_chef',
  'pastry',
  'restaurant',
]);

function mapPassRow(raw: Record<string, unknown>): BreakfastGuestPass {
  const status = String(raw.status ?? 'pending');
  return {
    id: String(raw.id ?? ''),
    partnerHotelId: String(raw.partnerHotelId ?? ''),
    organizationId: String(raw.organizationId ?? ''),
    recordDate: String(raw.recordDate ?? ''),
    guestName: String(raw.guestName ?? ''),
    roomNumber: (raw.roomNumber as string | null) ?? null,
    token: String(raw.token ?? ''),
    createdAt: String(raw.createdAt ?? ''),
    redeemedAt: (raw.redeemedAt as string | null) ?? null,
    redeemedByStaffId: (raw.redeemedByStaffId as string | null) ?? null,
    cancelledAt: (raw.cancelledAt as string | null) ?? null,
    status:
      status === 'redeemed' || status === 'cancelled' || status === 'pending' ? status : 'pending',
    partnerHotelName: (raw.partnerHotelName as string | undefined) ?? undefined,
    redeemedByStaffName: (raw.redeemedByStaffName as string | undefined) ?? undefined,
  };
}

export function breakfastGuestPassStatusLabel(status: BreakfastGuestPassStatus): string {
  if (status === 'redeemed') return 'Onaylandı';
  if (status === 'cancelled') return 'İptal';
  return 'Bekliyor';
}

export function breakfastGuestPassQrValue(token: string, origin?: string | null): string {
  const t = token.trim();
  const base = getShareablePublicOrigin(origin);
  return `${base}/breakfast-pass?token=${encodeURIComponent(t)}`;
}

export function breakfastGuestPassDeepLink(token: string): string {
  return `valoria://breakfast-pass?token=${encodeURIComponent(token.trim())}`;
}

/** QR / URL yalnızca kahvaltı bilet yolundan token çıkarır. */
export function isBreakfastPassPublicPath(pathname?: string | null): boolean {
  const p = (pathname ?? '').replace(/\/$/, '') || '/';
  return p === '/breakfast-pass' || p.startsWith('/breakfast-pass/');
}

export function parseBreakfastGuestPassTokenFromScan(data: string): string | null {
  const raw = String(data ?? '').trim();
  if (!raw) return null;

  const pathIsBreakfastPass = (pathname: string) => {
    const head = pathname.replace(/^\/+|\/+$/g, '').split('/')[0]?.toLowerCase() ?? '';
    return head === 'breakfast-pass';
  };

  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('valoria://')) {
    try {
      const u = new URL(raw.includes('://') ? raw : `https://${raw.replace(/^\//, '')}`);
      if (!pathIsBreakfastPass(u.pathname)) return null;
      const token = u.searchParams.get('token') ?? u.searchParams.get('t');
      return token?.trim() || null;
    } catch {
      return null;
    }
  }

  if (raw.includes('breakfast-pass')) {
    const tokenMatch = raw.match(/[?&](?:token|t)=([^&]+)/i);
    if (tokenMatch?.[1]) {
      try {
        return decodeURIComponent(tokenMatch[1]).trim();
      } catch {
        return tokenMatch[1].trim();
      }
    }
  }

  // Personel QR okuyucu: yalnızca kahvaltı bileti token uzunluğu (24 byte = 48 hex)
  if (/^[a-f0-9]{48}$/i.test(raw)) return raw.toLowerCase();

  return null;
}

export function canRedeemBreakfastGuestPass(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin' || RECEPTION_ROLES.has(staff.role ?? '')) return true;
  const dept = ((staff as { department?: string | null }).department ?? '').toLowerCase();
  if (RECEPTION_DEPARTMENTS.has(dept)) return true;
  const perms = staff.app_permissions ?? {};
  return perms.mutfak_operasyon === true || perms.yemek_listesi_mutfak_onay === true;
}

export async function createBreakfastGuestPass(input: {
  guestName: string;
  roomNumber?: string;
  recordDate?: string;
}): Promise<{ pass: BreakfastGuestPass } | { error: string }> {
  const { data, error } = await partnerDb.rpc('breakfast_guest_pass_create', {
    p_guest_name: input.guestName.trim(),
    p_room_number: input.roomNumber?.trim() || null,
    p_record_date: input.recordDate ?? null,
  });
  if (error) return { error: error.message };
  if (!data || typeof data !== 'object') return { error: 'Bilet oluşturulamadı' };
  return { pass: mapPassRow(data as Record<string, unknown>) };
}

export async function cancelBreakfastGuestPass(
  passId: string
): Promise<{ pass: BreakfastGuestPass } | { error: string }> {
  const { data, error } = await partnerDb.rpc('breakfast_guest_pass_cancel', {
    p_pass_id: passId,
  });
  if (error) return { error: error.message };
  if (!data || typeof data !== 'object') return { error: 'Bilet iptal edilemedi' };
  return { pass: mapPassRow(data as Record<string, unknown>) };
}

export async function redeemBreakfastGuestPass(
  token: string
): Promise<{ pass: BreakfastGuestPass } | { error: string }> {
  const { data, error } = await supabase.rpc('breakfast_guest_pass_redeem', {
    p_token: token.trim(),
  });
  if (error) return { error: error.message };
  if (!data || typeof data !== 'object') return { error: 'QR onaylanamadı' };
  return { pass: mapPassRow(data as Record<string, unknown>) };
}

function mapPassDbRow(row: Record<string, unknown>): BreakfastGuestPass {
  const cancelledAt = (row.cancelled_at as string | null) ?? null;
  const redeemedAt = (row.redeemed_at as string | null) ?? null;
  let status: BreakfastGuestPassStatus = 'pending';
  if (cancelledAt) status = 'cancelled';
  else if (redeemedAt) status = 'redeemed';
  return {
    id: String(row.id ?? ''),
    partnerHotelId: String(row.partner_hotel_id ?? ''),
    organizationId: String(row.organization_id ?? ''),
    recordDate: String(row.record_date ?? ''),
    guestName: String(row.guest_name ?? ''),
    roomNumber: (row.room_number as string | null) ?? null,
    token: String(row.token ?? ''),
    createdAt: String(row.created_at ?? ''),
    redeemedAt,
    redeemedByStaffId: (row.redeemed_by_staff_id as string | null) ?? null,
    cancelledAt,
    status,
  };
}

export async function fetchPartnerBreakfastGuestPass(passId: string): Promise<BreakfastGuestPass | null> {
  const { data, error } = await partnerDb
    .from('breakfast_guest_passes')
    .select(
      'id, partner_hotel_id, organization_id, record_date, guest_name, room_number, token, created_at, redeemed_at, redeemed_by_staff_id, cancelled_at'
    )
    .eq('id', passId)
    .maybeSingle();
  if (error || !data) return null;
  return mapPassDbRow(data as Record<string, unknown>);
}

export type BreakfastGuestPassPublic = {
  guestName: string;
  roomNumber: string | null;
  recordDate: string;
  createdAt: string;
  redeemedAt: string | null;
  cancelledAt: string | null;
  partnerHotelName: string;
  partnerHotelCity: string | null;
  partnerHotelPhone: string | null;
  partnerHotelContact: string | null;
  status: BreakfastGuestPassStatus;
};

function mapPublicPassRow(raw: Record<string, unknown>): BreakfastGuestPassPublic {
  const status = String(raw.status ?? 'pending');
  return {
    guestName: String(raw.guestName ?? ''),
    roomNumber: (raw.roomNumber as string | null) ?? null,
    recordDate: String(raw.recordDate ?? ''),
    createdAt: String(raw.createdAt ?? ''),
    redeemedAt: (raw.redeemedAt as string | null) ?? null,
    cancelledAt: (raw.cancelledAt as string | null) ?? null,
    partnerHotelName: String(raw.partnerHotelName ?? ''),
    partnerHotelCity: (raw.partnerHotelCity as string | null) ?? null,
    partnerHotelPhone: (raw.partnerHotelPhone as string | null) ?? null,
    partnerHotelContact: (raw.partnerHotelContact as string | null) ?? null,
    status:
      status === 'redeemed' || status === 'cancelled' || status === 'pending' ? status : 'pending',
  };
}

export async function fetchBreakfastGuestPassPublic(
  token: string
): Promise<BreakfastGuestPassPublic | null> {
  const { data, error } = await supabase.rpc('breakfast_guest_pass_public_lookup', {
    p_token: token.trim(),
  });
  if (error || !data || typeof data !== 'object') return null;
  return mapPublicPassRow(data as Record<string, unknown>);
}

export function formatBreakfastPassDate(isoDate: string): string {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export async function listPartnerBreakfastGuestPasses(
  recordDate?: string
): Promise<{ recordDate: string; passes: BreakfastGuestPass[] }> {
  const { data, error } = await partnerDb.rpc('breakfast_guest_pass_list_partner', {
    p_record_date: recordDate ?? null,
    p_limit: 100,
  });
  if (error) throw new Error(error.message);
  const raw = (data ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(raw.passes) ? raw.passes : [];
  return {
    recordDate: String(raw.recordDate ?? recordDate ?? ''),
    passes: rows.map((r) => mapPassRow(r as Record<string, unknown>)),
  };
}

export async function fetchRedeemedBreakfastGuestPasses(
  recordDate?: string
): Promise<BreakfastGuestPassRedeemedBoard> {
  const { data, error } = await supabase.rpc('breakfast_guest_pass_list_redeemed', {
    p_record_date: recordDate ?? null,
  });
  if (error) throw new Error(error.message);
  const raw = (data ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(raw.passes) ? raw.passes : [];
  const summary = (raw.summary ?? {}) as Record<string, unknown>;
  return {
    recordDate: String(raw.recordDate ?? recordDate ?? ''),
    passes: rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id ?? ''),
        partnerHotelId: String(row.partnerHotelId ?? ''),
        partnerHotelName: String(row.partnerHotelName ?? ''),
        recordDate: String(row.recordDate ?? ''),
        guestName: String(row.guestName ?? ''),
        roomNumber: (row.roomNumber as string | null) ?? null,
        redeemedAt: String(row.redeemedAt ?? ''),
        redeemedByStaffName: String(row.redeemedByStaffName ?? ''),
        status: 'redeemed' as const,
      };
    }),
    summary: {
      totalRedeemed: Number(summary.totalRedeemed) || 0,
      totalPending: Number(summary.totalPending) || 0,
    },
  };
}

export function formatBreakfastPassTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  });
}
