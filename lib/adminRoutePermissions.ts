import { hasStaffAppPermission, canViewSecurityBlacklist, type StaffPermissionSlice } from '@/lib/staffPermissions';
import { canAccessFnbHub } from '@/lib/fnbHub';
import { canAccessKitchenReceptionAccounting } from '@/lib/staffPermissions';

/** Admin panel menü href → app_permissions anahtarı */
export const ADMIN_ROUTE_PERMISSION: Record<string, string> = {
  '/admin/rooms': 'doluluk_operasyon',
  '/admin/rooms/cleaning-plan': 'yarin_oda_temizlik_listesi',
  '/admin/rooms/new': 'doluluk_operasyon',
  '/admin/checkin': 'doluluk_operasyon',
  '/admin/housekeeping': 'housekeeping_yonetim',
  '/admin/tasks': 'gorev_ata',
  '/admin/points': 'puan_yonetimi',
  '/admin/attendance': 'mesai_takibi',
  '/admin/guests': 'misafir_yonetimi',
  '/admin/guest-welcome-card': 'guest_welcome_card',
  '/admin/report': 'raporlar',
  '/admin/report/breakfast-briefing': 'kahvalti_rapor',
  '/admin/sales': 'satis_komisyon',
  '/admin/hmb-reports': 'raporlar',
  '/admin/feed': 'gonderi_yonetimi',
  '/admin/hotel-pulse': 'hotel_pulse',
  '/admin/local-area-guide': 'bolge_rehberi',
  '/admin/notifications/bulk': 'toplu_duyuru',
  '/admin/announcements/compose': 'toplu_duyuru',
  '/admin/engagement': 'toplu_duyuru',
  '/admin/map': 'doluluk_operasyon',
  '/admin/smart-ops': 'operasyon_merkezi',
  '/admin/notifications/templates': 'toplu_duyuru',
  '/admin/notifications/sounds': 'toplu_duyuru',
  '/admin/notifications/event-log': 'toplu_duyuru',
  '/admin/staff-emergency': 'toplu_duyuru',
  '/admin/emergency-locations': 'toplu_duyuru',
  '/admin/reports': 'gonderi_yonetimi',
  '/admin/complaints': 'misafir_sikayetleri',
  '/admin/qr-complaints': 'misafir_sikayetleri',
  '/admin/staff-complaints': 'personel_sikayet_notlari',
  '/admin/approvals': 'onay_merkezi',
  '/admin/stock': 'stok_yonetimi',
  '/admin/stock/all': 'stok_yonetimi',
  '/admin/stock/approvals': 'stok_yonetimi',
  '/admin/kitchen-ops': 'mutfak_operasyon_yonetim',
  '/admin/kitchen-ops/reception': 'reception_mutfak_muhasebe',
  '/admin/tips': 'bahsis_yonetimi',
  '/admin/payments': 'stripe_odemeler',
  '/admin/accounting': 'muhasebe_merkezi',
  '/admin/expenses': 'harcama_yonetimi',
  '/admin/carbon': 'karbon_yonetimi',
  '/admin/meal-menu': 'yemek_listesi_olustur',
  '/admin/breakfast-confirm': 'kahvalti_teyit_departman',
  '/admin/transfer-tour': 'transfer_tour_services',
  '/admin/dining-venues': 'dining_venues',
  '/admin/room-service': 'oda_servisi_yonetim',
  '/admin/guest-extras': 'ekstra_ucret_yonetim',
  '/admin/salary': 'maas_yonetimi',
  '/admin/finance-checks': 'cek_takibi',
  '/admin/debts': 'borc_alacak_yonetim',
  '/admin/access': 'gecis_kontrolu',
  '/admin/cameras': 'kamera_yonetimi',
  '/admin/technical-assets': 'teknik_varlik_yonetimi',
  '/admin/kbs-settings': 'id_capture',
  '/admin/kbs-permissions': 'id_capture',
  '/admin/documents': 'dokuman_yukle',
  '/admin/maliye': 'maliye_merkezi',
  '/admin/incident-reports': 'tutanaklar',
  '/admin/missing-items': 'eksik_esya',
  '/admin/lost-found': 'emanet_buluntu',
  '/admin/facility-journal': 'tesis_gunlugu',
  '/admin/audits': 'denetim_panosu',
  '/admin/performance': 'performans_paneli',
  '/admin/contracts': 'tum_sozlesmeler',
  '/admin/managed-contracts': 'sozlesme_yonetimi',
  '/admin/department-rules': 'bolum_kurallari_yonetim',
  '/admin/contracts/contact-directory': 'tum_sozlesmeler',
  '/admin/contracts/all': 'tum_sozlesmeler',
  '/admin/staff': 'personel_ekle',
  '/admin/staff/list': 'personel_listesi',
  '/admin/organizations': 'isletme_yonetimi',
};

