import { supabase } from '@/lib/supabase';
import { uploadAgreementContract } from '@/lib/financeAgreementContract';
import { preparePosReceiptForUpload } from '@/lib/posReceiptInvoice/ocrPosReceiptImage';
import { computePosInvoiceTotals, recalcPosLine } from '@/lib/posReceiptInvoice/totals';
import type {
  PosExtraField,
  PosInvoiceLineItem,
  PosReceiptInvoiceRow,
  PosReceiptInvoiceStatus,
  PosRelatedRef,
  PosVenueScope,
  ParsedPosReceipt,
} from '@/lib/posReceiptInvoice/types';
import { DEFAULT_POS_VAT_RATE } from '@/lib/posReceiptInvoice/types';

const OCR_TEXT_MAX = 6000;

async function uploadReceiptUri(uri: string): Promise<string> {
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
  try {
    const compressed = await preparePosReceiptForUpload(uri);
    return await uploadAgreementContract(compressed);
  } catch {
    return await uploadAgreementContract(uri);
  }
}

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x)).filter(Boolean);
}

function asRelated(raw: unknown): PosRelatedRef[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, i) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const label = String(r.label ?? r.id ?? '').trim();
      if (!label) return null;
      return { id: String(r.id ?? `ref-${i}`), label };
    })
    .filter((x): x is PosRelatedRef => x != null);
}

function asExtra(raw: unknown): PosExtraField[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, i) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id ?? `extra-${i}`),
        key: String(r.key ?? ''),
        value: String(r.value ?? ''),
      };
    })
    .filter((x): x is PosExtraField => x != null);
}

function asLines(raw: unknown): PosInvoiceLineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, i) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const name = String(r.name ?? '').trim();
      const line: PosInvoiceLineItem = {
        id: String(r.id ?? `stored-${i}`),
        code: String(r.code ?? ''),
        name,
        quantity: typeof r.quantity === 'number' ? r.quantity : null,
        unit: r.unit != null ? String(r.unit) : null,
        unitPrice: typeof r.unitPrice === 'number' ? r.unitPrice : null,
        amount: typeof r.amount === 'number' ? r.amount : 0,
        discountRate: typeof r.discountRate === 'number' ? r.discountRate : null,
        discountAmount: typeof r.discountAmount === 'number' ? r.discountAmount : 0,
        vatRate: typeof r.vatRate === 'number' ? r.vatRate : DEFAULT_POS_VAT_RATE,
        vatAmount: typeof r.vatAmount === 'number' ? r.vatAmount : 0,
        total: typeof r.total === 'number' ? r.total : 0,
      };
      return recalcPosLine(line);
    })
    .filter((x): x is PosInvoiceLineItem => x != null && !!x.name);
}

