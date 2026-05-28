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

/** Tesis günlüğü: kayıt oluşturma ve yetkili kayıtları görüntüleme (admin veya tesis_gunlugu). */
export function canAccessFacilityJournal(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  return staff.app_permissions?.tesis_gunlugu === true;
}

/** Kayıt tipi tanımlama — yalnızca admin. */
export function canManageFacilityJournalTypes(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  return staff.role === 'admin';
}

/** Emanet / buluntu: kayıt oluşturma, liste, teslim (admin veya emanet_buluntu yetkisi). */
export function canAccessLostFound(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  const perms = staff.app_permissions ?? {};
  return perms.emanet_buluntu === true || perms.lost_found === true;
}

/** Tutanak Sistemi: personel olusturma/listeleme, admin tam yonetim */
export function canAccessIncidentReports(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  const perms = staff.app_permissions ?? {};
  return perms.incident_reports === true || perms.tutanaklar === true;
}

/** Aylık personel yemek listesi oluşturma / düzenleme (mutfak vb.). */
export function canManageStaffMealMenu(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  return staff.app_permissions?.yemek_listesi_olustur === true;
}

/** Otel mutfağı menüsü: yemek/içecek ekleme, fiyat, görsel (oda servisi / dış mekan rehberinden ayrı). */
export function canManageHotelKitchenMenu(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  return staff.app_permissions?.otel_mutfak_menu === true;
}

/** Mutfak operasyon modülü (stok, hasılat, gün sonu) — genel otel stok sisteminden ayrı. */
export function canAccessKitchenOps(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (canAccessAdminShell(staff)) return true;
  if (staff.app_permissions?.mutfak_operasyon === true) return true;
  const dept = (staff.department ?? '').trim().toLowerCase();
  return MEAL_MENU_KITCHEN_DEPARTMENTS.has(dept);
}

/** Mutfak operasyon yönetimi (düzeltme, silme, limit, rapor). */
export function canManageKitchenOps(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (canAccessAdminShell(staff)) return true;
  return staff.app_permissions?.mutfak_operasyon_yonetim === true;
}

/** Reception mutfak muhasebe kontrolü (POS onay, gün sonu). */
export function canAccessKitchenReceptionAccounting(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (canAccessAdminShell(staff)) return true;
  if (staff.role === 'reception_chief') return true;
  return staff.app_permissions?.reception_mutfak_muhasebe === true;
}

/** Mutfak personeli (departman veya mutfak_operasyon yetkisi) — menü önceliği için. */
export function isKitchenStaffMember(
  staff: StaffPermissionSlice & { department?: string | null }
): boolean {
  if (!staff) return false;
  if (staff.app_permissions?.mutfak_operasyon === true) return true;
  const dept = (staff.department ?? '').trim().toLowerCase();
  return MEAL_MENU_KITCHEN_DEPARTMENTS.has(dept);
}

/** Mutfak günlük onay push / panel ile aynı departmanlar (274). */
export const MEAL_MENU_KITCHEN_DEPARTMENTS = new Set([
  'kitchen',
  'kitchen_staff',
  'mutfak',
  'chef',
  'head_chef',
  'pastry',
]);

/** Günlük mutfak onayı paneli: yalnızca mutfak personeli veya `yemek_listesi_mutfak_onay` yetkisi. */
export function isMealMenuKitchenStaff(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.app_permissions?.yemek_listesi_mutfak_onay === true) return true;
  const dept = (staff.department ?? '').trim().toLowerCase();
  return MEAL_MENU_KITCHEN_DEPARTMENTS.has(dept);
}

export function canSubmitMealMenuKitchenConfirm(staff: StaffPermissionSlice): boolean {
  return isMealMenuKitchenStaff(staff);
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
