/**
 * staff.app_permissions ve role ile yetki kontrolleri.
 * DB RLS (ör. staff_assignments) ile uyumlu olmalı.
 */

export type StaffPermissionSlice = {
  role?: string | null;
  app_permissions?: Record<string, boolean> | null;
} | null | undefined;

/** Tam yönetim paneli shell’i (admin veya görev atama yetkisi). */
export function canAccessAdminShell(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  return staff.app_permissions?.gorev_ata === true;
}

/** Sadece görev ekranlarına izin verilen personel (admin değil, gorev_ata var). */
export function isGorevAtaOnlyUser(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return false;
  return staff.app_permissions?.gorev_ata === true;
}

/** Görev oluşturma (insert) — admin veya gorev_ata. */
export function canStaffCreateAssignments(staff: StaffPermissionSlice): boolean {
  return canAccessAdminShell(staff);
}

/** Referanslı satış / komisyon modülü (personel uygulaması + admin listesi için). */
export function canAccessReservationSales(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin' || staff.role === 'reception_chief') return true;
  return staff.app_permissions?.satis_komisyon === true;
}

/** Doküman Yönetimi: belge yükleme/düzenleme yetkisi olan personel. */
export function canAccessDocumentManagement(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  const perms = staff.app_permissions ?? {};
  return (
    perms.dokuman_yukle === true ||
    perms.dokuman_yonetimi === true ||
    perms.document_upload === true ||
    perms.document_management === true
  );
}

/** Kahvaltı teyit kaydı oluşturma (asıl kontrol DB; menü için). */
export function hasBreakfastConfirmCreatePermission(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  return staff.app_permissions?.kahvalti_teyit_olustur === true;
}

/** Tutanak Sistemi: personel olusturma/listeleme, admin tam yonetim */
export function canAccessIncidentReports(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  const perms = staff.app_permissions ?? {};
  return perms.incident_reports === true || perms.tutanaklar === true;
}

/** Personel uygulaması: Teknik QR / Akıllı envanter modülüne giriş (QR okuma + talimatlar). */
export function hasTechnicalAssetsStaffAccess(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  const p = staff.app_permissions ?? {};
  return !!(p.teknik_varliklar || p.teknik_varliklar_okuma || p.teknik_varlik_yonetimi);
}

/**
 * Yönetim paneli: bina/lokasyon/varlık tanımlama ve QR etiket yönetimi.
 * Tam admin veya `teknik_varlik_yonetimi` yetkisi (görev-ata-only panelde değil).
 */
export function canAccessTechnicalAssetsAdminRoutes(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (!canAccessAdminShell(staff) || isGorevAtaOnlyUser(staff)) return false;
  if (staff.role === 'admin') return true;
  return staff.app_permissions?.teknik_varlik_yonetimi === true;
}

/** Müdahale kaydı ve varlık durumu güncelleme (teknik personel). */
export function canOperateTechnicalAssets(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  const p = staff.app_permissions ?? {};
  return !!(p.teknik_varliklar || p.teknik_varlik_yonetimi);
}

/** Sadece okuma: müdahale / durum değişikliği UI gizlenir. */
export function hasTechnicalAssetsReadonlyAccess(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (canOperateTechnicalAssets(staff)) return false;
  return !!(staff.app_permissions?.teknik_varliklar_okuma);
}