function normalizeAdminHref(href: string): string {
  return href.replace(/\/+$/, '') || '/admin';
}

export function adminRoutePermissionKey(href: string): string | null {
  const norm = normalizeAdminHref(href);
  if (ADMIN_ROUTE_PERMISSION[norm]) return ADMIN_ROUTE_PERMISSION[norm];
  const base = Object.keys(ADMIN_ROUTE_PERMISSION).find((k) => norm.startsWith(k + '/'));
  return base ? ADMIN_ROUTE_PERMISSION[base] : null;
}

/** gorev_ata dışında admin panel modülü açan en az bir yetki. */
export function hasAdminModulePermissionBeyondGorevAta(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  const keys = new Set(Object.values(ADMIN_ROUTE_PERMISSION));
  for (const key of keys) {
    if (key === 'gorev_ata') continue;
    if (hasStaffAppPermission(staff, key)) return true;
  }
  if (hasStaffAppPermission(staff, 'bolum_kurallari_duzenle')) return true;
  if (hasStaffAppPermission(staff, 'harcama_girisi')) return true;
  if (canAccessFnbHub(staff)) return true;
  return false;
}

/**
 * Yalnızca görev atama yetkisi olan personel (admin değil, başka admin modülü yok).
 * Admin panelden ek yetki verildiğinde false döner — menüdeki modüle giriş engellenmez.
 */
export function isGorevAtaOnlyUser(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return false;
  if (!hasStaffAppPermission(staff, 'gorev_ata')) return false;
  return !hasAdminModulePermissionBeyondGorevAta(staff);
}

/** Admin panel menü öğesi görünür mü? */
export function canAccessAdminRoute(staff: StaffPermissionSlice, href: string): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  if (href.startsWith('/admin/fnb-hub')) return canAccessFnbHub(staff);
  if (href.startsWith('/admin/kitchen-ops/reception')) return canAccessKitchenReceptionAccounting(staff);

  if (href.startsWith('/admin/blacklist')) return staff.role === 'admin';
  if (href.startsWith('/admin/breakfast-partners')) return staff.role === 'admin';
  if (href.startsWith('/admin/camera-requests')) return staff.role === 'admin';
  if (href.startsWith('/admin/trade-partners')) return staff.role === 'admin';
  if (href.startsWith('/staff/blacklist')) return canViewSecurityBlacklist(staff);

  const key = adminRoutePermissionKey(href);
  if (key) return hasStaffAppPermission(staff, key);

  if (href.startsWith('/admin/tasks')) return hasStaffAppPermission(staff, 'gorev_ata');
  if (href.startsWith('/admin/managed-contracts')) return hasStaffAppPermission(staff, 'sozlesme_yonetimi');
  if (href.startsWith('/admin/department-rules')) {
    return (
      hasStaffAppPermission(staff, 'bolum_kurallari_yonetim') ||
      hasStaffAppPermission(staff, 'bolum_kurallari_duzenle')
    );
  }
  if (href.startsWith('/admin/payments')) return hasStaffAppPermission(staff, 'stripe_odemeler');
  if (href.startsWith('/admin/expenses')) return hasStaffAppPermission(staff, 'harcama_yonetimi') || hasStaffAppPermission(staff, 'harcama_girisi');

  return false;
}

/** En az bir yönetim paneli modülü yetkisi (admin rolü dışı kısmi erişim). */
export function hasAnyAdminModulePermission(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  const keys = new Set(Object.values(ADMIN_ROUTE_PERMISSION));
  for (const key of keys) {
    if (hasStaffAppPermission(staff, key)) return true;
  }
  return false;
}
