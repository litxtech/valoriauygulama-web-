import { supabase } from '@/lib/supabase';
import { staffMatchesSmartOpsRoleLocal } from '@/lib/smartOps';
import type { BulkCategory, BulkGuestTarget } from '@/lib/notifications';

export type OrgStaffOption = {
  id: string;
  full_name: string | null;
  role: string | null;
  department: string | null;
};

export const GUEST_BULK_TARGET_LABELS: Record<BulkGuestTarget, string> = {
  all_guests: 'Tüm misafirler',
  checkin_today: 'Bugün giriş yapanlar',
  checkout_tomorrow: 'Yarın çıkış yapacaklar',
  specific_rooms: 'Belirli odalar',
  long_stay: '3+ gün kalanlar',
};

export function parseGuestBulkTarget(metadata: unknown): BulkGuestTarget {
  if (!metadata || typeof metadata !== 'object') return 'all_guests';
  const raw = (metadata as { guest_bulk_target?: unknown }).guest_bulk_target;
  const allowed: BulkGuestTarget[] = [
    'all_guests',
    'checkin_today',
    'checkout_tomorrow',
    'specific_rooms',
    'long_stay',
  ];
  return allowed.includes(raw as BulkGuestTarget) ? (raw as BulkGuestTarget) : 'all_guests';
}

export function parseGuestRoomNumbers(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const raw = (metadata as { room_numbers?: unknown }).room_numbers;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((n): n is string => typeof n === 'string')
    .map((n) => n.trim())
    .filter(Boolean);
}

export function parseScheduledGuestCategory(metadata: unknown, fallback?: string | null): BulkCategory {
  if (!metadata || typeof metadata !== 'object') {
    const c = fallback?.toLowerCase();
    return c === 'warning' || c === 'campaign' ? c : 'info';
  }
  const raw = (metadata as { bulk_category?: unknown }).bulk_category ?? fallback;
  const c = typeof raw === 'string' ? raw.toLowerCase() : 'info';
  return c === 'warning' || c === 'campaign' ? c : 'info';
}

export function guestScheduledRecipientLabel(metadata: unknown): string {
  const target = parseGuestBulkTarget(metadata);
  const base = GUEST_BULK_TARGET_LABELS[target];
  if (target !== 'specific_rooms') return base;
  const rooms = parseGuestRoomNumbers(metadata);
  return rooms.length ? `${base} (${rooms.join(', ')})` : base;
}

export function parseExcludedStaffIds(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const raw = (metadata as { excluded_staff_ids?: unknown }).excluded_staff_ids;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export async function fetchActiveOrgStaff(organizationId: string): Promise<OrgStaffOption[]> {
  const { data, error } = await supabase
    .from('staff')
    .select('id, full_name, role, department')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('full_name');
  if (error) throw new Error(error.message);
  return (data ?? []) as OrgStaffOption[];
}

export function filterStaffByRoleAndExclusions(
  staff: OrgStaffOption[],
  targetRole: string,
  excludedStaffIds: string[]
): OrgStaffOption[] {
  const excluded = new Set(excludedStaffIds);
  return staff.filter(
    (s) => !excluded.has(s.id) && staffMatchesSmartOpsRoleLocal(s, targetRole || 'all_staff')
  );
}

export async function resolveTemplateStaffRecipientIds(params: {
  organizationId: string;
  targetRole?: string;
  excludedStaffIds?: string[];
}): Promise<string[]> {
  const staff = await fetchActiveOrgStaff(params.organizationId);
  return filterStaffByRoleAndExclusions(
    staff,
    params.targetRole ?? 'all_staff',
    params.excludedStaffIds ?? []
  ).map((s) => s.id);
}
