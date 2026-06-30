import type { InvoiceLineItem, ParsedSupplierInvoice } from '@/lib/financeInvoiceOcr/types';

const SKIP_LINE =
  /^(tarih|date|açıklama|aciklama|ürün|urun|mal\s*hizmet|miktar|birim|fiyat|tutar|kdv|matrah|iskonto|ara\s*toplam|belge|irsaliye|vergi|tc|vkn|tel|fax|web|www|iban|hesap|sayfa|page|adet|no\b|sıra|sira|#)/i;

const TOTAL_LINE =
  /(?:genel\s*)?toplam|toplam\s*tutar|ödenecek|odenecek|net\s*tutar|kdv\s*dahil|genel\s*toplam|yekün|yekun|invoice\s*total|amount\s*due/i;

const TAX_LINE = /^kdv\b|^toplam\s*kdv|^matrah/i;

const META_NO = /fatura\s*(?:no|numarası|numarasi|#)?\s*[:\s]*([A-Z0-9][A-Z0-9\-\/\.]{2,})/i;
const META_DATE =
  /(?:fatura\s*)?tarih\s*[:\s]*(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})/i;
const META_VKN = /(?:v\.?k\.?n|vergi\s*(?:no|kimlik)|tax\s*(?:id|no))\s*[:\s]*(\d{10,11})/i;
const META_BUYER = /(?:alıcı|alici|müşteri|musteri|sayın|sayin)\s*[:\s]*(.{3,60})/i;
const COMPANY_HINT = /(?:a\.?\s*ş\.?|ltd|limited|san\.|tic\.|inş\.|ins\.|ticaret|market|yapı|malzeme|tedarik)/i;

const AMOUNT_AT_END =
  /(.+?)\s+(-?\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})|-?\d+(?:,\d{2})?)\s*(?:TL|TRY|₺)?\s*$/i;

const QTY_UNIT_PRICE =
  /^(.+?)\s+(\d+(?:[.,]\d+)?)\s+(\S+)\s+([\d.,]+)\s+([\d.,]+)\s*(?:TL|TRY|₺)?\s*$/i;

let lineIdSeq = 0;
function nextLineId(): string {
  lineIdSeq += 1;
  return `line-${lineIdSeq}`;
}

export function parseTrMoney(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  let s = raw.trim().replace(/\s/g, '').replace(/[^\d,.-]/g, '');
  if (!s || s === '-' || s === '.') return null;
  const neg = s.startsWith('-');
  s = s.replace(/^-/, '');
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  const val = Math.round(n * 100) / 100;
  return neg ? -val : val;
}

function parseTrDate(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const m = raw.trim().match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$/);
  if (!m) return null;
  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  let yyyy = m[3];
  if (yyyy.length === 2) yyyy = `20${yyyy}`;
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 2);
}

function extractMeta(lines: string[]): {
  invoiceNo: string | null;
  invoiceDate: string | null;
  supplierName: string | null;
  supplierTaxId: string | null;
  buyerName: string | null;
} {
  const joined = lines.join('\n');
  const invoiceNo = joined.match(META_NO)?.[1]?.trim() ?? null;
  const dateRaw = joined.match(META_DATE)?.[1] ?? null;
  const invoiceDate = parseTrDate(dateRaw);
  const supplierTaxId = joined.match(META_VKN)?.[1]?.trim() ?? null;
  const buyerName = joined.match(META_BUYER)?.[1]?.trim().replace(/\s+/g, ' ') ?? null;

  let supplierName: string | null = null;
  for (const line of lines.slice(0, 14)) {
    if (line.length < 4 || line.length > 90) continue;
    if (/^\d/.test(line)) continue;
    if (/fatura|tel|fax|v\.?d\.?|v\.?k\.?n|iban|www\.|e-posta|email/i.test(line)) continue;
    if (COMPANY_HINT.test(line) || (!supplierName && line.length >= 6)) {
      supplierName = line;
      if (COMPANY_HINT.test(line)) break;
    }
  }

  return { invoiceNo, invoiceDate, supplierName, supplierTaxId, buyerName };
}

