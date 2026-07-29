import type {
  PosInvoiceLineItem,
  PosReceiptInvoiceTotals,
  PosReceiptMatchHint,
} from '@/lib/posReceiptInvoice/types';
import { DEFAULT_POS_VAT_RATE } from '@/lib/posReceiptInvoice/types';
import { roundKurus } from '@/lib/posReceiptInvoice/extractPosFields';

function round2(n: number): number {
  return roundKurus(n);
}

export function blankPosLine(vatRate = DEFAULT_POS_VAT_RATE): PosInvoiceLineItem {
  return {
    id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    code: '',
    name: '',
    quantity: 1,
    unit: 'Adet',
    unitPrice: 0,
    amount: 0,
    discountRate: null,
    discountAmount: 0,
    vatRate,
    vatAmount: 0,
    total: 0,
  };
}

/**
 * e-Fatura satırı: birim fiyat KDV hariç.
 * total her zaman amount + vatAmount (kuruş tutarlı).
 */
export function recalcPosLine(line: PosInvoiceLineItem): PosInvoiceLineItem {
  const qty = line.quantity != null && Number.isFinite(line.quantity) && line.quantity > 0 ? line.quantity : 1;
  const vatRate = Number.isFinite(line.vatRate) ? line.vatRate : DEFAULT_POS_VAT_RATE;

  let amount = 0;
  if (line.unitPrice != null && Number.isFinite(line.unitPrice) && line.unitPrice > 0) {
    amount = round2(qty * line.unitPrice);
  } else if (line.amount > 0) {
    amount = round2(line.amount);
  } else if (line.total > 0) {
    amount = matrahFromInclusive(line.total, vatRate);
  }

  let discountAmount = round2(line.discountAmount || 0);
  if (line.discountRate != null && line.discountRate > 0) {
    discountAmount = round2(amount * (line.discountRate / 100));
  }
  discountAmount = Math.min(discountAmount, amount);
  const afterDiscount = round2(amount - discountAmount);
  const vatAmount = round2(afterDiscount * (vatRate / 100));
  const total = round2(afterDiscount + vatAmount);
  const unitPrice =
    line.unitPrice != null && line.unitPrice > 0 ? round2(line.unitPrice) : round2(afterDiscount / qty);

  return {
    ...line,
    quantity: qty,
    unitPrice,
    amount: afterDiscount,
    discountAmount,
    vatRate,
    vatAmount,
    total,
  };
}

/**
 * KDV dahil fiş → matrah (kuruş).
 * matrah + kdv === inclusive garanti (kalan kuruş KDV'de).
 */
export function matrahFromInclusive(inclusive: number, vatRate = DEFAULT_POS_VAT_RATE): number {
  if (!(inclusive > 0)) return 0;
  const inc = round2(inclusive);
  const matrah = round2(inc / (1 + vatRate / 100));
  return matrah;
}

export function vatFromInclusive(inclusive: number, vatRate = DEFAULT_POS_VAT_RATE): number {
  if (!(inclusive > 0)) return 0;
  const inc = round2(inclusive);
  const matrah = matrahFromInclusive(inc, vatRate);
  return round2(inc - matrah);
}

export function computePosInvoiceTotals(
  lines: PosInvoiceLineItem[],
  opts?: { vatRate?: number; receiptTotal?: number | null }
): PosReceiptInvoiceTotals {
  const vatRate = opts?.vatRate ?? DEFAULT_POS_VAT_RATE;
  const valid = lines.filter((l) => l.name.trim() && (l.total > 0 || l.amount > 0));
  const subtotal = round2(valid.reduce((s, l) => s + (l.amount || 0), 0));
  const discountTotal = round2(valid.reduce((s, l) => s + (l.discountAmount || 0), 0));
  const discountedSubtotal = round2(subtotal);
  const taxTotal = round2(valid.reduce((s, l) => s + (l.vatAmount || 0), 0));
  const lineGrand = round2(valid.reduce((s, l) => s + (l.total || 0), 0));

  const receiptBase =
    opts?.receiptTotal != null && Number.isFinite(opts.receiptTotal) && opts.receiptTotal > 0
      ? round2(opts.receiptTotal)
      : lineGrand;

  const matrah = matrahFromInclusive(receiptBase, vatRate);
  const vatOnReceipt = vatFromInclusive(receiptBase, vatRate);
  // Garanti: matrah + kdv = fiş (kuruş)
  const check = round2(matrah + vatOnReceipt);
  const adjustVat = check !== receiptBase ? round2(receiptBase - matrah) : vatOnReceipt;

  return {
    subtotal: subtotal > 0 ? subtotal : matrah,
    discountTotal,
    discountedSubtotal: discountedSubtotal > 0 ? discountedSubtotal : matrah,
    taxTotal: taxTotal > 0 ? taxTotal : adjustVat,
    grandTotal: lineGrand > 0 ? lineGrand : receiptBase,
    payableAmount: receiptBase,
    invoiceCutAmount: matrah,
    cutPercent: vatRate,
    cutAmount: adjustVat,
  };
}

export function buildReceiptMatchHint(
  receiptTotalRaw: number | null | undefined,
  totals: PosReceiptInvoiceTotals
): PosReceiptMatchHint | null {
  const receiptTotal =
    receiptTotalRaw != null && Number.isFinite(receiptTotalRaw) ? round2(receiptTotalRaw) : 0;
  if (receiptTotal <= 0) return null;

  const vatRate = totals.cutPercent || DEFAULT_POS_VAT_RATE;
  const matrah = totals.invoiceCutAmount;
  const vatAmount = totals.cutAmount;
  const ifEnterFull = round2(receiptTotal * (1 + vatRate / 100));

  return {
    receiptTotal,
    currentInvoiceCut: matrah,
    addToMatchReceipt: 0,
    overAmount: 0,
    matched: round2(matrah + vatAmount) === receiptTotal,
    payableNeededForExactCut: matrah,
    addPayableToReachExactCut: 0,
    cutPercent: vatRate,
    vatAmount,
    wrongTotalIfEnterReceipt: ifEnterFull,
  };
}

export function formatTry(n: number): string {
  return round2(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function posLineFromInclusiveTotal(input: {
  id?: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  totalInclusive: number;
  vatRate?: number;
}): PosInvoiceLineItem {
  const vatRate = input.vatRate ?? DEFAULT_POS_VAT_RATE;
  const qty = input.quantity != null && input.quantity > 0 ? input.quantity : 1;
  const inclusive = round2(input.totalInclusive);
  const matrah = matrahFromInclusive(inclusive, vatRate);
  const vatAmount = vatFromInclusive(inclusive, vatRate);
  const unitPriceExclusive = round2(matrah / qty);
  return {
    ...blankPosLine(vatRate),
    id: input.id ?? blankPosLine().id,
    name: input.name,
    quantity: qty,
    unit: input.unit ?? 'Adet',
    unitPrice: unitPriceExclusive,
    amount: matrah,
    vatRate,
    vatAmount,
    total: inclusive,
    discountRate: null,
    discountAmount: 0,
  };
}
