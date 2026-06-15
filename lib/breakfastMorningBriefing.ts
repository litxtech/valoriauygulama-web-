/**
 * Sabah kahvaltı misafir sayısı + otel nüfusu bildirimi.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { sendNotificationToStaffIds } from '@/lib/notificationService';
import { canAccessOccupancyOps, type StaffPermissionSlice } from '@/lib/staffPermissions';
import { loadOccupancySnapshot } from '@/lib/occupancyOpsLoad';

export type BreakfastBriefingTarget = 'kitchen' | 'reception';

export const BREAKFAST_BRIEFING_TARGETS: {
  id: BreakfastBriefingTarget;
  label: string;
  icon: 'restaurant-outline' | 'desktop-outline';
  tint: string;
  bg: string;
}[] = [
  { id: 'kitchen', label: 'Mutfak', icon: 'restaurant-outline', tint: '#ea580c', bg: '#fff7ed' },
  { id: 'reception', label: 'Resepsiyon', icon: 'desktop-outline', tint: '#2563eb', bg: '#eff6ff' },
];

const TARGETS_STORAGE_KEY = 'breakfast_briefing_notify_targets_v1';

export type BreakfastMorningBriefing = {
  id: string;
  organization_id: string;
  record_date: string;
  breakfast_guest_count: number;
  hotel_guest_count: number;
  notify_targets: BreakfastBriefingTarget[];
  note: string | null;
  created_by_staff_id: string | null;
  updated_by_staff_id: string | null;
  created_at: string;
  updated_at: string;
  created_by_name?: string | null;
  updated_by_name?: string | null;
};

export function canManageBreakfastBriefing(staff: StaffPermissionSlice): boolean {
  return canAccessOccupancyOps(staff);
}

export function canViewBreakfastBriefing(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (canManageBreakfastBriefing(staff)) return true;
  const dept = (staff as { department?: string | null }).department?.toLowerCase() ?? '';
  const role = staff.role ?? '';
  if (KITCHEN_DEPARTMENTS.has(dept)) return true;
  if (RECEPTION_ROLES.has(role) || RECEPTION_DEPARTMENTS.has(dept)) return true;
  const perms = staff.app_permissions ?? {};
  return perms.mutfak_operasyon === true || perms.yemek_listesi_mutfak_onay === true;
}

const KITCHEN_DEPARTMENTS = new Set([
  'kitchen',
  'kitchen_staff',
  'mutfak',
  'chef',
  'head_chef',
  'pastry',
  'restaurant',
]);

const RECEPTION_ROLES = new Set(['reception_chief', 'receptionist', 'admin']);
const RECEPTION_DEPARTMENTS = new Set(['reception', 'receptionist', 'reception_chief', 'resepsiyon', 'front_desk']);

function todayIstanbulDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

function normalizeTargets(raw: unknown): BreakfastBriefingTarget[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is BreakfastBriefingTarget => t === 'kitchen' || t === 'reception');
}

export async function loadSavedBriefingTargets(): Promise<BreakfastBriefingTarget[]> {
  try {
    const raw = await AsyncStorage.getItem(TARGETS_STORAGE_KEY);
    if (!raw) return ['kitchen'];
    const parsed = JSON.parse(raw) as unknown;
    const targets = normalizeTargets(parsed);
    return targets.length > 0 ? targets : ['kitchen'];
  } catch {
    return ['kitchen'];
  }
}

export async function saveBriefingTargets(targets: BreakfastBriefingTarget[]): Promise<void> {
  const clean = normalizeTargets(targets);
  await AsyncStorage.setItem(TARGETS_STORAGE_KEY, JSON.stringify(clean.length ? clean : ['kitchen']));
}

export async function fetchBreakfastBriefingForDate(
  organizationId: string,
  recordDate: string
): Promise<BreakfastMorningBriefing | null> {
  const { data, error } = await supabase
    .from('breakfast_morning_briefings')
    .select(
      'id, organization_id, record_date, breakfast_guest_count, hotel_guest_count, notify_targets, note, created_by_staff_id, updated_by_staff_id, created_at, updated_at'
    )
    .eq('organization_id', organizationId)
    .eq('record_date', recordDate)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  const staffIds = [row.updated_by_staff_id, row.created_by_staff_id].filter(Boolean) as string[];
  const nameById = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: staffRows } = await supabase.from('staff').select('id, full_name').in('id', staffIds);
    for (const s of staffRows ?? []) {
      nameById.set(String(s.id), String(s.full_name ?? ''));
    }
  }

  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    record_date: String(row.record_date),
    breakfast_guest_count: Number(row.breakfast_guest_count ?? 0),
    hotel_guest_count: Number(row.hotel_guest_count ?? 0),
    notify_targets: normalizeTargets(row.notify_targets),
    note: (row.note as string | null) ?? null,
    created_by_staff_id: (row.created_by_staff_id as string | null) ?? null,
    updated_by_staff_id: (row.updated_by_staff_id as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    created_by_name: row.created_by_staff_id ? nameById.get(String(row.created_by_staff_id)) ?? null : null,
    updated_by_name: row.updated_by_staff_id ? nameById.get(String(row.updated_by_staff_id)) ?? null : null,
  };
}

export async function suggestHotelGuestCount(orgScoped: string | null): Promise<number | null> {
  try {
    const snap = await loadOccupancySnapshot(orgScoped, { force: false });
    return snap.stats.guestsInHouse;
  } catch {
    return null;
  }
}

async function resolveStaffIdsForTargets(
  organizationId: string,
  targets: BreakfastBriefingTarget[]
): Promise<string[]> {
  if (targets.length === 0) return [];

  const { data: staffList, error } = await supabase
    .from('staff')
    .select('id, role, department, app_permissions')
    .eq('organization_id', organizationId)
    .eq('is_active', true);

  if (error || !staffList?.length) return [];

  const wantKitchen = targets.includes('kitchen');
  const wantReception = targets.includes('reception');
  const ids = new Set<string>();

  for (const s of staffList) {
    const dept = String(s.department ?? '').toLowerCase();
    const role = String(s.role ?? '');
    const perms = (s.app_permissions ?? {}) as Record<string, boolean>;

    if (wantKitchen) {
      if (
        KITCHEN_DEPARTMENTS.has(dept) ||
        perms.mutfak_operasyon === true ||
        perms.yemek_listesi_mutfak_onay === true
      ) {
        ids.add(String(s.id));
        continue;
      }
    }
    if (wantReception) {
      if (RECEPTION_ROLES.has(role) || RECEPTION_DEPARTMENTS.has(dept)) {
        ids.add(String(s.id));
      }
    }
  }

  return [...ids];
}

function formatBriefingDateLabel(date: string): string {
  try {
    const d = new Date(`${date}T12:00:00`);
    return d.toLocaleDateString('tr-TR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'Europe/Istanbul',
    });
  } catch {
    return date;
  }
}

function buildPushBody(params: {
  breakfastGuestCount: number;
  hotelGuestCount: number;
  note?: string | null;
}): string {
  const lines = [
    `Kahvaltı: ${params.breakfastGuestCount} kişi`,
    `Otel nüfusu: ${params.hotelGuestCount} kişi`,
  ];
  if (params.note?.trim()) lines.push(`Not: ${params.note.trim()}`);
  return lines.join('\n');
}

export async function submitBreakfastBriefing(params: {
  organizationId: string;
  breakfastGuestCount: number;
  hotelGuestCount: number;
  notifyTargets: BreakfastBriefingTarget[];
  note?: string | null;
  createdByStaffId: string;
  recordDate?: string;
}): Promise<{ briefing: BreakfastMorningBriefing | null; notifiedCount: number; error?: string }> {
  const {
    organizationId,
    breakfastGuestCount,
    hotelGuestCount,
    notifyTargets,
    note,
    createdByStaffId,
    recordDate = todayIstanbulDate(),
  } = params;

  if (breakfastGuestCount < 0 || hotelGuestCount < 0) {
    return { briefing: null, notifiedCount: 0, error: 'Sayılar 0 veya daha büyük olmalı.' };
  }
  const targets = normalizeTargets(notifyTargets);
  if (targets.length === 0) {
    return { briefing: null, notifiedCount: 0, error: 'En az bir bölüm seçin (Mutfak veya Resepsiyon).' };
  }

  const existing = await fetchBreakfastBriefingForDate(organizationId, recordDate);
  const payload = {
    organization_id: organizationId,
    record_date: recordDate,
    breakfast_guest_count: breakfastGuestCount,
    hotel_guest_count: hotelGuestCount,
    notify_targets: targets,
    note: note?.trim() || null,
    updated_by_staff_id: createdByStaffId,
  };

  let briefingId: string | null = existing?.id ?? null;

  if (existing) {
    const { error } = await supabase.from('breakfast_morning_briefings').update(payload).eq('id', existing.id);
    if (error) return { briefing: null, notifiedCount: 0, error: error.message };
  } else {
    const { data, error } = await supabase
      .from('breakfast_morning_briefings')
      .insert({ ...payload, created_by_staff_id: createdByStaffId })
      .select('id')
      .single();
    if (error) return { briefing: null, notifiedCount: 0, error: error.message };
    briefingId = String((data as { id: string }).id);
  }

  await saveBriefingTargets(targets);

  const staffIds = await resolveStaffIdsForTargets(organizationId, targets);
  const dateLabel = formatBriefingDateLabel(recordDate);
  const title = `Sabah kahvaltı — ${dateLabel}`;
  const body = buildPushBody({
    breakfastGuestCount,
    hotelGuestCount,
    note,
  });

  let notifiedCount = 0;
  if (staffIds.length > 0) {
    const pushData = {
      notificationType: 'breakfast_morning_briefing',
      screen: '/staff/breakfast-briefing',
      url: '/staff/breakfast-briefing',
      briefingId: briefingId,
      recordDate,
      breakfastGuestCount,
      hotelGuestCount,
    };
    const res = await sendNotificationToStaffIds({
      staffIds: staffIds.filter((id) => id !== createdByStaffId),
      title,
      body,
      createdByStaffId,
      notificationType: 'breakfast_morning_briefing',
      category: 'staff',
      data: pushData,
    });
    if (res.error) return { briefing: null, notifiedCount: 0, error: res.error };
    notifiedCount = res.count;
  }

  const briefing = await fetchBreakfastBriefingForDate(organizationId, recordDate);
  return { briefing, notifiedCount };
}

export function breakfastBriefingViewPath(scope: 'admin' | 'staff' | 'view'): string {
  if (scope === 'admin') return '/admin/report/breakfast-briefing';
  if (scope === 'staff') return '/staff/occupancy/breakfast-briefing';
  return '/staff/breakfast-briefing';
}

export { todayIstanbulDate, formatBriefingDateLabel };