function parseLineItemFromRow(line: string): InvoiceLineItem | null {
  if (SKIP_LINE.test(line) || TAX_LINE.test(line) || TOTAL_LINE.test(line)) return null;
  if (line.length < 4) return null;

  const qtyMatch = line.match(QTY_UNIT_PRICE);
  if (qtyMatch) {
    const total = parseTrMoney(qtyMatch[5]);
    if (!total) return null;
    const name = qtyMatch[1].trim();
    if (name.length < 2) return null;
    return {
      id: nextLineId(),
      name,
      quantity: parseTrMoney(qtyMatch[2]),
      unit: qtyMatch[3].trim() || null,
      unitPrice: parseTrMoney(qtyMatch[4]),
      total,
    };
  }

  const endMatch = line.match(AMOUNT_AT_END);
  if (!endMatch) return null;
  const total = parseTrMoney(endMatch[2]);
  if (!total || total < 0.01) return null;
  const name = endMatch[1].trim();
  if (name.length < 2 || SKIP_LINE.test(name)) return null;
  if (/^[\d.,\s]+$/.test(name)) return null;

  return {
    id: nextLineId(),
    name,
    quantity: null,
    unit: null,
    unitPrice: null,
    total,
  };
}

function extractTotals(lines: string[]): {
  grandTotal: number | null;
  subtotal: number | null;
  taxAmount: number | null;
} {
  let grandTotal: number | null = null;
  let subtotal: number | null = null;
  let taxAmount: number | null = null;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (TOTAL_LINE.test(line) && grandTotal == null) {
      const amounts = [...line.matchAll(/([\d.,]+)\s*(?:TL|TRY|₺)?/gi)]
        .map((m) => parseTrMoney(m[1]))
        .filter((n): n is number => n != null);
      if (amounts.length) grandTotal = amounts[amounts.length - 1];
    }
    if (/ara\s*toplam/i.test(line) && subtotal == null) {
      const amounts = [...line.matchAll(/([\d.,]+)/g)]
        .map((m) => parseTrMoney(m[1]))
        .filter((n): n is number => n != null);
      if (amounts.length) subtotal = amounts[amounts.length - 1];
    }
    if (TAX_LINE.test(line) && taxAmount == null) {
      const amounts = [...line.matchAll(/([\d.,]+)/g)]
        .map((m) => parseTrMoney(m[1]))
        .filter((n): n is number => n != null);
      if (amounts.length) taxAmount = amounts[amounts.length - 1];
    }
  }

  if (grandTotal == null) {
    const amounts = lines
      .flatMap((l) => [...l.matchAll(/([\d.,]+)\s*(?:TL|TRY|₺)/gi)].map((m) => parseTrMoney(m[1])))
      .filter((n): n is number => n != null);
    if (amounts.length) grandTotal = amounts.reduce((a, b) => (b > a ? b : a), 0);
  }

  return { grandTotal, subtotal, taxAmount };
}

