import { supabase } from '@/lib/supabase';

export async function fetchKitchenMenuOrderNotifyStaffIds(organizationId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('kitchen_ops_settings')
    .select('menu_order_notify_staff_ids')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error || !data) return [];
  const ids = (data as { menu_order_notify_staff_ids?: string[] | null }).menu_order_notify_staff_ids ?? [];
  return ids.filter(Boolean);
}

export async function saveKitchenMenuOrderNotifyStaffIds(
  organizationId: string,
  staffIds: string[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const unique = [...new Set(staffIds.filter(Boolean))];
  const { error } = await supabase
    .from('kitchen_ops_settings')
    .upsert(
      { organization_id: organizationId, menu_order_notify_staff_ids: unique },
      { onConflict: 'organization_id' }
    );
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