function mapRow(r: Record<string, unknown>): PosReceiptInvoiceRow {
  return {
    id: String(r.id),
    organization_id: String(r.organization_id),
    counterparty_id: r.counterparty_id ? String(r.counterparty_id) : null,
    agreement_id: r.agreement_id ? String(r.agreement_id) : null,
    status: (r.status as PosReceiptInvoiceStatus) ?? 'draft',
    venue_scope: r.venue_scope === 'restaurant' ? 'restaurant' : 'hotel',
    receipt_urls: asStringArray(r.receipt_urls),
    receipt_no: r.receipt_no != null ? String(r.receipt_no) : null,
    merchant_name: r.merchant_name != null ? String(r.merchant_name) : null,
    merchant_tax_id: r.merchant_tax_id != null ? String(r.merchant_tax_id) : null,
    buyer_name: r.buyer_name != null ? String(r.buyer_name) : null,
    receipt_at: r.receipt_at != null ? String(r.receipt_at) : null,
    receipt_date: r.receipt_date != null ? String(r.receipt_date) : null,
    receipt_time: r.receipt_time != null ? String(r.receipt_time) : null,
    invoice_due_on: r.invoice_due_on != null ? String(r.invoice_due_on) : null,
    paid_by: r.paid_by != null ? String(r.paid_by) : null,
    payment_bank: r.payment_bank != null ? String(r.payment_bank) : null,
    payment_method: r.payment_method != null ? String(r.payment_method) : null,
    payment_received_on: r.payment_received_on != null ? String(r.payment_received_on) : null,
    card_last4: r.card_last4 != null ? String(r.card_last4) : null,
    receipt_total:
      r.receipt_total != null && Number.isFinite(Number(r.receipt_total)) ? Number(r.receipt_total) : null,
    line_items: asLines(r.line_items),
    related_order_ids: asRelated(r.related_order_ids),
    related_waybill_ids: asRelated(r.related_waybill_ids),
    extra_fields: asExtra(r.extra_fields),
    vat_rate: typeof r.vat_rate === 'number' ? r.vat_rate : DEFAULT_POS_VAT_RATE,
    subtotal: Number(r.subtotal ?? 0),
    discount_total: Number(r.discount_total ?? 0),
    discounted_subtotal: Number(r.discounted_subtotal ?? 0),
    tax_total: Number(r.tax_total ?? 0),
    grand_total: Number(r.grand_total ?? 0),
    payable_amount: Number(r.payable_amount ?? 0),
    invoice_cut_amount: Number(r.invoice_cut_amount ?? 0),
    kdv_exemption_reason: r.kdv_exemption_reason != null ? String(r.kdv_exemption_reason) : null,
    description_note: r.description_note != null ? String(r.description_note) : null,
    ocr_raw_text: r.ocr_raw_text != null ? String(r.ocr_raw_text) : null,
    ocr_confidence: r.ocr_confidence != null ? String(r.ocr_confidence) : null,
    ocr_warnings: asStringArray(r.ocr_warnings),
    created_by_staff_id: r.created_by_staff_id ? String(r.created_by_staff_id) : null,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

const SELECT_COLS =
  'id, organization_id, counterparty_id, agreement_id, status, venue_scope, receipt_urls, receipt_no, merchant_name, merchant_tax_id, buyer_name, receipt_at, receipt_date, receipt_time, invoice_due_on, paid_by, payment_bank, payment_method, payment_received_on, card_last4, receipt_total, line_items, related_order_ids, related_waybill_ids, extra_fields, vat_rate, subtotal, discount_total, discounted_subtotal, tax_total, grand_total, payable_amount, invoice_cut_amount, kdv_exemption_reason, description_note, ocr_raw_text, ocr_confidence, ocr_warnings, created_by_staff_id, created_at, updated_at';

/** Liste için hafif kolonlar (ocr_raw_text / ekstra alanlar yok) */
const SELECT_LIST_COLS =
  'id, organization_id, counterparty_id, agreement_id, status, venue_scope, receipt_urls, receipt_no, merchant_name, merchant_tax_id, buyer_name, receipt_at, receipt_date, receipt_time, invoice_due_on, paid_by, payment_bank, payment_method, payment_received_on, card_last4, receipt_total, vat_rate, subtotal, discount_total, discounted_subtotal, tax_total, grand_total, payable_amount, invoice_cut_amount, ocr_confidence, created_by_staff_id, created_at, updated_at';

  /** Fatura kesilmesi gereken tarihe göre (en yakın / en eski kesim önce) */
export async function listPosReceiptInvoices(
  organizationId: string,
  opts?: { venueScope?: PosVenueScope | 'all' }
): Promise<{ rows: PosReceiptInvoiceRow[]; error?: string }> {
  let q = supabase
    .from('pos_receipt_invoices')
    .select(SELECT_LIST_COLS)
    .eq('organization_id', organizationId)
    .neq('status', 'cancelled')
    .order('invoice_due_on', { ascending: true, nullsFirst: false })
    .order('receipt_date', { ascending: true, nullsFirst: false })
    .order('receipt_time', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(400);

  if (opts?.venueScope && opts.venueScope !== 'all') {
    q = q.eq('venue_scope', opts.venueScope);
  }

  const { data, error } = await q;
  if (error) return { rows: [], error: error.message };
  return {
    rows: ((data as Record<string, unknown>[]) ?? []).map((r) =>
      mapRow({
        ...r,
        line_items: [],
        related_order_ids: [],
        related_waybill_ids: [],
        extra_fields: [],
        ocr_raw_text: null,
        ocr_warnings: [],
        kdv_exemption_reason: null,
        description_note: null,
      })
    ),
  };
}

export async function getPosReceiptInvoice(
  id: string
): Promise<{ row: PosReceiptInvoiceRow | null; error?: string }> {
  const { data, error } = await supabase.from('pos_receipt_invoices').select(SELECT_COLS).eq('id', id).maybeSingle();
  if (error) return { row: null, error: error.message };
  if (!data) return { row: null };
  return { row: mapRow(data as Record<string, unknown>) };
}

export type SavePosReceiptInput = {
  organizationId: string;
  id?: string;
  counterpartyId?: string | null;
  status?: PosReceiptInvoiceStatus;
  venueScope?: PosVenueScope;
  receiptUris?: string[];
  existingReceiptUrls?: string[];
  receiptNo?: string | null;
  merchantName?: string | null;
  merchantTaxId?: string | null;
  buyerName?: string | null;
  receiptAt?: string | null;
  receiptDate?: string | null;
  receiptTime?: string | null;
  invoiceDueOn?: string | null;
  paidBy?: string | null;
  paymentBank?: string | null;
  paymentMethod?: string | null;
  paymentReceivedOn?: string | null;
  cardLast4?: string | null;
  /** POS fişindeki gerçek tutar (OCR / manuel) */
  receiptTotal?: number | null;
  lineItems: PosInvoiceLineItem[];
  relatedOrders?: PosRelatedRef[];
  relatedWaybills?: PosRelatedRef[];
  extraFields?: PosExtraField[];
  vatRate?: number;
  kdvExemptionReason?: string | null;
  descriptionNote?: string | null;
  ocrRawText?: string | null;
  ocrConfidence?: string | null;
  ocrWarnings?: string[];
  createdByStaffId?: string | null;
};

export async function savePosReceiptInvoice(
  input: SavePosReceiptInput
): Promise<{ id: string } | { error: string }> {
  if (input.id) {
    const existing = await getPosReceiptInvoice(input.id);
    if (existing.row?.status === 'invoiced') {
      return { error: 'Kesilmiş fiş düzenlenemez. Önce listeyi geri alın.' };
    }
    if (existing.row?.status === 'cancelled') {
      return { error: 'İptal edilmiş fiş düzenlenemez.' };
    }
  }

  const lines = input.lineItems.map(recalcPosLine);
  const receiptTotal =
    input.receiptTotal != null && Number.isFinite(input.receiptTotal) && input.receiptTotal > 0
      ? input.receiptTotal
      : null;
  const totals = computePosInvoiceTotals(lines, {
    receiptTotal,
    vatRate: input.vatRate ?? DEFAULT_POS_VAT_RATE,
  });

  const receiptUrls = [...(input.existingReceiptUrls ?? [])];
  try {
    const uploaded = await Promise.all((input.receiptUris ?? []).map((uri) => uploadReceiptUri(uri)));
    receiptUrls.push(...uploaded);
  } catch (e) {
    return { error: (e as Error)?.message ?? 'Fiş yüklenemedi' };
  }

  const payload = {
    organization_id: input.organizationId,
    counterparty_id: input.counterpartyId ?? null,
    status: input.status ?? 'draft',
    venue_scope: input.venueScope === 'restaurant' ? 'restaurant' : 'hotel',
    receipt_urls: receiptUrls,
    receipt_no: input.receiptNo?.trim() || null,
    merchant_name: input.merchantName?.trim() || null,
    merchant_tax_id: input.merchantTaxId?.trim() || null,
    buyer_name: input.buyerName?.trim() || null,
    receipt_at: input.receiptAt || null,
    receipt_date: input.receiptDate || null,
    receipt_time: input.receiptTime || null,
    invoice_due_on: input.invoiceDueOn || input.receiptDate || null,
    paid_by: input.paidBy?.trim() || null,
    payment_bank: input.paymentBank?.trim() || null,
    payment_method: input.paymentMethod?.trim() || null,
    payment_received_on: input.paymentReceivedOn || input.receiptDate || null,
    card_last4: input.cardLast4?.trim() || null,
    receipt_total: receiptTotal ?? (totals.payableAmount > 0 ? totals.payableAmount : null),
    line_items: lines,
    related_order_ids: input.relatedOrders ?? [],
    related_waybill_ids: input.relatedWaybills ?? [],
    extra_fields: input.extraFields ?? [],
    vat_rate: input.vatRate ?? DEFAULT_POS_VAT_RATE,
    subtotal: totals.subtotal,
    discount_total: totals.discountTotal,
    discounted_subtotal: totals.discountedSubtotal,
    tax_total: totals.taxTotal,
    grand_total: totals.grandTotal,
    payable_amount: totals.payableAmount,
    invoice_cut_amount: totals.invoiceCutAmount,
    kdv_exemption_reason: input.kdvExemptionReason?.trim() || null,
    description_note: input.descriptionNote?.trim() || null,
    ocr_raw_text: input.ocrRawText
      ? input.ocrRawText.length > OCR_TEXT_MAX
        ? input.ocrRawText.slice(0, OCR_TEXT_MAX)
        : input.ocrRawText
      : null,
    ocr_confidence: input.ocrConfidence ?? null,
    ocr_warnings: input.ocrWarnings ?? [],
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await supabase.from('pos_receipt_invoices').update(payload).eq('id', input.id);
    if (error) return { error: error.message };
    return { id: input.id };
  }

  const { data, error } = await supabase
    .from('pos_receipt_invoices')
    .insert({
      ...payload,
      created_by_staff_id: input.createdByStaffId ?? null,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: String((data as { id: string }).id) };
}

export async function deletePosReceiptInvoice(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('pos_receipt_invoices').delete().eq('id', id);
  return error ? { error: error.message } : {};
}

export type PosVenueAccountSummary = {
  pendingCount: number;
  invoicedCount: number;
  pendingReceiptTotal: number;
  pendingMatrahTotal: number;
};

/** Otel ve mutfak fiş hesapları — ayrı özet (toplamlar karışmaz) */
export async function summarizePosReceiptVenues(
  organizationId: string
): Promise<{
  hotel: PosVenueAccountSummary;
  restaurant: PosVenueAccountSummary;
  error?: string;
}> {
  const empty = (): PosVenueAccountSummary => ({
    pendingCount: 0,
    invoicedCount: 0,
    pendingReceiptTotal: 0,
    pendingMatrahTotal: 0,
  });
  const { data, error } = await supabase
    .from('pos_receipt_invoices')
    .select('venue_scope, status, receipt_total, payable_amount, invoice_cut_amount')
    .eq('organization_id', organizationId)
    .neq('status', 'cancelled')
    .limit(800);

  if (error) {
    return { hotel: empty(), restaurant: empty(), error: error.message };
  }

  const hotel = empty();
  const restaurant = empty();
  for (const raw of data ?? []) {
    const r = raw as {
      venue_scope?: string;
      status?: string;
      receipt_total?: number | null;
      payable_amount?: number | null;
      invoice_cut_amount?: number | null;
    };
    const bucket = r.venue_scope === 'restaurant' ? restaurant : hotel;
    const receipt =
      r.receipt_total != null && r.receipt_total > 0
        ? Number(r.receipt_total)
        : Number(r.payable_amount ?? 0);
    const matrah = Number(r.invoice_cut_amount ?? 0);
    if (r.status === 'invoiced') {
      bucket.invoicedCount += 1;
    } else {
      bucket.pendingCount += 1;
      bucket.pendingReceiptTotal += Number.isFinite(receipt) ? receipt : 0;
      bucket.pendingMatrahTotal += Number.isFinite(matrah) ? matrah : 0;
    }
  }
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  hotel.pendingReceiptTotal = round2(hotel.pendingReceiptTotal);
  hotel.pendingMatrahTotal = round2(hotel.pendingMatrahTotal);
  restaurant.pendingReceiptTotal = round2(restaurant.pendingReceiptTotal);
  restaurant.pendingMatrahTotal = round2(restaurant.pendingMatrahTotal);
  return { hotel, restaurant };
}

export async function markPosReceiptInvoiced(
  id: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('pos_receipt_invoices')
    .update({ status: 'invoiced', updated_at: new Date().toISOString() })
    .eq('id', id);
  return error ? { error: error.message } : {};
}

export async function updatePosReceiptStatus(
  id: string,
  status: PosReceiptInvoiceStatus
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('pos_receipt_invoices')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  return error ? { error: error.message } : {};
}

export type RescanPosResult = {
  id: string;
  changed: boolean;
  previousDate: string | null;
  nextDate: string | null;
  error?: string;
};

/**
 * Kayıtlı fişi son OCR/parser ile yeniden okur; tarih + temel alanları günceller.
 * Kesilmiş / iptal kayıtlar atlanır.
 */
export async function rescanPosReceiptInvoice(
  id: string,
  opts?: { preferFullOcr?: boolean }
): Promise<RescanPosResult> {
  const preferFullOcr = opts?.preferFullOcr !== false;
  const got = await getPosReceiptInvoice(id);
  if (got.error || !got.row) {
    return { id, changed: false, previousDate: null, nextDate: null, error: got.error ?? 'Kayıt yok' };
  }
  const row = got.row;
  if (row.status === 'invoiced' || row.status === 'cancelled') {
    return {
      id,
      changed: false,
      previousDate: row.invoice_due_on || row.receipt_date,
      nextDate: row.invoice_due_on || row.receipt_date,
      error: 'Kesilmiş veya iptal kayıt yeniden okunamaz',
    };
  }

  try {
    const { reparsePosReceiptFromStoredText, rescanPosReceiptFromStoredUrls } = await import(
      '@/lib/posReceiptInvoice/rescanPosReceipt'
    );
    const { computePosInvoiceTotals } = await import('@/lib/posReceiptInvoice/totals');

    let parsed;
    if (preferFullOcr && row.receipt_urls?.length) {
      parsed = await rescanPosReceiptFromStoredUrls(row.receipt_urls);
    } else if (row.ocr_raw_text?.trim()) {
      parsed = reparsePosReceiptFromStoredText(row.ocr_raw_text, { ocrEngine: row.ocr_confidence });
    } else if (row.receipt_urls?.length) {
      parsed = await rescanPosReceiptFromStoredUrls(row.receipt_urls);
    } else {
      return {
        id,
        changed: false,
        previousDate: row.receipt_date,
        nextDate: row.receipt_date,
        error: 'Görsel veya OCR metni yok',
      };
    }

    const totals = computePosInvoiceTotals(parsed.lineItems, {
      receiptTotal: parsed.receiptTotal,
      vatRate: parsed.vatRate,
    });
    const nextDate = parsed.invoiceDueOn || parsed.receiptDate;
    const prevDate = row.invoice_due_on || row.receipt_date;

    const { error } = await supabase
      .from('pos_receipt_invoices')
      .update({
        receipt_no: parsed.receiptNo ?? row.receipt_no,
        merchant_name: parsed.merchantName ?? row.merchant_name,
        merchant_tax_id: parsed.merchantTaxId ?? row.merchant_tax_id,
        buyer_name: parsed.buyerName ?? row.buyer_name,
        receipt_at: parsed.receiptAt,
        receipt_date: parsed.receiptDate,
        receipt_time: parsed.receiptTime,
        invoice_due_on: nextDate,
        payment_bank: parsed.paymentBank ?? row.payment_bank,
        payment_method: parsed.paymentMethod ?? row.payment_method,
        payment_received_on: parsed.paymentReceivedOn || parsed.receiptDate,
        card_last4: parsed.cardLast4 ?? row.card_last4,
        receipt_total: parsed.receiptTotal ?? row.receipt_total,
        line_items: parsed.lineItems?.length ? parsed.lineItems : row.line_items,
        vat_rate: parsed.vatRate,
        subtotal: totals.subtotal,
        discount_total: totals.discountTotal,
        discounted_subtotal: totals.discountedSubtotal,
        tax_total: totals.taxTotal,
        grand_total: totals.grandTotal,
        payable_amount: totals.payableAmount,
        invoice_cut_amount: totals.invoiceCutAmount,
        ocr_raw_text: parsed.rawText || row.ocr_raw_text,
        ocr_confidence: parsed.confidence,
        ocr_warnings: parsed.warnings,
        status:
          row.status === 'draft' && parsed.receiptTotal != null && parsed.receiptTotal > 0
            ? 'ready'
            : row.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      return { id, changed: false, previousDate: prevDate, nextDate: prevDate, error: error.message };
    }

    return {
      id,
      changed: prevDate !== nextDate || Boolean(parsed.receiptDate),
      previousDate: prevDate,
      nextDate,
    };
  } catch (e) {
    return {
      id,
      changed: false,
      previousDate: row.receipt_date,
      nextDate: row.receipt_date,
      error: (e as Error)?.message ?? 'Yeniden okuma başarısız',
    };
  }
}

/** Bekleyen fişleri sırayla yeniden oku */
export async function batchRescanPosReceiptInvoices(
  ids: string[],
  onProgress?: (done: number, total: number, last: RescanPosResult) => void
): Promise<{ updated: number; failed: number; dateFixed: number; results: RescanPosResult[] }> {
  const results: RescanPosResult[] = [];
  let updated = 0;
  let failed = 0;
  let dateFixed = 0;
  for (let i = 0; i < ids.length; i++) {
    const res = await rescanPosReceiptInvoice(ids[i], { preferFullOcr: true });
    results.push(res);
    if (res.error) failed += 1;
    else {
      updated += 1;
      if (res.previousDate !== res.nextDate) dateFixed += 1;
    }
    onProgress?.(i + 1, ids.length, res);
  }
  return { updated, failed, dateFixed, results };
}

export function draftFromParsed(
  parsed: ParsedPosReceipt,
  sourceUris: string[],
  venueScope: PosVenueScope = 'hotel'
): Omit<SavePosReceiptInput, 'organizationId' | 'createdByStaffId'> & { receiptUris: string[] } {
  return {
    receiptUris: sourceUris,
    receiptNo: parsed.receiptNo,
    merchantName: parsed.merchantName,
    merchantTaxId: parsed.merchantTaxId,
    buyerName: parsed.buyerName,
    receiptAt: parsed.receiptAt,
    receiptDate: parsed.receiptDate,
    receiptTime: parsed.receiptTime,
    invoiceDueOn: parsed.invoiceDueOn,
    paidBy: parsed.paidBy,
    paymentBank: parsed.paymentBank,
    paymentMethod: parsed.paymentMethod,
    paymentReceivedOn: parsed.paymentReceivedOn,
    cardLast4: parsed.cardLast4,
    receiptTotal: parsed.receiptTotal,
    lineItems: parsed.lineItems,
    venueScope,
    vatRate: parsed.vatRate,
    ocrRawText: parsed.rawText,
    ocrConfidence: parsed.confidence,
    ocrWarnings: parsed.warnings,
    status: 'draft',
  };
}

export const POS_STATUS_LABELS: Record<PosReceiptInvoiceStatus, string> = {
  draft: 'Taslak',
  ready: 'Faturaya hazır',
  invoiced: 'Fatura kesildi',
  cancelled: 'İptal',
};