function dedupeLineItems(items: InvoiceLineItem[]): InvoiceLineItem[] {
  const seen = new Set<string>();
  const out: InvoiceLineItem[] = [];
  for (const item of items) {
    const key = `${item.name.toLowerCase()}::${item.total}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function parseInvoiceFromText(
  text: string,
  opts?: { ocrEngine?: string | null; sourceKind?: ParsedSupplierInvoice['sourceKind'] }
): ParsedSupplierInvoice {
  lineIdSeq = 0;
  const warnings: string[] = [];
  const lines = normalizeLines(text);

  if (lines.length === 0) {
    return {
      rawText: text,
      ocrEngine: opts?.ocrEngine ?? null,
      invoiceNo: null,
      invoiceDate: null,
      supplierName: null,
      supplierTaxId: null,
      buyerName: null,
      lineItems: [],
      subtotal: null,
      taxAmount: null,
      grandTotal: null,
      confidence: 'low',
      warnings: ['Metin okunamadı. Belge net mi? Manuel giriş yapın.'],
      sourceKind: 'text',
    };
  }

  const meta = extractMeta(lines);
  const lineItems = dedupeLineItems(
    lines.map(parseLineItemFromRow).filter((x): x is InvoiceLineItem => x != null)
  );

  const totals = extractTotals(lines);
  let grandTotal = totals.grandTotal;

  if (lineItems.length >= 2) {
    const sumLines = Math.round(lineItems.reduce((s, l) => s + l.total, 0) * 100) / 100;
    if (!grandTotal || Math.abs(grandTotal - sumLines) / Math.max(grandTotal, sumLines) > 0.08) {
      if (sumLines > 0) grandTotal = sumLines;
    }
  }

  if (lineItems.length === 0) {
    warnings.push('Kalem satırı bulunamadı. Toplam tutarı elle kontrol edin.');
  }
  if (!grandTotal) {
    warnings.push('Genel toplam otomatik bulunamadı.');
  }

  let confidence: ParsedSupplierInvoice['confidence'] = 'low';
  if (lineItems.length >= 2 && grandTotal != null) confidence = 'high';
  else if (lineItems.length >= 1 || grandTotal != null) confidence = 'medium';

  return {
    rawText: text,
    ocrEngine: opts?.ocrEngine ?? null,
    invoiceNo: meta.invoiceNo,
    invoiceDate: meta.invoiceDate,
    supplierName: meta.supplierName,
    supplierTaxId: meta.supplierTaxId,
    buyerName: meta.buyerName,
    lineItems,
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    grandTotal,
    confidence,
    warnings,
    sourceKind: opts?.sourceKind ?? 'text',
  };
}

export function sumInvoiceLineItems(items: InvoiceLineItem[]): number {
  return Math.round(items.reduce((s, l) => s + (l.total || 0), 0) * 100) / 100;
}

export function buildInvoiceAgreementTitle(parsed: Pick<ParsedSupplierInvoice, 'invoiceNo' | 'invoiceDate'>): string {
  const parts: string[] = [];
  if (parsed.invoiceNo) parts.push(`Fatura ${parsed.invoiceNo}`);
  else parts.push('Malzeme faturası');
  if (parsed.invoiceDate) parts.push(parsed.invoiceDate);
  return parts.join(' · ');
}

export function formatLineItemsForNotes(items: InvoiceLineItem[]): string {
  if (!items.length) return '';
  return items
    .map((l) => {
      const qty =
        l.quantity != null
          ? `${l.quantity}${l.unit ? ` ${l.unit}` : ''} × `
          : '';
      const unitPrice = l.unitPrice != null ? `@ ${l.unitPrice.toFixed(2)} = ` : '';
      return `• ${l.name}: ${qty}${unitPrice}${l.total.toFixed(2)} TL`;
    })
    .join('\n');
}

export function serializeLineItems(items: InvoiceLineItem[]): Record<string, unknown>[] {
  return items.map(({ id, name, quantity, unit, unitPrice, total }) => ({
    id,
    name,
    quantity,
    unit,
    unitPrice,
    total,
  }));
}

export function deserializeLineItems(raw: unknown): InvoiceLineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, i) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const total = typeof r.total === 'number' ? r.total : parseTrMoney(String(r.total ?? ''));
      const name = String(r.name ?? '').trim();
      if (!name || total == null) return null;
      return {
        id: String(r.id ?? `stored-${i}`),
        name,
        quantity: typeof r.quantity === 'number' ? r.quantity : parseTrMoney(String(r.quantity ?? '')),
        unit: r.unit ? String(r.unit) : null,
        unitPrice: typeof r.unitPrice === 'number' ? r.unitPrice : parseTrMoney(String(r.unitPrice ?? '')),
        total,
      } satisfies InvoiceLineItem;
    })
    .filter((x): x is InvoiceLineItem => x != null);
}
