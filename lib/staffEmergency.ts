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

export async function notifyStaffEmergency(params: {
  locationName: string;
  note?: string;
  createdByStaffId: string;
  createdByName?: string | null;
  organizationId?: string | null;
}): Promise<{ count: number; error?: string }> {
  const location = params.locationName.trim();
  const note = (params.note ?? '').trim();
  const author = (params.createdByName ?? '').trim();
  const title = `Acil Durum: ${location}`;
  const body = [
    `${location} noktasinda acil durum bildirimi var.`,
    note ? `Not: ${note}` : null,
    author ? `Bildirimi gonderen: ${author}` : null,
    `Saat: ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`,
  ]
    .filter(Boolean)
    .join(' ');

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
      note,
      sound: STAFF_EMERGENCY_SOUND_NAME,
      androidChannelId: STAFF_EMERGENCY_ANDROID_CHANNEL,
      url: '/staff/(tabs)/notifications',
    },
  });
}
