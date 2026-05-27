/**
 * Uygulama özellik kataloğu — admin işletme bazında aç/kapa ve yerleşim seçer.
 */

export type AppFeatureAudience = 'staff' | 'customer';

export type AppFeaturePlacement =
  | 'tab'
  | 'profile'
  | 'hamburger'
  | 'header_left'
  | 'header_right';

export type AppFeatureCatalogEntry = {
  id: string;
  labelTr: string;
  audience: AppFeatureAudience;
  /** Varsayılan açık mı (yapılandırma yoksa) */
  defaultEnabled: boolean;
  /** Varsayılan gösterim yerleri */
  defaultPlacements: AppFeaturePlacement[];
  /** Kapatılamaz (profil ayarları, yasal vb.) */
  locked?: boolean;
  /** İlgili expo-router sekme adı (tab yerleşimi için) */
  tabRoute?: string;
  /** Personel hamburger menü kimliği (staffMenuCatalog ile aynı) */
  hamburgerMenuId?: string;
};

export const APP_FEATURE_CATALOG: AppFeatureCatalogEntry[] = [
  // —— Personel sekmeleri ——
  { id: 'staff_tab_feed', labelTr: 'Personel akış (ana sekme)', audience: 'staff', defaultEnabled: true, defaultPlacements: ['tab'], tabRoute: 'index' },
  { id: 'staff_tab_tasks', labelTr: 'Görevler sekmesi', audience: 'staff', defaultEnabled: true, defaultPlacements: ['tab'], tabRoute: 'tasks' },
  { id: 'staff_tab_stock', labelTr: 'Stok sekmesi', audience: 'staff', defaultEnabled: true, defaultPlacements: ['tab'], tabRoute: 'stock' },
  { id: 'staff_tab_messages', labelTr: 'Mesajlar sekmesi', audience: 'staff', defaultEnabled: true, defaultPlacements: ['tab'], tabRoute: 'messages' },
  { id: 'staff_tab_emergency', labelTr: 'Acil durum sekmesi', audience: 'staff', defaultEnabled: true, defaultPlacements: ['tab'], tabRoute: 'emergency' },
  { id: 'staff_tab_acceptances', labelTr: 'Sözleşme onayları sekmesi', audience: 'staff', defaultEnabled: true, defaultPlacements: ['tab'], tabRoute: 'acceptances' },
  { id: 'staff_tab_admin', labelTr: 'Yönetim sekmesi', audience: 'staff', defaultEnabled: true, defaultPlacements: ['tab'], tabRoute: 'admin' },
  { id: 'staff_tab_profile', labelTr: 'Profil sekmesi', audience: 'staff', defaultEnabled: true, defaultPlacements: ['tab'], tabRoute: 'profile', locked: true },

  // —— Personel hamburger (staffMenuCatalog ile eşleşen id) ——
  { id: 'home', labelTr: 'Ana sayfa (feed)', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'home' },
  { id: 'map', labelTr: 'Harita', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'map' },
  { id: 'board', labelTr: 'Duyuru panosu', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'board' },
  { id: 'emergency', labelTr: 'Acil durum', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger', 'tab'], hamburgerMenuId: 'emergency' },
  { id: 'tasks', labelTr: 'Görevler', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger', 'tab'], hamburgerMenuId: 'tasks' },
  { id: 'attendance', labelTr: 'Mesai / devam', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'attendance' },
  { id: 'perf', labelTr: 'Performans paneli', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'perf' },
  { id: 'meal', labelTr: 'Personel yemek listesi', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'meal' },
  { id: 'meal_edit', labelTr: 'Yemek listesi düzenleme', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'meal_edit' },
  { id: 'meal_hist', labelTr: 'Yemek listesi geçmişi', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'meal_hist' },
  { id: 'breakfast_staff', labelTr: 'Kahvaltı teyidi', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'breakfast_staff' },
  { id: 'salary_history', labelTr: 'Maaş geçmişim', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'salary_history' },
  { id: 'cleaning', labelTr: 'Yarın temizlik planı', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'cleaning' },
  { id: 'official_warnings', labelTr: 'Resmi uyarılar', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'official_warnings' },
  { id: 'expenses_all', labelTr: 'Tüm giderler (admin)', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'expenses_all' },
  { id: 'expenses_mine', labelTr: 'Giderlerim', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'expenses_mine' },
  { id: 'complaint', labelTr: 'İç şikayet', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'complaint' },
  { id: 'assign', labelTr: 'Yeni görev ata', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'assign' },
  { id: 'contracts_staff', labelTr: 'Sözleşmeler (personel)', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'contracts_staff' },
  { id: 'passports', labelTr: 'Pasaport / MRZ', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger', 'header_right'], hamburgerMenuId: 'passports' },
  { id: 'hotel_kitchen_menu', labelTr: 'Otel mutfağı menüsü', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'hotel_kitchen_menu' },
  { id: 'hotel_kitchen_menu_manage', labelTr: 'Otel mutfağı — yönetim', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'hotel_kitchen_menu_manage' },
  { id: 'guests', labelTr: 'Misafirler', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'guests' },
  { id: 'transfer', labelTr: 'Transfer & tur', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'transfer' },
  { id: 'dining', labelTr: 'Yemek & mekanlar', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'dining' },
  { id: 'area_guide_staff', labelTr: 'Bölge rehberi', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'area_guide_staff' },
  { id: 'missing', labelTr: 'Eksik eşya bildirimi', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'missing' },
  { id: 'facility_journal_new', labelTr: 'Tesis günlüğü — yeni', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'facility_journal_new' },
  { id: 'facility_journal', labelTr: 'Tesis günlüğü listesi', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'facility_journal' },
  { id: 'lost_found_new', labelTr: 'Emanet / buluntu — yeni', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'lost_found_new' },
  { id: 'lost_found', labelTr: 'Emanet / buluntu listesi', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'lost_found' },
  { id: 'stock', labelTr: 'Stok (hamburger)', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'stock' },
  { id: 'my_stock', labelTr: 'Stok hareketlerim', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'my_stock' },
  { id: 'docs', labelTr: 'Doküman yönetimi', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'docs' },
  { id: 'incident', labelTr: 'Tutanak oluştur', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'incident' },
  { id: 'sales', labelTr: 'Satış / komisyon', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'sales' },
  { id: 'demirbas', labelTr: 'Demirbaşlar', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'demirbas' },
  { id: 'debts', labelTr: 'Borç / alacak', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'debts' },
  { id: 'accounting', labelTr: 'Muhasebe merkezi', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'accounting' },
  { id: 'admin_tab', labelTr: 'Yönetim (hamburger)', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'admin_tab' },
  { id: 'audits', labelTr: 'Denetim panosu', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'audits' },
  { id: 'staff_month_best', labelTr: 'Ayın en iyi personeli', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'staff_month_best' },
  { id: 'transfer_a', labelTr: 'Transfer & tur (yönetim)', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'transfer_a' },
  { id: 'dining_a', labelTr: 'Yemek & mekanlar (yönetim)', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'dining_a' },
  { id: 'area_guide', labelTr: 'Bölge rehberi (admin)', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'area_guide' },
  { id: 'breakfast_admin', labelTr: 'Kahvaltı kayıtları (admin)', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'breakfast_admin' },
  { id: 'salary_all', labelTr: 'Tüm ödemeler', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'salary_all' },
  { id: 'contracts_all', labelTr: 'Tüm sözleşmeler', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'contracts_all' },
  { id: 'stock_all', labelTr: 'Tüm stoklar', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'stock_all' },
  { id: 'finance_checks', labelTr: 'Çek takibi', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'finance_checks' },
  { id: 'debts_admin', labelTr: 'Borç / alacak (admin)', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'debts_admin' },
  { id: 'kbs', labelTr: 'KBS işlemleri', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'kbs' },
  { id: 'tech', labelTr: 'Teknik envanter / QR', audience: 'staff', defaultEnabled: true, defaultPlacements: ['hamburger'], hamburgerMenuId: 'tech' },

  // —— Misafir sekmeleri ——
  { id: 'customer_tab_home', labelTr: 'Ana sayfa', audience: 'customer', defaultEnabled: true, defaultPlacements: ['tab'], tabRoute: 'index' },
  { id: 'customer_tab_map', labelTr: 'Harita', audience: 'customer', defaultEnabled: true, defaultPlacements: ['tab'], tabRoute: 'map' },
  { id: 'customer_tab_transfer', labelTr: 'Transfer & tur', audience: 'customer', defaultEnabled: true, defaultPlacements: ['tab'], tabRoute: 'transfer-tour' },
  { id: 'customer_tab_messages', labelTr: 'Mesajlar', audience: 'customer', defaultEnabled: true, defaultPlacements: ['tab'], tabRoute: 'messages' },
  { id: 'customer_tab_dining', labelTr: 'Yemek & mekanlar', audience: 'customer', defaultEnabled: true, defaultPlacements: ['tab'], tabRoute: 'dining-venues' },
  { id: 'customer_tab_complaints', labelTr: 'Şikayet / öneri', audience: 'customer', defaultEnabled: true, defaultPlacements: ['tab'], tabRoute: 'complaints' },
  { id: 'customer_tab_personel', labelTr: 'Personel sekmesi (admin)', audience: 'customer', defaultEnabled: true, defaultPlacements: ['tab'], tabRoute: 'personel' },
  { id: 'customer_tab_profile', labelTr: 'Profil sekmesi', audience: 'customer', defaultEnabled: true, defaultPlacements: ['tab'], tabRoute: 'profile', locked: true },

  // —— Misafir profil menüsü ——
  { id: 'customer_profile_edit', labelTr: 'Profili düzenle', audience: 'customer', defaultEnabled: true, defaultPlacements: ['profile'], locked: true },
  { id: 'customer_profile_posts', labelTr: 'Gönderilerim', audience: 'customer', defaultEnabled: true, defaultPlacements: ['profile'] },
  { id: 'customer_profile_carbon', labelTr: 'Karbon ayak izi', audience: 'customer', defaultEnabled: true, defaultPlacements: ['profile'] },
  { id: 'customer_profile_emergency', labelTr: 'Acil durum', audience: 'customer', defaultEnabled: true, defaultPlacements: ['profile'] },
  { id: 'customer_profile_area_guide', labelTr: 'Gezilecek yerler', audience: 'customer', defaultEnabled: true, defaultPlacements: ['profile'] },
  { id: 'customer_profile_notifications', labelTr: 'Bildirim ayarları', audience: 'customer', defaultEnabled: true, defaultPlacements: ['profile'], locked: true },
  { id: 'customer_profile_blocked', labelTr: 'Engellenenler', audience: 'customer', defaultEnabled: true, defaultPlacements: ['profile'] },
  { id: 'customer_feed_create', labelTr: 'Gönderi paylaş (üst sol)', audience: 'customer', defaultEnabled: true, defaultPlacements: ['header_left'] },
  { id: 'customer_notifications_bell', labelTr: 'Bildirim zili (üst sağ)', audience: 'customer', defaultEnabled: true, defaultPlacements: ['header_right'] },
];

export const APP_FEATURE_BY_ID = new Map(APP_FEATURE_CATALOG.map((e) => [e.id, e]));

export const PLACEMENT_LABELS_TR: Record<AppFeaturePlacement, string> = {
  tab: 'Alt sekme',
  profile: 'Profil menüsü',
  hamburger: 'Hamburger menü',
  header_left: 'Üst sol',
  header_right: 'Üst sağ',
};

export function catalogForAudience(audience: AppFeatureAudience): AppFeatureCatalogEntry[] {
  return APP_FEATURE_CATALOG.filter((e) => e.audience === audience);
}

/** Sekme route adından özellik kimliği */
export function staffTabFeatureId(routeName: string): string | null {
  const entry = APP_FEATURE_CATALOG.find((e) => e.audience === 'staff' && e.tabRoute === routeName);
  return entry?.id ?? null;
}

export function customerTabFeatureId(routeName: string): string | null {
  const entry = APP_FEATURE_CATALOG.find((e) => e.audience === 'customer' && e.tabRoute === routeName);
  return entry?.id ?? null;
}
