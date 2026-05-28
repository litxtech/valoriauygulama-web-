export const KITCHEN_UNITS = ['adet', 'kg', 'gr', 'lt', 'ml', 'paket', 'koli', 'kutu', 'demet'] as const;

/** Stok bu miktarın altına (veya eşidine) düşünce kritik / tedarik uyarısı. */
export const KITCHEN_LOW_STOCK_THRESHOLD = 3;

export const KITCHEN_USAGE_REASONS = [
  { value: 'kahvalti', label: 'Kahvaltı' },
  { value: 'personel_yemegi', label: 'Personel yemeği' },
  { value: 'misafir_servisi', label: 'Misafir servisi' },
  { value: 'aksam_yemegi', label: 'Akşam yemeği' },
  { value: 'fire', label: 'Fire' },
  { value: 'bozuldu', label: 'Bozuldu / Zayi' },
  { value: 'iade', label: 'İade' },
  { value: 'otel_kullanimi', label: 'Otel kullanımı' },
  { value: 'diger', label: 'Diğer' },
] as const;

export const KITCHEN_PAYMENT_TYPES = [
  { value: 'nakit', label: 'Nakit' },
  { value: 'otel_pos', label: 'Otel POS' },
  { value: 'havale', label: 'Havale' },
  { value: 'veresiye', label: 'Veresiye' },
  { value: 'otel_hesabi', label: 'Otel hesabına yazıldı' },
] as const;

export const KITCHEN_EXPENSE_CATEGORIES = [
  'Sebze / Meyve',
  'Et / Tavuk',
  'Temizlik',
  'Gaz / Tüp',
  'Market',
  'Ulaşım',
  'Personel gideri',
  'Teknik gider',
  'Diğer',
] as const;

export const KITCHEN_PERSONNEL_PAYMENT_TYPES = [
  { value: 'gunluk', label: 'Günlük yevmiye' },
  { value: 'haftalik', label: 'Haftalık ödeme' },
  { value: 'maas', label: 'Maaş' },
  { value: 'avans', label: 'Avans' },
  { value: 'prim', label: 'Prim' },
  { value: 'ek', label: 'Ek ödeme' },
] as const;

export const KITCHEN_CARI_DIRECTIONS = [
  { value: 'kitchen_owes_hotel', label: 'Mutfak otele borçlanır' },
  { value: 'hotel_owes_kitchen', label: 'Otel mutfağa borçlanır' },
] as const;

export const KITCHEN_POS_STATUSES = [
  { value: 'pending', label: 'Bekliyor' },
  { value: 'approved', label: 'Onaylandı' },
  { value: 'transferred', label: 'Bankaya geçti' },
  { value: 'commission_deducted', label: 'Komisyon kesildi' },
  { value: 'completed', label: 'Tamamlandı' },
] as const;

export const KITCHEN_QUICK_EXIT_PRESETS: Record<string, number[]> = {
  kg: [1, 2, 5],
  gr: [100, 250, 500],
  paket: [1, 2, 5],
  adet: [1, 2, 5],
  lt: [1, 2, 5],
  koli: [1, 2],
  default: [1, 2, 5],
};

export const KITCHEN_PROOFS_BUCKET = 'kitchen-ops-proofs';
