import { apiPost } from '@/lib/kbsApi';
import { resolveOpsHotelIdForCaller } from '@/lib/resolveOpsHotelId';
import { supabase } from '@/lib/supabase';

/** Staff app_permissions → OPS kbs.submit / kbs.checkout kodları. */
export const KBS_STAFF_TO_OPS_PERMS: Record<string, string[]> = {
  kbs_bildir: ['kbs.submit.single', 'kbs.submit.bulk'],
  kbs_cikis: ['kbs.checkout.single', 'kbs.checkout.bulk', 'kbs.checkout.by_room'],
};

/**
 * Personel kaydındaki KBS Bildir/Çıkış toggle’larını OPS user_permissions ile hizalar.
 * Hedef: ops.app_users.id = staff.auth_id.
 */
export async function syncStaffKbsPermsToOps(args: {
  staffAuthId: string | null | undefined;
  permissions: Record<string, boolean>;
}): Promise<void> {
  const authId = args.staffAuthId?.trim();
  if (!authId) return;

  const permissions: Record<string, boolean> = {};
  for (const [staffKey, opsCodes] of Object.entries(KBS_STAFF_TO_OPS_PERMS)) {
    const allowed = args.permissions[staffKey] === true;
    for (const code of opsCodes) permissions[code] = allowed;
  }
  if (Object.keys(permissions).length === 0) return;

  // 1) Railway admin API (tercih)
  const viaApi = await apiPost(`/admin/users/${authId}/permissions`, { permissions });
  if (viaApi.ok) {
    const enableTab = args.permissions.kbs_bildir === true || args.permissions.kbs_cikis === true;
    if (enableTab) {
      await apiPost(`/admin/users/${authId}/kbs-access`, { enabled: true });
    }
    return;
  }

  // 2) Doğrudan ops upsert (RLS admin/manager)
  const ctx = await resolveOpsHotelIdForCaller();
  if (!ctx.ok) return;

  const { data: me } = await supabase.auth.getUser();
  const actorId = me.user?.id ?? null;

  for (const [code, allowed] of Object.entries(permissions)) {
    await supabase.schema('ops').from('user_permissions').upsert(
      {
        hotel_id: ctx.hotelId,
        user_id: authId,
        permission_code: code,
        is_allowed: allowed,
        assigned_by: actorId,
      },
      { onConflict: 'hotel_id,user_id,permission_code' }
    );
  }

  if (args.permissions.kbs_bildir === true || args.permissions.kbs_cikis === true) {
    await supabase
      .schema('ops')
      .from('app_users')
      .update({ kbs_access_enabled: true })
      .eq('id', authId);
  }
}
