import { supabase } from './supabase';

export type StaffKbsPerms = {
  role: string | null;
  kbs_bildir: boolean;
  kbs_cikis: boolean;
  id_capture: boolean;
  account_locked?: boolean;
};

export async function loadStaffKbsPerms(authUserId: string): Promise<StaffKbsPerms> {
  const { data } = await supabase
    .from('staff')
    .select('role, app_permissions, account_locked')
    .eq('auth_id', authUserId)
    .eq('is_active', true)
    .eq('account_locked', false)
    .is('deleted_at', null)
    .maybeSingle();

  if (!data) {
    // Kilitli veya pasif: yetki yok
    const { data: locked } = await supabase
      .from('staff')
      .select('account_locked')
      .eq('auth_id', authUserId)
      .maybeSingle();
    return {
      role: null,
      kbs_bildir: false,
      kbs_cikis: false,
      id_capture: false,
      account_locked: locked?.account_locked === true,
    };
  }

  const role = (data.role as string | null) ?? null;
  const perms = (data.app_permissions ?? {}) as Record<string, boolean>;
  const isAdmin = role === 'admin';

  return {
    role,
    kbs_bildir: isAdmin || perms.kbs_bildir === true,
    kbs_cikis: isAdmin || perms.kbs_cikis === true,
    id_capture: isAdmin || perms.id_capture === true,
    account_locked: false,
  };
}
