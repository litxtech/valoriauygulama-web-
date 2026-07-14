import { hasStaffAppPermission, type StaffPermissionSlice } from '@/lib/staffPermissions';

type KbsStaffSlice = StaffPermissionSlice & {
  kbs_access_enabled?: boolean | null;
};

/** Jandarma bildir (check-in). Admin her zaman; diğerleri kbs_bildir. */
export function canKbsCheckin(staff: KbsStaffSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  return hasStaffAppPermission(staff, 'kbs_bildir');
}

/** KBS çıkış. Admin her zaman; diğerleri kbs_cikis. */
export function canKbsCheckout(staff: KbsStaffSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  return hasStaffAppPermission(staff, 'kbs_cikis');
}

/** Toplu / oda bazlı çıkış — çıkış yetkisi yeterli. */
export function canKbsBulkCheckout(staff: KbsStaffSlice): boolean {
  return canKbsCheckout(staff);
}

/**
 * Sil + yeniden bildir (Jandarma’da update yok).
 * Bildir yetkisi olan veya admin düzeltip yeniden gönderebilir.
 */
export function canKbsDeleteAndResubmit(staff: KbsStaffSlice): boolean {
  return canKbsCheckin(staff);
}

export function canViewKbsLogs(staff: KbsStaffSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  if (staff.role === 'manager') return true;
  return canKbsCheckin(staff) || canKbsCheckout(staff);
}
