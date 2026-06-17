/**
 * Personel app_permissions kataloğu — tek kaynak.
 * Admin personel düzenle / ekle / onay ekranları bu listeyi kullanır.
 */

export type StaffAppPermissionSection =
  | 'communication'
  | 'tasks_staff'
  | 'guests_rooms'
  | 'finance'
  | 'operations'
  | 'kitchen'
  | 'contracts_rules'
  | 'technical_security'
  | 'admin_panel';

export type StaffAppPermissionEntry = {
  key: string;
  label: string;
  description?: string;
  section: StaffAppPermissionSection;
  /** Yeni personelde varsayılan */
  defaultEnabled: boolean;
};

export const STAFF_APP_PERMISSION_SECTION_LABELS: Record<StaffAppPermissionSection, string> = {
  communication: 'İletişim & sosyal',
  tasks_staff: 'Görev & personel',
  guests_rooms: 'Misafir & konaklama',
  finance: 'Finans & muhasebe',
  operations: 'Operasyon & stok',
  kitchen: 'Mutfak',
  contracts_rules: 'Sözleşme & kurallar',
  technical_security: 'Teknik & güvenlik',
  admin_panel: 'Yönetim paneli modülleri',
};

export const STAFF_APP_PERMISSION_CATALOG: StaffAppPermissionEntry[] = [
  // —— İletişim ——
  { key: 'mesajlasma', label: 'Mesajlaşma', description: 'Misafir ve personel mesajları.', section: 'communication', defaultEnabled: true },
  { key: 'misafir_mesaj_alabilir', label: 'Misafirden direkt mesaj alabilir', section: 'communication', defaultEnabled: true },
  { key: 'ekip_sohbet', label: 'Ekip sohbeti', section: 'communication', defaultEnabled: true },
  { key: 'video_paylasim', label: 'Video / resim paylaşımı (feed)', section: 'communication', defaultEnabled: true },
  { key: 'gonderi_yonetimi', label: 'Gönderi yönetimi (admin feed)', section: 'communication', defaultEnabled: false },
  { key: 'toplu_duyuru', label: 'Toplu duyuru gönderebilir', section: 'communication', defaultEnabled: false },
  { key: 'bahsis_alabilir', label: 'Misafir bahşişi alabilir', description: 'Kapalıysa misafir profilinde bahşiş butonu görünmez.', section: 'communication', defaultEnabled: true },

  // —— Görev & personel ——
  { key: 'gorev_ata', label: 'Görev atayabilir', description: 'Yönetim paneli görev modülü.', section: 'tasks_staff', defaultEnabled: false },
  { key: 'gorevler_goruntule', label: 'Görevleri görüntüleyebilir', section: 'tasks_staff', defaultEnabled: true },
  { key: 'mesai_takibi', label: 'Mesai / devam takibi', section: 'tasks_staff', defaultEnabled: true },
  { key: 'performans_paneli', label: 'Performans paneli', section: 'tasks_staff', defaultEnabled: true },
  { key: 'ic_sikayet', label: 'İç şikayet oluşturabilir', section: 'tasks_staff', defaultEnabled: true },
  { key: 'personel_ekle', label: 'Personel ekleyebilir', section: 'tasks_staff', defaultEnabled: false },
  { key: 'personel_listesi', label: 'Personel listesini yönetebilir', section: 'tasks_staff', defaultEnabled: false },
  { key: 'puan_yonetimi', label: 'Puan yönetimi', section: 'tasks_staff', defaultEnabled: false },
  { key: 'not_al', label: 'Not Al', description: 'Anlık not oluşturur. Yönetici notlarını göremez; yönetici personel notlarını görür.', section: 'tasks_staff', defaultEnabled: false },

  // —— Misafir & konaklama ——
  { key: 'doluluk_operasyon', label: 'Doluluk / oda operasyonları', description: 'Giriş-çıkış, oda atama, konaklama merkezi.', section: 'guests_rooms', defaultEnabled: false },
  { key: 'misafir_yonetimi', label: 'Misafir listesi & detay', section: 'guests_rooms', defaultEnabled: false },
  { key: 'misafir_sikayetleri', label: 'Misafir şikayet / öneri', section: 'guests_rooms', defaultEnabled: false },
  { key: 'misafir_talepleri', label: 'Misafir talepleri (oda / kayıp)', section: 'guests_rooms', defaultEnabled: false },
  { key: 'guest_welcome_card', label: 'Misafir karşılama kartı', section: 'guests_rooms', defaultEnabled: false },
  { key: 'housekeeping_yonetim', label: 'Housekeeping yönetimi', section: 'guests_rooms', defaultEnabled: false },
  { key: 'yarin_oda_temizlik_listesi', label: 'Yarın temizlenecek odalar', section: 'guests_rooms', defaultEnabled: false },
  { key: 'oda_servisi_yonetim', label: 'Oda servisi yönetimi', section: 'guests_rooms', defaultEnabled: false },
  { key: 'ekstra_ucret_yonetim', label: 'Ekstra ücretler (battaniye, su…)', section: 'guests_rooms', defaultEnabled: false },
  { key: 'hotel_pulse', label: 'Misafir otel nabzı', section: 'guests_rooms', defaultEnabled: false },
  { key: 'bolge_rehberi', label: 'Bölge rehberi (gezilecek yerler)', section: 'guests_rooms', defaultEnabled: false },

  // —— Finans ——
  { key: 'harcama_girisi', label: 'Harcama girişi yapabilir', section: 'finance', defaultEnabled: true },
  { key: 'harcama_yonetimi', label: 'Personel harcamaları yönetimi', section: 'finance', defaultEnabled: false },
  { key: 'onay_merkezi', label: 'Onay merkezi', section: 'finance', defaultEnabled: false },
  { key: 'muhasebe_merkezi', label: 'Muhasebe merkezi', section: 'finance', defaultEnabled: false },
  { key: 'borc_alacak', label: 'Borç / alacak (personel)', section: 'finance', defaultEnabled: false },
  { key: 'borc_alacak_yonetim', label: 'Borç / alacak yönetimi (admin)', section: 'finance', defaultEnabled: false },
  { key: 'cek_takibi', label: 'Çek takibi', section: 'finance', defaultEnabled: false },
  { key: 'maas_yonetimi', label: 'Maaş yönetimi', section: 'finance', defaultEnabled: false },
  { key: 'odeme_al_qr', label: 'Ödeme al (QR)', section: 'finance', defaultEnabled: false },
  { key: 'stripe_odemeler', label: 'Stripe ödemeler listesi', section: 'finance', defaultEnabled: false },
  { key: 'bahsis_yonetimi', label: 'Bahşişler yönetimi', section: 'finance', defaultEnabled: false },
  { key: 'satis_komisyon', label: 'Satış / komisyon', section: 'finance', defaultEnabled: false },
  { key: 'karbon_yonetimi', label: 'Karbon girdileri', section: 'finance', defaultEnabled: false },
  { key: 'raporlar', label: 'Raporlar & HMB', section: 'finance', defaultEnabled: false },

  // —— Operasyon ——
  { key: 'stok_giris', label: 'Stok girişi / hareket', section: 'operations', defaultEnabled: true },
  { key: 'stok_yonetimi', label: 'Stok yönetimi (admin)', section: 'operations', defaultEnabled: false },
  { key: 'eksik_esya', label: 'Eksik eşya bildirimi', section: 'operations', defaultEnabled: true },
  { key: 'emanet_buluntu', label: 'Kayıp eşya (buluntu)', section: 'operations', defaultEnabled: false },
  { key: 'tesis_gunlugu', label: 'Otel eşyaları kullanımı', section: 'operations', defaultEnabled: false },
  { key: 'tutanaklar', label: 'Tutanak oluşturma / yönetim', section: 'operations', defaultEnabled: false },
  { key: 'dokuman_yukle', label: 'Doküman yükleme / yönetim', section: 'operations', defaultEnabled: false },
  { key: 'demirbaslar', label: 'Demirbaşlar', section: 'operations', defaultEnabled: false },
  { key: 'denetim_panosu', label: 'Denetim panosu', section: 'operations', defaultEnabled: false },
  { key: 'operasyon_merkezi', label: 'Operasyon merkezi (smart-ops)', section: 'operations', defaultEnabled: false },
  { key: 'personel_sikayet_notlari', label: 'Personel şikayet notları', section: 'operations', defaultEnabled: false },

  // —— Mutfak ——
  { key: 'mutfak_operasyon', label: 'Mutfak operasyon modülü', section: 'kitchen', defaultEnabled: false },
  { key: 'mutfak_operasyon_yonetim', label: 'Mutfak operasyon yönetimi (admin)', section: 'kitchen', defaultEnabled: false },
  { key: 'reception_mutfak_muhasebe', label: 'Reception mutfak muhasebe', section: 'kitchen', defaultEnabled: false },
  { key: 'yemek_listesi_olustur', label: 'Aylık yemek listesi düzenleme', section: 'kitchen', defaultEnabled: false },
  { key: 'otel_mutfak_menu', label: 'Otel mutfağı menüsü yönetimi', section: 'kitchen', defaultEnabled: false },
  { key: 'kahvalti_teyit_olustur', label: 'Kahvaltı teyidi oluşturma', section: 'kitchen', defaultEnabled: false },
  { key: 'kahvalti_teyit_departman', label: 'Kahvaltı teyitleri (mutfak) görüntüleme', section: 'kitchen', defaultEnabled: false },
  { key: 'kahvalti_teyit_onayla', label: 'Kahvaltı teyit onaylama', section: 'kitchen', defaultEnabled: false },
  { key: 'kahvalti_teyit_paylas', label: 'Kahvaltı teyit paylaşımı', section: 'kitchen', defaultEnabled: false },
  { key: 'kahvalti_rapor', label: 'Kahvaltı teyit kayıt geçmişi (tüm kayıtlar, salt okunur)', section: 'kitchen', defaultEnabled: false },

  // —— Sözleşme & kurallar ——
  { key: 'tum_sozlesmeler', label: 'Tüm misafir sözleşmeleri', section: 'contracts_rules', defaultEnabled: false },
  { key: 'sozlesme_yonetimi', label: 'Sözleşme yönetimi (iş ortakları)', section: 'contracts_rules', defaultEnabled: false },
  { key: 'sozlesme_goruntuleme', label: 'Atanan sözleşmeleri görüntüleme', section: 'contracts_rules', defaultEnabled: false },
  { key: 'bolum_kurallari_yonetim', label: 'Bölüm kuralları yönetimi', section: 'contracts_rules', defaultEnabled: false },
  { key: 'bolum_kurallari', label: 'Bölüm kurallarını görüntüleme', section: 'contracts_rules', defaultEnabled: false },
  { key: 'bolum_kurallari_duzenle', label: 'Kendi departmanı kurallarını düzenleme', section: 'contracts_rules', defaultEnabled: false },
  { key: 'transfer_tour_services', label: 'Transfer & tur: hizmet yönetimi', section: 'contracts_rules', defaultEnabled: false },
  { key: 'transfer_tour_requests', label: 'Transfer & tur: talep yönetimi', section: 'contracts_rules', defaultEnabled: false },
  { key: 'dining_venues', label: 'Yemek & mekanlar yönetimi', section: 'contracts_rules', defaultEnabled: false },

  // —— Teknik & güvenlik ——
  { key: 'kbs_mrz_scan', label: 'Pasaport / MRZ tarama (KBS)', section: 'technical_security', defaultEnabled: false },
  { key: 'id_capture', label: 'Kimlik / pasaport çekim', section: 'technical_security', defaultEnabled: false },
  { key: 'teknik_varlik_yonetimi', label: 'Akıllı tesis envanteri yönetimi', section: 'technical_security', defaultEnabled: false },
  { key: 'teknik_varliklar', label: 'Teknik QR (müdahale)', section: 'technical_security', defaultEnabled: false },
  { key: 'teknik_varliklar_okuma', label: 'Teknik QR (salt okunur)', section: 'technical_security', defaultEnabled: false },
  { key: 'gecis_kontrolu', label: 'Geçiş kontrolü', section: 'technical_security', defaultEnabled: false },
  { key: 'kamera_yonetimi', label: 'Kamera yönetimi', section: 'technical_security', defaultEnabled: false },
  { key: 'maliye_merkezi', label: 'Maliye evrak merkezi', section: 'technical_security', defaultEnabled: false },

  // —— Yönetim paneli ——
  { key: 'isletme_yonetimi', label: 'İşletme yönetimi (çoklu otel)', description: 'Tüm işletmeleri görme ve seçme.', section: 'admin_panel', defaultEnabled: false },
  { key: 'super_admin', label: 'Süper yönetici (çoklu işletme)', description: 'Tüm otelleri görür; işletme seçici açılır.', section: 'admin_panel', defaultEnabled: false },
];

