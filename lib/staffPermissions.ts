/**
 * staff.app_permissions ve role ile yetki kontrolleri.
 * DB RLS (ör. staff_assignments) ile uyumlu olmalı.
 */

export type StaffPermissionSlice = {
  role?: string | null;
  app_permissions?: Record<string, boolean> | null;
  tips_enabled?: boolean | null;
} | null | undefined;

/** Genel app_permissions kontrolü — admin rolü tüm modüllere erişir. */
export function hasStaffAppPermission(staff: StaffPermissionSlice, key: string): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  const perms = staff.app_permissions ?? {};
  if (perms[key] === true) return true;
  if (key === 'tutanaklar' && (perms.incident_reports === true || perms.tutanaklar === true)) return true;
  return false;
}

/** Misafir bahşiş butonu — tips_enabled kolonu + bahsis_alabilir izni */
export function canStaffReceiveGuestTips(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.tips_enabled === false) return false;
  if (staff.role === 'admin') return true;
  const v = staff.app_permissions?.bahsis_alabilir;
  if (v === false) return false;
  return true;
}

/** Stripe tahsilat listesi (admin panel ödemeler ekranı). */
export function canAccessAdminPayments(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  return staff.app_permissions?.stripe_odemeler === true;
}

/** Tam yönetim paneli shell’i (admin veya görev atama yetkisi). */
export function canAccessAdminShell(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  return staff.app_permissions?.gorev_ata === true;
}

/** Not Al — admin veya not_al izni. */
export function canAccessQuickNotes(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  return staff.app_permissions?.not_al === true;
}

/** @deprecated use canAccessQuickNotes */
export function canAccessAdminQuickNotes(staff: StaffPermissionSlice): boolean {
  return canAccessQuickNotes(staff);
}

/** Yönetici: org içindeki tüm notları (personel + kendi) görür. */
export function canViewAllOrgQuickNotes(staff: StaffPermissionSlice): boolean {
  return staff?.role === 'admin';
}

/** Görev oluşturma (insert) — admin veya gorev_ata. */
export function canStaffCreateAssignments(staff: StaffPermissionSlice): boolean {
  return canAccessAdminShell(staff);
}

/** Eksik Var hazır liste düzenleme (otel / mutfak katalog). */
export function canManageMissingItemsCatalog(staff: StaffPermissionSlice): boolean {
  return canAccessAdminShell(staff);
}

/**
 * Doluluk / oda operasyonları: giriş-çıkış, oda atama, misafir yönetimi, günlük doluluk.
 * Admin ve resepsiyon şefi varsayılan; diğer personelde `doluluk_operasyon` yetkisi gerekir.
 */
export function canAccessOccupancyOps(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin' || staff.role === 'reception_chief') return true;
  return staff.app_permissions?.doluluk_operasyon === true;
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

/** Otel eşyaları kullanımı: yayınlanmış rehber/videoları görüntüleme, kayıt oluşturma (admin veya tesis_gunlugu). */
export function canAccessFacilityJournal(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  return staff.app_permissions?.tesis_gunlugu === true;
}

/** Misafir şikayetleri / önerileri: listeleme ve durum güncelleme (admin veya misafir_sikayetleri). */
export function canAccessGuestComplaints(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  return staff.app_permissions?.misafir_sikayetleri === true;
}

/** Kayıt tipi tanımlama — yalnızca admin. */
export function canManageFacilityJournalTypes(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  return staff.role === 'admin';
}

/** Kayıp eşya (buluntu): kayıt oluşturma, liste, teslim (admin veya emanet_buluntu yetkisi). */
export function canAccessLostFound(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  const perms = staff.app_permissions ?? {};
  return perms.emanet_buluntu === true || perms.lost_found === true;
}

/** Tutanak Sistemi: personel olusturma/listeleme, admin tam yonetim */
export function canAccessIncidentReports(staff: StaffPermissionSlice): boolean {
  return hasStaffAppPermission(staff, 'tutanaklar');
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
  if (staff.role === 'admin') return true;
  if (hasStaffAppPermission(staff, 'mutfak_operasyon')) return true;
  const dept = (staff.department ?? '').trim().toLowerCase();
  return MEAL_MENU_KITCHEN_DEPARTMENTS.has(dept);
}

/** Mutfak operasyon yönetimi (düzeltme, silme, limit, rapor). */
export function canManageKitchenOps(staff: StaffPermissionSlice): boolean {
  return hasStaffAppPermission(staff, 'mutfak_operasyon_yonetim');
}

/**
 * Mutfak–resepsiyon finans paneli (hasılat/gider özeti, temiz kalan para).
 * Admin seçili personel + reception + mutfak yönetim yetkisi.
 */
export function canAccessKitchenFinance(
  staff: (StaffPermissionSlice & { id?: string | null }) | null | undefined,
  financeStaffIds?: string[] | null
): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  if (canManageKitchenOps(staff)) return true;
  if (canAccessKitchenReceptionAccounting(staff)) return true;
  if (staff.id && financeStaffIds?.includes(staff.id)) return true;
  return false;
}

