/**
 * Genel muhasebe defteri: gelir/gider, cari, kategori.
 */
import { fmtMoneyTry, PAYMENT_METHOD_LABELS, type DebtPaymentMethod } from '@/lib/finance';

export type FinanceMovementKind = 'income' | 'expense';
export type FinanceLedgerScope = 'hotel' | 'personal';
export type FinanceCounterpartyType =
  | 'customer'
  | 'supplier'
  | 'subcontractor'
  | 'staff'
  | 'private_person'
  | 'other'
  | 'landlord'
  | 'utility'
  | 'agency'
  | 'consultant'
  | 'government'
  | 'bank'
  | 'insurance'
  | 'lawyer'
  | 'accountant'
  | 'freelancer';

export const LEDGER_SCOPE_LABELS: Record<FinanceLedgerScope, string> = {
  hotel: 'Otel / işletme',
  personal: 'Şahsi',
};

export const MOVEMENT_KIND_LABELS: Record<FinanceMovementKind, string> = {
  income: 'Gelir',
  expense: 'Gider',
};

export const COUNTERPARTY_TYPE_LABELS: Record<FinanceCounterpartyType, string> = {
  customer: 'Müşteri',
  supplier: 'Tedarikçi',
  subcontractor: 'Taşeron / usta',
  staff: 'Personel',
  private_person: 'Şahsi kişi',
  other: 'Diğer',
  landlord: 'Mal sahibi / kira',
  utility: 'Fatura kurumu',
  agency: 'Acente',
  consultant: 'Danışman',
  government: 'Resmi kurum',
  bank: 'Banka',
  insurance: 'Sigorta',
  lawyer: 'Avukat / hukuk',
  accountant: 'Muhasebeci',
  freelancer: 'Serbest çalışan',
};

export const MOVEMENT_CATEGORY_LABELS: Record<string, string> = {
  sales: 'Satış / Tahsilat',
  advance: 'Avans',
  bahsis: 'Bahşiş (Stripe)',
  mutfak_yemek: 'Mutfak yemek',
  mutfak_restoran: 'Restoran',
  oda_servisi: 'Oda servisi',
  otel_hizmet: 'Otel hizmeti',
  transfer_tur: 'Transfer / tur',
  otel_genel: 'Otel genel',
  stripe_odeme: 'Stripe POS',
  diger: 'Diğer',
  salary: 'Maaş / İşçilik',
  material: 'Malzeme',
  rent: 'Kira',
  fuel: 'Yakıt',
  utility: 'Fatura (elektrik, su…)',
  food: 'Yemek / İkram',
  transport: 'Ulaşım',
  office: 'Ofis gideri',
  tax: 'Vergi / Resmi',
  other: 'Diğer',
};

export const MOVEMENT_CATEGORIES_EXPENSE = [
  'material',
  'rent',
  'fuel',
  'utility',
  'food',
  'transport',
  'office',
  'salary',
  'tax',
  'other',
] as const;

export const MOVEMENT_CATEGORIES_INCOME = ['sales', 'advance', 'other'] as const;

export { fmtMoneyTry, PAYMENT_METHOD_LABELS };
export type MovementPaymentMethod = DebtPaymentMethod;

export function movementSummaryLine(params: {
  kind: FinanceMovementKind;
  amount: number;
  counterpartyLabel: string;
  category: string;
}): string {
  const cat = MOVEMENT_CATEGORY_LABELS[params.category] ?? params.category;
  const who = params.counterpartyLabel?.trim() || '—';
  if (params.kind === 'income') {
    return `${fmtMoneyTry(params.amount)} gelir · ${who} · ${cat}`;
  }
  return `${fmtMoneyTry(params.amount)} gider · ${who} · ${cat}`;
}

/** Borç kaydı: otel/şirket perspektifinden tek satır özet */
export function debtOrgPerspectiveLine(params: {
  borrowerIsOrg: boolean;
  lenderIsOrg: boolean;
  borrowerName: string;
  lenderName: string;
  amountRemaining: number;
}): { line: string; tone: 'receivable' | 'payable' | 'internal' } {
  const amt = fmtMoneyTry(params.amountRemaining);
  if (params.lenderIsOrg && !params.borrowerIsOrg) {
    return {
      line: `Tahsil edilecek — ${params.borrowerName} · ${amt}`,
      tone: 'receivable',
    };
  }
  if (params.borrowerIsOrg && !params.lenderIsOrg) {
    return {
      line: `Ödenecek — ${params.lenderName} · ${amt}`,
      tone: 'payable',
    };
  }
  return {
    line: `${params.borrowerName} → ${params.lenderName} · ${amt}`,
    tone: 'internal',
  };
}

export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabelTr(ym: string): string {
  const months = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
  ];
  const [y, m] = ym.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || m < 1 || m > 12) return ym;
  return `${months[m - 1]} ${y}`;
}
