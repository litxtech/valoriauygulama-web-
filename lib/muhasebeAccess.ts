import { hasStaffAppPermission, type StaffPermissionSlice } from '@/lib/staffPermissions';
import { canAccessAdminRoute } from '@/lib/adminRoutePermissions';

/** Web muhasebe portalı — cari muhasebe merkezi yetkisi. */
export function canAccessMuhasebeWeb(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  if (hasStaffAppPermission(staff, 'muhasebe_merkezi')) return true;
  return canAccessAdminRoute(staff, '/admin/accounting');
}
