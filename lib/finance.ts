/**
 * Çek defteri + borç/alacak — tipler ve bildirim yardımcıları.
 */
import { sendNotification } from '@/lib/notificationService';

export type FinanceCheckDirection = 'given' | 'received';
export type FinanceCheckStatus = 'draft' | 'registered' | 'presented' | 'paid' | 'bounced' | 'cancelled';

export type DebtCategory = 'personal' | 'hotel_expense' | 'company_flow';
export type DebtStatus = 'open' | 'partial' | 'closed';
export type DebtPaymentMethod = 'cash' | 'transfer' | 'card' | 'check' | 'other';

export const DEBT_CATEGORY_LABELS: Record<DebtCategory, string> = {
  personal: 'Personel arası',
  hotel_expense: 'Otel adına harcama / mahsup',
  company_flow: 'Şirket–personel para akışı',
};

export const CHECK_DIRECTION_LABELS: Record<FinanceCheckDirection, string> = {
  given: 'Verilen çek',
  received: 'Alınan çek',
};

export const CHECK_STATUS_LABELS: Record<FinanceCheckStatus, string> = {
  draft: 'Taslak',
  registered: 'Kayıtlı',
  presented: 'İbraz',
  paid: 'Ödendi / Tahsil',
  bounced: 'Karşılıksız',
  cancelled: 'İptal',
};

export const DEBT_STATUS_LABELS: Record<DebtStatus, string> = {
  open: 'Açık',
  partial: 'Kısmi',
  closed: 'Kapandı',
};

export const PAYMENT_METHOD_LABELS: Record<DebtPaymentMethod, string> = {
  cash: 'Nakit',
  transfer: 'Havale / EFT',
  card: 'Kart',
  check: 'Çek',
  other: 'Diğer',
};

export function fmtMoneyTry(amount: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + ' ₺';
}

export type DebtEntryNotifyShape = {
  id: string;
  borrower_staff_id: string | null;
  lender_staff_id: string | null;
  borrower_is_organization: boolean;
  lender_is_organization: boolean;
  amount_principal: number;
  currency: string;
  description: string;
};

/** Kayıt oluşturan dışındaki personel tarafa bildirim */
export async function notifyDebtEntryCreated(entry: DebtEntryNotifyShape, creatorStaffId: string): Promise<void> {
  const title = 'Borç / alacak kaydı';
  const amt = fmtMoneyTry(entry.amount_principal);
  const body = entry.description?.trim()
    ? `${amt} — ${entry.description.trim().slice(0, 120)}`
    : amt;

  const targets = new Set<string>();
  if (entry.borrower_staff_id && entry.borrower_staff_id !== creatorStaffId) targets.add(entry.borrower_staff_id);
  if (entry.lender_staff_id && entry.lender_staff_id !== creatorStaffId) targets.add(entry.lender_staff_id);

  for (const staffId of targets) {
    await sendNotification({
      staffId,
      title,
      body,
      notificationType: 'staff_debt',
      category: 'staff',
      data: { kind: 'debt_created', debt_id: entry.id },
      createdByStaffId: creatorStaffId,
    });
  }
}

/** Ödemeyi kaydeden dışındaki personel taraflara bildirim */
export async function notifyDebtPaymentParties(params: {
  debtId: string;
  amount: number;
  payerStaffId: string;
  borrowerStaffId: string | null;
  lenderStaffId: string | null;
  note?: string | null;
}): Promise<void> {
  const title = 'Borç ödemesi kaydedildi';
  const body =
    fmtMoneyTry(params.amount) +
    (params.note?.trim() ? ` — ${params.note.trim().slice(0, 80)}` : '');
  const ids = new Set<string>();
  if (params.borrowerStaffId) ids.add(params.borrowerStaffId);
  if (params.lenderStaffId) ids.add(params.lenderStaffId);
  ids.delete(params.payerStaffId);
  for (const staffId of ids) {
    await sendNotification({
      staffId,
      title,
      body,
      notificationType: 'staff_debt',
      category: 'staff',
      data: { kind: 'debt_payment', debt_id: params.debtId },
      createdByStaffId: params.payerStaffId,
    });
  }
}
