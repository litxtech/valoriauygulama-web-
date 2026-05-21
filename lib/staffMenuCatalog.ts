/**
 * Hamburger menü öğe kimlikleri — admin panelinden personel bazlı gizlenebilir.
 * Yetki (app_permissions) verilmiş olsa bile menüde gösterilmez.
 */

export type StaffMenuCatalogSection = 'nav' | 'tools' | 'admin';

export type StaffMenuCatalogEntry = {
  id: string;
  labelTr: string;
  section: StaffMenuCatalogSection;
};

export const STAFF_MENU_CATALOG: StaffMenuCatalogEntry[] = [
  { id: 'home', labelTr: 'Ana sayfa (feed)', section: 'nav' },
  { id: 'map', labelTr: 'Harita', section: 'nav' },
  { id: 'tasks', labelTr: 'Görevler', section: 'nav' },
  { id: 'attendance', labelTr: 'Mesai / devam', section: 'nav' },
  { id: 'board', labelTr: 'Duyuru panosu', section: 'nav' },
  { id: 'guests', labelTr: 'Misafirler', section: 'nav' },
  { id: 'stock', labelTr: 'Stok sekmesi', section: 'nav' },
  { id: 'transfer', labelTr: 'Transfer & tur', section: 'nav' },
  { id: 'dining', labelTr: 'Yemek & mekanlar', section: 'nav' },
  { id: 'missing', labelTr: 'Eksik eşya bildirimi', section: 'tools' },
  { id: 'facility_journal_new', labelTr: 'Tesis günlüğü — yeni kayıt', section: 'tools' },
  { id: 'facility_journal', labelTr: 'Tesis günlüğü listesi', section: 'tools' },
  { id: 'lost_found_new', labelTr: 'Emanet / buluntu — yeni', section: 'tools' },
  { id: 'lost_found', labelTr: 'Emanet / buluntu listesi', section: 'tools' },
  { id: 'perf', labelTr: 'Performans paneli', section: 'tools' },
  { id: 'meal', labelTr: 'Personel yemek listesi', section: 'tools' },
  { id: 'hotel_kitchen_menu', labelTr: 'Otel mutfağı menüsü', section: 'tools' },
  { id: 'hotel_kitchen_menu_manage', labelTr: 'Otel mutfağı — yönetim', section: 'tools' },
  { id: 'meal_edit', labelTr: 'Yemek listesi düzenleme', section: 'tools' },
  { id: 'meal_hist', labelTr: 'Yemek listesi geçmişi', section: 'tools' },
  { id: 'salary_history', labelTr: 'Maaş geçmişim', section: 'tools' },
  { id: 'area_guide_staff', labelTr: 'Bölge rehberi', section: 'tools' },
  { id: 'official_warnings', labelTr: 'Resmi uyarılar', section: 'tools' },
  { id: 'assign', labelTr: 'Yeni görev ata', section: 'tools' },
  { id: 'accounting', labelTr: 'Muhasebe merkezi', section: 'tools' },
  { id: 'expenses_all', labelTr: 'Tüm giderler (admin)', section: 'tools' },
  { id: 'expenses_mine', labelTr: 'Giderlerim', section: 'tools' },
  { id: 'emergency', labelTr: 'Acil durum', section: 'tools' },
  { id: 'cleaning', labelTr: 'Yarın temizlik planı', section: 'tools' },
  { id: 'docs', labelTr: 'Doküman yönetimi', section: 'tools' },
  { id: 'incident', labelTr: 'Tutanak oluştur', section: 'tools' },
  { id: 'sales', labelTr: 'Satış / komisyon', section: 'tools' },
  { id: 'breakfast_staff', labelTr: 'Kahvaltı teyidi yükle', section: 'tools' },
  { id: 'passports', labelTr: 'Pasaport / MRZ', section: 'tools' },
  { id: 'complaint', labelTr: 'İç şikayet', section: 'tools' },
  { id: 'demirbas', labelTr: 'Demirbaşlar', section: 'tools' },
  { id: 'my_stock', labelTr: 'Stok hareketlerim', section: 'tools' },
  { id: 'debts', labelTr: 'Borç / alacak', section: 'tools' },
  { id: 'contracts_staff', labelTr: 'Sözleşmeler (personel)', section: 'tools' },
  { id: 'admin_tab', labelTr: 'Yönetim sekmesi', section: 'admin' },
  { id: 'audits', labelTr: 'Denetim panosu', section: 'admin' },
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
  tools: 'Modüller',
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
