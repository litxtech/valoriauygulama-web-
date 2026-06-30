export type ColumnField =
  | 'date'
  | 'description'
  | 'type'
  | 'debit'
  | 'credit'
  | 'amount'
  | 'balance'
  | 'reference'
  | 'counterparty'
  | 'iban'
  | 'currency';

export type TabularColumnMap = Partial<Record<ColumnField, number>>;

export const COLUMN_FIELD_LABELS: Record<ColumnField, string> = {
  date: 'Tarih',
  description: 'Açıklama',
  type: 'İşlem türü',
  debit: 'Borç (çıkış)',
  credit: 'Alacak (giriş)',
  amount: 'Tutar',
  balance: 'Bakiye',
  reference: 'Referans / işlem no',
  counterparty: 'Karşı hesap / alıcı',
  iban: 'IBAN',
  currency: 'Para birimi',
};

export const REQUIRED_FIELDS: ColumnField[] = ['date', 'description'];

export const COLUMN_HEADER_CANDIDATES: Record<ColumnField, string[]> = {
  date: [
    'tarih',
    'işlem tarihi',
    'islem tarihi',
    'dekont tarihi',
    'date',
    'transaction date',
    'posted date',
    'posting date',
    'value date',
    'booking date',
    'datetime',
    'tarih saat',
    'created',
    'time',
  ],
  description: [
    'açıklama',
    'aciklama',
    'işlem açıklaması',
    'islem aciklamasi',
    'hareket açıklaması',
    'hareket aciklamasi',
    'description',
    'details',
    'detail',
    'memo',
    'narrative',
    'payee description',
    'merchant name',
    'işlem detayı',
    'islem detayi',
  ],
  type: ['işlem türü', 'islem turu', 'type', 'transaction type', 'category', 'kategori', 'kanal'],
  debit: ['borç', 'borc', 'debit', 'giden', 'çıkış', 'cikis', 'withdrawal', 'money out', 'ödeme', 'odeme'],
  credit: ['alacak', 'credit', 'gelen', 'giriş', 'giris', 'deposit', 'money in', 'tahsilat'],
  amount: ['tutar', 'amount', 'işlem tutarı', 'islem tutari', 'net', 'value', 'işlem tutari'],
  balance: ['bakiye', 'balance', 'running balance', 'kalan'],
  reference: [
    'referans',
    'reference',
    'işlem no',
    'islem no',
    'ref no',
    'transaction id',
    'dekont no',
    'receipt',
    'fiş no',
    'fis no',
  ],
  counterparty: [
    'karşı hesap',
    'karsi hesap',
    'karşı taraf',
    'karsi taraf',
    'alıcı',
    'alici',
    'alıcı adı',
    'alici adi',
    'gönderen',
    'gonderen',
    'gönderen adı',
    'gonderen adi',
    'counterparty',
    'beneficiary',
    'recipient',
    'sender',
    'payee',
    'cari',
    'cari unvan',
    'cari hesap',
    'firma',
    'unvan',
    'tedarikçi',
    'tedarikci',
    'müşteri',
    'musteri',
    'müşteri adı',
    'musteri adi',
    'hesap adı',
    'hesap adi',
    'company',
    'vendor',
    'supplier',
    'ad soyad',
    'ad-soyad',
  ],
  iban: ['iban', 'karşı iban', 'karsi iban', 'alıcı iban', 'alici iban'],
  currency: ['para birimi', 'currency', 'ccy', 'döviz', 'doviz', 'döviz cinsi'],
};

export function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, '')
    .replace(/"/g, '')
    .replace(/\s+/g, ' ');
}

const HEADER_NEGATIVE_GLOBAL = [
  /^şube$/,
  /^sube$/,
  /^şube\s*kodu$/,
  /^sube\s*kodu$/,
  /^şube\s*adı$/,
  /^sube\s*adi$/,
  /^müşteri\s*no$/,
  /^musteri\s*no$/,
  /^hesap\s*no$/,
  /^hesap\s*numarası$/,
  /^hesap\s*numarasi$/,
  /^döviz$/,
  /^doviz$/,
  /^döviz\s*cinsi$/,
  /^kanal$/,
  /^valör$/,
  /^valor$/,
];

const FIELD_HEADER_NEGATIVE: Partial<Record<ColumnField, RegExp[]>> = {
  description: [
    /^şube/,
    /^sube/,
    /^hesap/,
    /^müşteri/,
    /^musteri/,
    /^döviz/,
    /^doviz/,
    /^bakiye$/,
    /^kanal$/,
    /^ref$/,
    /^referans\s*kodu$/,
    /^işlem\s*no$/,
    /^islem\s*no$/,
  ],
  counterparty: [/^şube/, /^sube/, /^hesap/, /^müşteri/, /^musteri/, /^kanal/, /^döviz/, /^doviz/],
  date: [/^açılış/, /^acilis/, /^kapanış/, /^kapanis/],
  reference: [/^şube/, /^sube/, /^hesap/],
  amount: [/^bakiye$/, /^kalan$/],
  debit: [/^bakiye$/],
  credit: [/^bakiye$/],
};

export function headerMatchesField(header: string, field: ColumnField): number {
  const h = normHeader(header);
  if (!h) return 0;

  for (const neg of HEADER_NEGATIVE_GLOBAL) {
    if (neg.test(h)) return -100;
  }
  for (const neg of FIELD_HEADER_NEGATIVE[field] ?? []) {
    if (neg.test(h)) return -100;
  }

  for (const c of COLUMN_HEADER_CANDIDATES[field]) {
    if (h === c) return 100;
    if (h.includes(c) || c.includes(h)) return 80;
  }
  return 0;
}

export function autoDetectColumnMap(headers: string[]): TabularColumnMap {
  const map: TabularColumnMap = {};
  const used = new Set<number>();

  const fields = Object.keys(COLUMN_HEADER_CANDIDATES) as ColumnField[];
  for (const field of fields) {
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue;
      const sc = headerMatchesField(headers[i], field);
      if (sc > bestScore) {
        bestScore = sc;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestScore >= 70) {
      map[field] = bestIdx;
      used.add(bestIdx);
    }
  }

  return map;
}

export function isColumnMapSufficient(map: TabularColumnMap): boolean {
  const hasDesc = map.description != null || map.counterparty != null;
  if (map.date == null || !hasDesc) return false;
  return map.amount != null || map.debit != null || map.credit != null;
}

export function missingColumnFields(map: TabularColumnMap): ColumnField[] {
  const missing: ColumnField[] = [];
  if (map.date == null) missing.push('date');
  if (map.description == null && map.counterparty == null) missing.push('description');
  if (map.amount == null && map.debit == null && map.credit == null) {
    missing.push('amount');
  }
  return missing;
}
