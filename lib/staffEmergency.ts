import { supabase } from '@/lib/supabase';
import { sendBulkToStaff } from '@/lib/notificationService';

export const STAFF_EMERGENCY_NOTIFICATION_TYPE = 'staff_emergency_alert';
export const STAFF_EMERGENCY_SOUND_NAME = 'emergency_alert.wav';
export const STAFF_EMERGENCY_ANDROID_CHANNEL = 'valoria_emergency_alert';

export type EmergencyLocation = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
};

export async function listEmergencyLocations(onlyActive = true): Promise<{ data: EmergencyLocation[]; error?: string }> {
  let query = supabase
    .from('emergency_locations')
    .select('id, name, is_active, sort_order')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (onlyActive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as EmergencyLocation[] };
}

export async function createEmergencyLocation(name: string, sortOrder: number, createdBy: string | null): Promise<{ error?: string }> {
  const normalized = name.trim();
  if (!normalized) return { error: 'Lokasyon adı gerekli.' };
  const { error } = await supabase.from('emergency_locations').insert({
    name: normalized,
    sort_order: sortOrder,
    is_active: true,
    created_by: createdBy,
  });
  return error ? { error: error.message } : {};
}

export async function updateEmergencyLocation(
  id: string,
  payload: Partial<Pick<EmergencyLocation, 'name' | 'is_active' | 'sort_order'>>
): Promise<{ error?: string }> {
  const { error } = await supabase.from('emergency_locations').update(payload).eq('id', id);
  return error ? { error: error.message } : {};
}

export type StaffEmergencyAlertPayload = {
  location: string;
  note: string;
  authorName: string;
};

export function isStaffEmergencyAlertNotification(notificationType?: string | null): boolean {
  return (notificationType ?? '').trim() === STAFF_EMERGENCY_NOTIFICATION_TYPE;
}

export function staffEmergencyAlertFromData(
  data: Record<string, unknown> | null | undefined,
  fallbackBody?: string | null
): StaffEmergencyAlertPayload {
  const location =
    typeof data?.location === 'string'
      ? data.location.trim()
      : typeof data?.locationName === 'string'
        ? data.locationName.trim()
        : '';
  const note = typeof data?.note === 'string' ? data.note.trim() : '';
  let authorName =
    typeof data?.createdByName === 'string'
      ? data.createdByName.trim()
      : typeof data?.authorName === 'string'
        ? data.authorName.trim()
        : '';
  if (!authorName && fallbackBody) {
    const match = fallbackBody.match(/Bildirimi g[oö]nderen:\s*(.+?)(?:\s+Saat:|$)/i);
    if (match?.[1]) authorName = match[1].trim();
  }
  return { location, note, authorName };
}

export function buildStaffEmergencyConfirmBody(params: {
  location: string;
  note?: string;
  withoutNote: (location: string) => string;
  withNote: (location: string, note: string) => string;
}): string {
  const location = params.location.trim();
  const note = (params.note ?? '').trim();
  if (note) return params.withNote(location, note);
  return params.withoutNote(location);
}

export function buildStaffEmergencyNotificationCopy(payload: StaffEmergencyAlertPayload): {
  title: string;
  body: string;
} {
  const { location, note, authorName } = payload;
  const title = location ? `🆘 Acil Durum — ${location}` : '🆘 Acil Durum';
  const parts: string[] = [];
  if (authorName) {
    parts.push(`${authorName} tarafından gönderildi.`);
  }
  if (location) {
    parts.push(`Tüm personel acilen ${location} toplanma alanına gitmelidir.`);
  } else {
    parts.push('Tüm personel acilen belirtilen toplanma alanına gitmelidir.');
  }
  if (note) {
    parts.push(`Not: ${note}`);
  }
  return { title, body: parts.join(' ') };
}

export async function notifyStaffEmergency(params: {
  locationName: string;
  note?: string;
  createdByStaffId: string;
  createdByName?: string | null;
  organizationId?: string | null;
}): Promise<{ count: number; error?: string }> {
  const location = params.locationName.trim();
  const note = (params.note ?? '').trim();
  const authorName = (params.createdByName ?? '').trim();
  const { title, body } = buildStaffEmergencyNotificationCopy({ location, note, authorName });

  return sendBulkToStaff({
    target: 'all_staff',
    organizationId: params.organizationId ?? null,
    title,
    body,
    createdByStaffId: params.createdByStaffId,
    notificationType: STAFF_EMERGENCY_NOTIFICATION_TYPE,
    category: 'emergency',
    data: {
      emergency: true,
      location,
      note: note || undefined,
      createdByName: authorName || undefined,
      sound: STAFF_EMERGENCY_SOUND_NAME,
      androidChannelId: STAFF_EMERGENCY_ANDROID_CHANNEL,
      url: '/staff/(tabs)/notifications',
    },
  });
}
