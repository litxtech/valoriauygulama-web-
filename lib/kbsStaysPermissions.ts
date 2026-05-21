import type { StaffPermissionSlice } from '@/lib/staffPermissions';

export function canKbsCheckin(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  return staff.role === 'admin' || staff.role === 'manager' || staff.role === 'receptionist' || staff.kbs_access_enabled === true;
}

export function canKbsCheckout(staff: StaffPermissionSlice): boolean {
  return canKbsCheckin(staff);
}

export function canKbsBulkCheckout(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  return staff.role === 'admin' || staff.role === 'manager';
}

export function canKbsDeleteAndResubmit(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  return staff.role === 'admin' || staff.role === 'manager';
}

export function canViewKbsLogs(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  return staff.role === 'admin' || staff.role === 'manager';
}
