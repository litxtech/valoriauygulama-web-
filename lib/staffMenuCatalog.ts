/**
 * Hamburger menü öğe kimlikleri — admin panelinden personel bazlı gizlenebilir.
 * Yetki (app_permissions) verilmiş olsa bile menüde gösterilmez.
 */

export type StaffMenuCatalogSection = 'fnb' | 'kitchen' | 'nav' | 'staff' | 'hotel' | 'payments' | 'ops' | 'admin';

export type StaffMenuCatalogEntry = {
  id: string;
  labelTr: string;
  section: StaffMenuCatalogSection;
};

export const STAFF_MENU_CATALOG: StaffMenuCatalogEntry[] = [
  // F&B
  { id: 'fnb_hub', labelTr: 'F&B Merkezi', section: 'fnb' },
  // Mutfak hızlı işlemler
  { id: 'kitchen_ops', labelTr: 'Mutfak operasyonları', section: 'kitchen' },
  { id: 'kitchen_menu_orders', labelTr: 'Dijital menü siparişleri', section: 'kitchen' },
  { id: 'kitchen_ops_manage', labelTr: 'Mutfak operasyonları (yönetim)', section: 'kitchen' },
  { id: 'kitchen_reception', labelTr: 'Mutfak resepsiyon muhasebe', section: 'kitchen' },
  { id: 'kitchen_quick_entry', labelTr: 'Mutfak — giriş', section: 'kitchen' },
  { id: 'kitchen_quick_exit', labelTr: 'Mutfak — çıkış', section: 'kitchen' },
  { id: 'kitchen_quick_scan', labelTr: 'Mutfak — tarama', section: 'kitchen' },
  { id: 'kitchen_quick_current', labelTr: 'Mutfak — güncel stok', section: 'kitchen' },
  { id: 'kitchen_quick_low', labelTr: 'Mutfak — düşük stok', section: 'kitchen' },
  { id: 'kitchen_quick_revenue', labelTr: 'Mutfak — hasılat', section: 'kitchen' },
  { id: 'kitchen_quick_day_close', labelTr: 'Mutfak — gün kapanışı', section: 'kitchen' },
  // Gezinti
  { id: 'home', labelTr: 'Ana sayfa (feed)', section: 'nav' },
  { id: 'map', labelTr: 'Harita', section: 'nav' },
  { id: 'board', labelTr: 'Duyuru panosu', section: 'nav' },
  { id: 'emergency', labelTr: 'Acil durum', section: 'nav' },
  // Personel İşleri
  { id: 'tasks', labelTr: 'Görevler', section: 'staff' },
  { id: 'attendance', labelTr: 'Mesai / devam', section: 'staff' },
  { id: 'perf', labelTr: 'Performans paneli', section: 'staff' },
  { id: 'staff_points', labelTr: 'Alınan puanlarım', section: 'staff' },
  { id: 'admin_notes', labelTr: 'Not Al', section: 'staff' },
  { id: 'meal', labelTr: 'Personel yemek listesi', section: 'staff' },
  { id: 'meal_edit', labelTr: 'Yemek listesi düzenleme', section: 'staff' },
  { id: 'meal_hist', labelTr: 'Yemek listesi geçmişi', section: 'staff' },
  { id: 'breakfast_staff', labelTr: 'Kahvaltı teyidi yükle', section: 'staff' },
  { id: 'breakfast_briefing', labelTr: 'Sabah kahvaltı sayısı', section: 'hotel' },
  { id: 'breakfast_partner_board', labelTr: 'Partner kahvaltı panosu', section: 'kitchen' },
  { id: 'salary_history', labelTr: 'Maaş geçmişim', section: 'staff' },
  { id: 'cleaning', labelTr: 'Yarın temizlik planı', section: 'staff' },
  { id: 'cleaning_plan_admin', labelTr: 'Oda temizlik planı (bildir)', section: 'staff' },
  { id: 'official_warnings', labelTr: 'Resmi uyarılar', section: 'staff' },
  { id: 'expenses_new', labelTr: 'Yeni harcama girişi', section: 'staff' },
  { id: 'expenses_all', labelTr: 'Tüm giderler (admin)', section: 'staff' },
  { id: 'expenses_mine', labelTr: 'Giderlerim', section: 'staff' },
  { id: 'complaint', labelTr: 'İç şikayet', section: 'staff' },
  { id: 'assign', labelTr: 'Yeni görev ata', section: 'staff' },
  { id: 'contracts_staff', labelTr: 'Misafir sözleşme onayları', section: 'staff' },
  { id: 'managed_contracts_prepare', labelTr: 'Sözleşme hazırla', section: 'staff' },
  { id: 'managed_contracts_hub', labelTr: 'Sözleşme yönetimi', section: 'staff' },
  { id: 'managed_contracts_staff', labelTr: 'Sözleşmelerim (görüntüle)', section: 'staff' },
  { id: 'department_rules_new', labelTr: 'Kural oluştur', section: 'ops' },
  { id: 'department_rules_hub', labelTr: 'Bölüm kuralları yönetimi', section: 'ops' },
  { id: 'department_rules_staff', labelTr: 'Bölüm kuralları', section: 'ops' },
  { id: 'department_rules_create_admin', labelTr: 'Kural oluştur (yönetim)', section: 'admin' },
  { id: 'department_rules_admin', labelTr: 'Bölüm kuralları (yönetim)', section: 'admin' },
  { id: 'managed_contracts_prepare_admin', labelTr: 'Sözleşme hazırla (yönetim)', section: 'admin' },
  { id: 'passports', labelTr: 'Pasaport / MRZ', section: 'staff' },
  { id: 'id_capture', labelTr: 'Kimlik çekimi', section: 'staff' },
  { id: 'id_capture_history', labelTr: 'Kimlik çekim geçmişi', section: 'staff' },
  // F&B ek
  { id: 'fnb_sales_new', labelTr: 'Anlık satış gir', section: 'fnb' },
  { id: 'fnb_kitchen_revenue', labelTr: 'Mutfak hasılat gir', section: 'fnb' },
  { id: 'fnb_menu_manage', labelTr: 'Menü yönet (F&B)', section: 'fnb' },
  { id: 'fnb_menu_theme', labelTr: 'Web menü tasarımı', section: 'fnb' },
  // Otel & Misafir
  { id: 'hotel_kitchen_menu', labelTr: 'Otel mutfağı menüsü', section: 'hotel' },
  { id: 'hotel_kitchen_menu_manage', labelTr: 'Otel mutfağı — yönetim', section: 'hotel' },
  { id: 'guests', labelTr: 'Misafirler', section: 'hotel' },
  { id: 'guest_complaints', labelTr: 'Misafir şikayetleri', section: 'hotel' },
  { id: 'blacklist_view', labelTr: 'Kara Liste', section: 'hotel' },
  { id: 'guest_service_requests', labelTr: 'Misafir talepleri (oda / kayıp)', section: 'hotel' },
  { id: 'occupancy_ops', labelTr: 'Doluluk operasyonları', section: 'hotel' },
  { id: 'transfer', labelTr: 'Transfer & tur', section: 'hotel' },
  { id: 'dining', labelTr: 'Yemek & mekanlar', section: 'hotel' },
  { id: 'area_guide_staff', labelTr: 'Bölge rehberi', section: 'hotel' },
  // Tahsilat & Ödeme
  { id: 'payments_hub', labelTr: 'Tahsilat Merkezi', section: 'payments' },
  { id: 'payments_qr_standing', labelTr: 'Sabit QR oluştur', section: 'payments' },
  { id: 'payments_qr_single', labelTr: 'Tek seferlik QR', section: 'payments' },
  { id: 'payments_qr_stands', labelTr: 'Sabit QR noktaları', section: 'payments' },
  { id: 'payments_history', labelTr: 'Ödeme geçmişi', section: 'payments' },
  { id: 'payments_tips_lane', labelTr: 'Bahşiş tahsilatları', section: 'payments' },
  { id: 'payments_tips_confirm', labelTr: 'Bahşiş onay & iade', section: 'payments' },
  { id: 'payments_kitchen_lane', labelTr: 'Mutfak & restoran tahsilatları', section: 'payments' },
  { id: 'payments_hotel_lane', labelTr: 'Otel hizmeti tahsilatları', section: 'payments' },
  { id: 'payments_room_service', labelTr: 'Oda servisi siparişleri', section: 'payments' },
  { id: 'payments_guest_extras', labelTr: 'Ekstra ücret siparişleri', section: 'payments' },
  { id: 'payments_accounting', labelTr: 'Gelir / gider defteri', section: 'payments' },
  { id: 'payments_accounting_hub', labelTr: 'Muhasebe merkezi (tahsilat)', section: 'payments' },
  // Operasyon
  { id: 'missing', labelTr: 'Eksik eşya bildirimi', section: 'ops' },
  { id: 'facility_journal_new', labelTr: 'Otel eşyaları — yeni kullanım kaydı', section: 'ops' },
  { id: 'facility_journal', labelTr: 'Otel eşyaları kullanım kayıtları', section: 'ops' },
  { id: 'lost_found_new', labelTr: 'Buluntu — yeni kayıt', section: 'ops' },
  { id: 'lost_found', labelTr: 'Buluntu — tüm kayıtlar', section: 'ops' },
  { id: 'stock', labelTr: 'Stok sekmesi', section: 'ops' },
  { id: 'stock_quick_current', labelTr: 'Otel — güncel stok', section: 'ops' },
  { id: 'my_stock', labelTr: 'Stok hareketlerim', section: 'ops' },
  { id: 'docs', labelTr: 'Doküman yönetimi', section: 'ops' },
  { id: 'incident', labelTr: 'Tutanak oluştur', section: 'ops' },
  { id: 'sales', labelTr: 'Satış / komisyon', section: 'ops' },
  { id: 'demirbas', labelTr: 'Demirbaşlar', section: 'ops' },
  { id: 'debts', labelTr: 'Borç / alacak', section: 'ops' },
  { id: 'person_payments_quick', labelTr: 'Kişi ödemeleri (hızlı)', section: 'ops' },
  { id: 'accounting', labelTr: 'Muhasebe merkezi', section: 'ops' },
  // Yönetim
  { id: 'admin_tab', labelTr: 'Yönetim sekmesi', section: 'admin' },
  { id: 'attendance_admin', labelTr: 'Mesai takibi (yönetim)', section: 'admin' },
  { id: 'audits', labelTr: 'Denetim panosu', section: 'admin' },
  { id: 'staff_month_best', labelTr: 'Ayın en iyi personeli', section: 'admin' },
  { id: 'transfer_a', labelTr: 'Transfer & tur (yönetim)', section: 'admin' },
  { id: 'dining_a', labelTr: 'Yemek & mekanlar (yönetim)', section: 'admin' },
  { id: 'area_guide', labelTr: 'Bölge rehberi (admin)', section: 'admin' },
  { id: 'breakfast_admin', labelTr: 'Kahvaltı kayıtları', section: 'admin' },
  { id: 'salary_all', labelTr: 'Tüm ödemeler', section: 'admin' },
  { id: 'contracts_all', labelTr: 'Tüm sözleşmeler', section: 'admin' },
  { id: 'stock_all', labelTr: 'Tüm stoklar', section: 'admin' },
  { id: 'finance_checks', labelTr: 'Çek takibi', section: 'admin' },
  { id: 'debts_admin', labelTr: 'Borç / alacak (admin)', section: 'admin' },
  { id: 'blacklist', labelTr: 'Kara Liste', section: 'admin' },
  { id: 'managed_contracts_admin', labelTr: 'Sözleşme yönetimi (admin)', section: 'admin' },
  { id: 'announcement_compose', labelTr: 'Duyuru oluştur', section: 'admin' },
  { id: 'engagement_tracking', labelTr: 'Okuma takibi', section: 'nav' },
  { id: 'kbs', labelTr: 'KBS işlemleri', section: 'admin' },
  { id: 'tech', labelTr: 'Teknik envanter / QR', section: 'admin' },
];

const CATALOG_IDS = new Set(STAFF_MENU_CATALOG.map((e) => e.id));

export const STAFF_MENU_SECTION_LABELS_TR: Record<StaffMenuCatalogSection, string> = {
  fnb: 'F&B Merkezi',
  kitchen: 'Mutfak',
  nav: 'Gezinti',
  staff: 'Personel İşleri',
  hotel: 'Otel & Misafir',
  payments: 'Tahsilat & Ödeme',
  ops: 'Operasyon',
  admin: 'Yönetim',
};

export function normalizeHiddenMenuItemIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const id = v.trim();
    if (!id || !CATALOG_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function isStaffMenuItemHidden(hiddenIds: string[] | null | undefined, itemId: string): boolean {
  if (!hiddenIds?.length) return false;
  return hiddenIds.includes(itemId);
}
