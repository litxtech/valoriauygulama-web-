/**
 * Hamburger menü öğe kimlikleri — admin panelinden personel bazlı gizlenebilir.
 * Yetki (app_permissions) verilmiş olsa bile menüde gösterilmez.
 */

export type StaffMenuCatalogSection = 'nav' | 'staff' | 'hotel' | 'ops' | 'admin';

export type StaffMenuCatalogEntry = {
  id: string;
  labelTr: string;
  section: StaffMenuCatalogSection;
};

export const STAFF_MENU_CATALOG: StaffMenuCatalogEntry[] = [
  // Gezinti
  { id: 'home', labelTr: 'Ana sayfa (feed)', section: 'nav' },
  { id: 'map', labelTr: 'Harita', section: 'nav' },
  { id: 'board', labelTr: 'Duyuru panosu', section: 'nav' },
  { id: 'emergency', labelTr: 'Acil durum', section: 'nav' },
  // Personel İşleri
  { id: 'tasks', labelTr: 'Görevler', section: 'staff' },
  { id: 'attendance', labelTr: 'Mesai / devam', section: 'staff' },
  { id: 'perf', labelTr: 'Performans paneli', section: 'staff' },
  { id: 'meal', labelTr: 'Personel yemek listesi', section: 'staff' },
  { id: 'meal_edit', labelTr: 'Yemek listesi düzenleme', section: 'staff' },
  { id: 'meal_hist', labelTr: 'Yemek listesi geçmişi', section: 'staff' },
  { id: 'breakfast_staff', labelTr: 'Kahvaltı teyidi yükle', section: 'staff' },
  { id: 'salary_history', labelTr: 'Maaş geçmişim', section: 'staff' },
  { id: 'cleaning', labelTr: 'Yarın temizlik planı', section: 'staff' },
  { id: 'official_warnings', labelTr: 'Resmi uyarılar', section: 'staff' },
  { id: 'expenses_all', labelTr: 'Tüm giderler (admin)', section: 'staff' },
  { id: 'expenses_mine', labelTr: 'Giderlerim', section: 'staff' },
  { id: 'complaint', labelTr: 'İç şikayet', section: 'staff' },
  { id: 'assign', labelTr: 'Yeni görev ata', section: 'staff' },
  { id: 'contracts_staff', labelTr: 'Sözleşmeler (personel)', section: 'staff' },
  { id: 'passports', labelTr: 'Pasaport / MRZ', section: 'staff' },
  // Otel & Misafir
  { id: 'hotel_kitchen_menu', labelTr: 'Otel mutfağı menüsü', section: 'hotel' },
  { id: 'hotel_kitchen_menu_manage', labelTr: 'Otel mutfağı — yönetim', section: 'hotel' },
  { id: 'guests', labelTr: 'Misafirler', section: 'hotel' },
  { id: 'transfer', labelTr: 'Transfer & tur', section: 'hotel' },
  { id: 'dining', labelTr: 'Yemek & mekanlar', section: 'hotel' },
  { id: 'area_guide_staff', labelTr: 'Bölge rehberi', section: 'hotel' },
  // Operasyon
  { id: 'missing', labelTr: 'Eksik eşya bildirimi', section: 'ops' },
  { id: 'facility_journal_new', labelTr: 'Tesis günlüğü — yeni kayıt', section: 'ops' },
  { id: 'facility_journal', labelTr: 'Tesis günlüğü listesi', section: 'ops' },
  { id: 'lost_found_new', labelTr: 'Emanet / buluntu — yeni', section: 'ops' },
  { id: 'lost_found', labelTr: 'Emanet / buluntu listesi', section: 'ops' },
  { id: 'stock', labelTr: 'Stok sekmesi', section: 'ops' },
  { id: 'my_stock', labelTr: 'Stok hareketlerim', section: 'ops' },
  { id: 'docs', labelTr: 'Doküman yönetimi', section: 'ops' },
  { id: 'incident', labelTr: 'Tutanak oluştur', section: 'ops' },
  { id: 'sales', labelTr: 'Satış / komisyon', section: 'ops' },
  { id: 'demirbas', labelTr: 'Demirbaşlar', section: 'ops' },
  { id: 'debts', labelTr: 'Borç / alacak', section: 'ops' },
  { id: 'accounting', labelTr: 'Muhasebe merkezi', section: 'ops' },
  // Yönetim
  { id: 'admin_tab', labelTr: 'Yönetim sekmesi', section: 'admin' },
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
  { id: 'kbs', labelTr: 'KBS işlemleri', section: 'admin' },
  { id: 'tech', labelTr: 'Teknik envanter / QR', section: 'admin' },
];

const CATALOG_IDS = new Set(STAFF_MENU_CATALOG.map((e) => e.id));

export const STAFF_MENU_SECTION_LABELS_TR: Record<StaffMenuCatalogSection, string> = {
  nav: 'Gezinti',
  staff: 'Personel İşleri',
  hotel: 'Otel & Misafir',
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
