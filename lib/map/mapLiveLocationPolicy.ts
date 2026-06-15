/** Haritada canlı konum paylaşımı — admin yalnızca izler, paylaşmaz. */
export function isAdminMapViewer(
  staff: { role?: string | null; app_permissions?: Record<string, boolean> | null } | null | undefined
): boolean {
  if (!staff) return false;
  return staff.role === 'admin' || staff.app_permissions?.super_admin === true;
}
