/** Personel düzenleme ekranında atanır (staff.app_permissions). */
export const APP_PERM_ID_CAPTURE = 'id_capture' as const;

type MrzStaff = {
  role?: string | null;
  kbs_access_enabled?: boolean;
  app_permissions?: Record<string, boolean> | null;
} | null | undefined;

function hasIdCapturePermission(perms: Record<string, boolean>): boolean {
  return (
    perms[APP_PERM_ID_CAPTURE] === true ||
    perms.kimlik_cekim === true ||
    perms.kimlik_cekim_sistemi === true
  );
}

/**
 * Pasaport MRZ: Admin çalışan düzenlemede `kbs_mrz_scan` açık olmalı; ayrıca KBS erişimi (ops) kapalı değil.
 */
export function canStaffUseMrzScan(staff: MrzStaff): boolean {
  if (!staff?.role) return false;
  const perms = staff.app_permissions ?? {};
  if (perms.kbs_mrz_scan !== true) return false;
  if (staff.role === 'admin') return staff.kbs_access_enabled !== false;
  return staff.kbs_access_enabled === true;
}

/** Kimlik/pasaport çekim + çekilen liste (MRZ/KBS tam modülünden bağımsız; `id_capture` yetkisi). */
export function canStaffUseIdCapture(staff: MrzStaff): boolean {
  if (!staff?.role) return false;
  return hasIdCapturePermission(staff.app_permissions ?? {});
}