/** Reception mutfak muhasebe kontrolü (POS onay, gün sonu). */
export function canAccessKitchenReceptionAccounting(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  if (staff.role === 'reception_chief' || staff.role === 'receptionist') return true;
  if (hasStaffAppPermission(staff, 'mutfak_operasyon_yonetim')) return true;
  return hasStaffAppPermission(staff, 'reception_mutfak_muhasebe');
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

/** Valoria Sözleşme Yönetimi: oluşturma, düzenleme, onay, arşiv. */
export function canManageManagedContracts(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  const p = staff.app_permissions ?? {};
  return p.sozlesme_yonetimi === true || p.super_admin === true;
}

/** Valoria Sözleşme Yönetimi: görüntüleme (atanan veya taraf). */
export function canViewManagedContracts(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (canManageManagedContracts(staff)) return true;
  if (staff.app_permissions?.sozlesme_goruntuleme === true) return true;
  return isKitchenStaffMember(staff);
}

/** Admin stack içinde /admin/managed-contracts* rotaları. */
export function isManagedContractsAdminPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? '').replace(/\/+$/, '');
  return p === '/admin/managed-contracts' || p.startsWith('/admin/managed-contracts/');
}

/** Sözleşme hazırlama modülü (admin yönetim paneli şart değil). */
export function canAccessManagedContractsAdminRoutes(staff: StaffPermissionSlice): boolean {
  return canAccessAdminShell(staff) || canManageManagedContracts(staff);
}

/** Bölüm kuralları: oluşturma, düzenleme, yayınlama, arşiv (tam yönetim). */
export function canManageDepartmentRules(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  const p = staff.app_permissions ?? {};
  return p.bolum_kurallari_yonetim === true || p.super_admin === true;
}

/** Bölüm kuralı oluşturma — hamburger menü ve /admin/department-rules/new erişimi. */
export function canCreateDepartmentRules(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (canManageDepartmentRules(staff)) return true;
  const p = staff.app_permissions ?? {};
  return p.bolum_kurallari_duzenle === true || p.bolum_kurallari_yonetim === true;
}

/** Bölüm kuralları: yayınlanmış kuralları görüntüleme (departman / atama). Tüm personel menüyü görür; RLS içeriği filtreler. */
export function canViewDepartmentRules(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  return true;
}

/** Admin stack: /admin/department-rules* */
export function isDepartmentRulesAdminPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? '').replace(/\/+$/, '');
  return p === '/admin/department-rules' || p.startsWith('/admin/department-rules/');
}

export function canAccessDepartmentRulesAdminRoutes(staff: StaffPermissionSlice): boolean {
  return canAccessAdminShell(staff) || canManageDepartmentRules(staff) || canCreateDepartmentRules(staff);
}
