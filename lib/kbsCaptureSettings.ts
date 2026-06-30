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

  const { data: existing, error: readErr } = await supabase
    .from('kbs_capture_settings')
    .select('organization_id')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (readErr) return { ok: false, message: readErr.message };

  if (existing) {
    const { error } = await supabase
      .from('kbs_capture_settings')
      .update({ notify_staff_ids: unique })
      .eq('organization_id', organizationId);
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  }

  const { error } = await supabase.from('kbs_capture_settings').insert({
    organization_id: organizationId,
    notify_staff_ids: unique,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