export const STAFF_APP_PERMISSION_KEYS = STAFF_APP_PERMISSION_CATALOG.map((e) => e.key);

export const STAFF_APP_PERMISSION_BY_KEY = new Map(STAFF_APP_PERMISSION_CATALOG.map((e) => [e.key, e]));

/** Yeni personel / varsayılan izin kaydı */
export function defaultStaffAppPermissions(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const e of STAFF_APP_PERMISSION_CATALOG) {
    out[e.key] = e.defaultEnabled;
  }
  return out;
}

/** Kayıtlı izinleri katalog varsayılanlarıyla birleştir */
export function mergeStaffAppPermissions(raw: Record<string, boolean> | null | undefined): Record<string, boolean> {
  return { ...defaultStaffAppPermissions(), ...(raw ?? {}) };
}

/** Etiket haritası (bildirim metinleri) */
export function staffAppPermissionLabels(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of STAFF_APP_PERMISSION_CATALOG) {
    out[e.key] = e.label;
  }
  return out;
}

/** Katalog bölümlerine göre grupla (UI için) */
export function staffAppPermissionsBySection(): { section: StaffAppPermissionSection; title: string; items: StaffAppPermissionEntry[] }[] {
  const order: StaffAppPermissionSection[] = [
    'communication',
    'tasks_staff',
    'guests_rooms',
    'finance',
    'operations',
    'kitchen',
    'contracts_rules',
    'technical_security',
    'admin_panel',
  ];
  return order.map((section) => ({
    section,
    title: STAFF_APP_PERMISSION_SECTION_LABELS[section],
    items: STAFF_APP_PERMISSION_CATALOG.filter((e) => e.section === section),
  }));
}
