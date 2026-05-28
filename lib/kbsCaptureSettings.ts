import { supabase } from '@/lib/supabase';

export async function fetchKbsCaptureNotifyStaffIds(organizationId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('kbs_capture_settings')
    .select('notify_staff_ids')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error || !data) return [];
  const ids = (data as { notify_staff_ids?: string[] | null }).notify_staff_ids ?? [];
  return ids.filter(Boolean);
}

export async function saveKbsCaptureNotifyStaffIds(
  organizationId: string,
  staffIds: string[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const unique = [...new Set(staffIds.filter(Boolean))];
  const { error } = await supabase
    .from('kbs_capture_settings')
    .upsert(
      { organization_id: organizationId, notify_staff_ids: unique },
      { onConflict: 'organization_id' }
    );
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
