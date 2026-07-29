/** POS fişi / e-fatura kalem satırı */
export type PosInvoiceLineItem = {
  id: string;
  code: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  /** Miktar × birim fiyat (iskonto öncesi) */
  amount: number;
  discountRate: number | null;
  discountAmount: number;
  vatRate: number;
  vatAmount: number;
  /** İskontolu + KDV dahil satır toplamı */
  total: number;
};

export type PosExtraField = {
  id: string;
  key: string;
  value: string;
};

export type PosRelatedRef = {
  id: string;
  label: string;
};

export type PosReceiptInvoiceStatus = 'draft' | 'ready' | 'invoiced' | 'cancelled';

/** Otel ve restoran/mutfak fişleri ayrı tutulur */
export type PosVenueScope = 'hotel' | 'restaurant';

export const POS_VENUE_LABELS: Record<PosVenueScope, string> = {
  hotel: 'Otel',
  restaurant: 'Mutfak',
};

export type PosReceiptInvoiceTotals = {
  subtotal: number;
  discountTotal: number;
  discountedSubtotal: number;
  taxTotal: number;
  grandTotal: number;
  /** Fiş tutarı (KDV dahil) */
  payableAmount: number;
  /** e-Fatura / arşive yazılacak matrah (KDV hariç) */
  invoiceCutAmount: number;
  /** KDV oranı % */
  cutPercent: number;
  /** Fiş tutarındaki KDV payı */
  cutAmount: number;
};

/** Fiş tutarını e-faturada tutturmak için rehber */
export type PosReceiptMatchHint = {
  receiptTotal: number;
  /** Faturaya yazılacak matrah (KDV hariç) */
  currentInvoiceCut: number;
  addToMatchReceipt: number;
  overAmount: number;
  matched: boolean;
  payableNeededForExactCut: number;
  addPayableToReachExactCut: number;
  cutPercent: number;
  /** KDV tutarı */
  vatAmount: number;
  /** Fiş tutarını matrah gibi yazarsan çıkacak yanlış toplam */
  wrongTotalIfEnterReceipt: number;
};

export type ParsedPosReceipt = {
  rawText: string;
  ocrEngine: string | null;
  receiptNo: string | null;
  merchantName: string | null;
  merchantTaxId: string | null;
  buyerName: string | null;
  receiptDate: string | null;
  receiptTime: string | null;
  receiptAt: string | null;
  invoiceDueOn: string | null;
  paidBy: string | null;
  paymentBank: string | null;
  paymentMethod: string | null;
  paymentReceivedOn: string | null;
  cardLast4: string | null;
  /** Fişteki gerçek toplam (OCR) */
  receiptTotal: number | null;
  lineItems: PosInvoiceLineItem[];
  vatRate: number;
  totals: PosReceiptInvoiceTotals;
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
  sourceKind: 'image' | 'pdf' | 'xml' | 'text' | 'mixed';
};

export type PosReceiptInvoiceRow = {
  id: string;
  organization_id: string;
  counterparty_id: string | null;
  agreement_id: string | null;
  status: PosReceiptInvoiceStatus;
  venue_scope: PosVenueScope;
  receipt_urls: string[];
  receipt_no: string | null;
  merchant_name: string | null;
  merchant_tax_id: string | null;
  buyer_name: string | null;
  receipt_at: string | null;
  receipt_date: string | null;
  receipt_time: string | null;
  invoice_due_on: string | null;
  paid_by: string | null;
  payment_bank: string | null;
  payment_method: string | null;
  payment_received_on: string | null;
  card_last4: string | null;
  /** POS fişindeki gerçek tutar */
  receipt_total: number | null;
  line_items: PosInvoiceLineItem[];
  related_order_ids: PosRelatedRef[];
  related_waybill_ids: PosRelatedRef[];
  extra_fields: PosExtraField[];
  vat_rate: number;
  subtotal: number;
  discount_total: number;
  discounted_subtotal: number;
  tax_total: number;
  grand_total: number;
  payable_amount: number;
  invoice_cut_amount: number;
  kdv_exemption_reason: string | null;
  description_note: string | null;
  ocr_raw_text: string | null;
  ocr_confidence: string | null;
  ocr_warnings: string[];
  created_by_staff_id: string | null;
  created_at: string;
  updated_at: string;
};

export const DEFAULT_POS_VAT_RATE = 10;
/** @deprecated KDV oranı için DEFAULT_POS_VAT_RATE kullanın */
export const DEFAULT_INVOICE_CUT_PERCENT = 10;
