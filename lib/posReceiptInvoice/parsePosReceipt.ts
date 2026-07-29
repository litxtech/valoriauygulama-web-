import { cleanupPosOcrText, expandReceiptOcrLines } from '@/lib/posReceiptInvoice/cleanupPosOcrText';
import { extractReceiptDateTime } from '@/lib/posReceiptInvoice/extractPosDate';
import {
  amountsOnLine,
  extractPaymentBank,
  extractPaymentMethod,
  extractReceiptNo,
  extractReceiptTotal,
  parsePosMoney,
  reconcileReceiptTotal,
} from '@/lib/posReceiptInvoice/extractPosFields';
import {
  computePosInvoiceTotals,
  posLineFromInclusiveTotal,
  recalcPosLine,
} from '@/lib/posReceiptInvoice/totals';
import type { ParsedPosReceipt, PosInvoiceLineItem } from '@/lib/posReceiptInvoice/types';
import { DEFAULT_POS_VAT_RATE } from '@/lib/posReceiptInvoice/types';

const SKIP_ITEM =
  /^(tarih|date|saat|fi[sş]|belge|ürün|urun|mal\s*hizmet|miktar|birim|fiyat|tutar|kdv|matrah|iskonto|ara\s*toplam|vergi|tel|fax|web|www|iban|hesap|sayfa|page|no\b|sıra|sira|#|v\.?k\.?n|v\.?d\.?|teşekkür|tesekkur|iyi\s*günler|iyi\s*gunler|banka|musteri|m[uü][sş]teri|card\s*holder|isyeri)/i;

const TOTAL_LABEL =
  /(?:genel\s*)?(?:t[o0]plam|top[il1]am)|(?:ö|o)denecek(?:\s*tutar)?|net\s*tutar|kdv\s*dahil|yek[uü]n|amount\s*due|(?:ö|o)denen|kart\s*t[o0]plam|pos\s*t[o0]plam|sat[iı][sş]\s*t[o0]plam|fi[sş]\s*t[o0]plam/i;

const NOT_TOTAL =
  /ara\s*t[o0]plam|kdv\s*%|%\s*\d{1,2}\s*kdv|matrah|iskonto|indirim|puan|para\s*[uü]st[uü]|nakit\s*[uü]st|iade|iptal/i;

const META_VKN = /(?:v\.?\s*k\.?\s*n\.?|vergi\s*(?:no|kimlik)|tax\s*(?:id|no))\s*[:\s]*(\d{10,11})/i;
const LAST4_RE = /(?:\*+|x{2,}|\.{2,}|#{2,}|·{2,})\s*(\d{4})\b|(?:son\s*4|last\s*4)\s*[:\s]*(\d{4})/i;

const COMPANY_HINT =
  /(?:a\.?\s*[sş]\.?|ltd|limited|san\.|tic\.|market|g[ıi]da|restoran|cafe|kafe|otel|hotel|ticaret|[sş]ube|migros|bim|a101|şok|sok|carrefour|metro|gratis|watsons)/i;

const QTY_ROW =
  /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(adet|ad\.?|kg|lt\.?|gr|g|pkt|paket|kutu|mt|m)\s+([\d.,]+)\s+([\d.,]+)\s*(?:TL|TRY|₺)?\s*$/i;

const NAME_AMOUNT =
  /^(.{2,70}?)\s+(-?\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})|-?\d+(?:[.,]\d{2})?)\s*(?:TL|TRY|₺)?\s*$/i;

function toIsoDateTime(date: string | null, time: string | null): string | null {
  if (!date) return null;
  const t = time || '12:00:00';
  const d = new Date(`${date}T${t}+03:00`);
  if (Number.isNaN(d.getTime())) return `${date}T${t}+03:00`;
  return d.toISOString();
}

function normalizeLines(text: string): string[] {
  const raw = cleanupPosOcrText(text)
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 2);
  return expandReceiptOcrLines(raw).map((l) => normalizeTotalLine(l)).filter((l) => l.length >= 1);
}

function normalizeTotalLine(line: string): string {
  return line
    .replace(/\bT0PLAM\b/gi, 'TOPLAM')
    .replace(/\bTOFLAM\b/gi, 'TOPLAM')
    .replace(/\bTOPIAM\b/gi, 'TOPLAM')
    .replace(/\bTOP1AM\b/gi, 'TOPLAM')
    .replace(/\bTOPLAM\b/gi, 'TOPLAM')
    .replace(/\bODENECEK\b/gi, 'ÖDENECEK')
    .replace(/\bODENEGEK\b/gi, 'ÖDENECEK')
    .replace(/\bODENFCEK\b/gi, 'ÖDENECEK')
    .replace(/(\d)[OoQ](\d)/g, '$10$2')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePosLineItem(line: string, vatRate: number): PosInvoiceLineItem | null {
  if (SKIP_ITEM.test(line) || TOTAL_LABEL.test(line) || NOT_TOTAL.test(line)) return null;
  if (line.length < 3 || line.length > 100) return null;
  if (/^\d{1,2}[./\-]\d{1,2}/.test(line)) return null;
  if (/v\.?\s*k\.?\s*n|iban|tel[:\s]|www\.|http|\d{10,}/i.test(line)) return null;

  const qtyMatch = line.match(QTY_ROW);
  if (qtyMatch) {
    const total = parsePosMoney(qtyMatch[5]);
    if (!total || total < 0.01) return null;
    const name = qtyMatch[1].trim();
    if (name.length < 2 || SKIP_ITEM.test(name)) return null;
    return posLineFromInclusiveTotal({
      name,
      quantity: parsePosMoney(qtyMatch[2]) ?? 1,
      unit: qtyMatch[3],
      totalInclusive: total,
      vatRate,
    });
  }

  const end = line.match(NAME_AMOUNT);
  if (!end) return null;
  const total = parsePosMoney(end[2]);
  if (!total || total < 0.01) return null;
  const name = end[1].trim();
  if (name.length < 2 || SKIP_ITEM.test(name) || /^[\d.,\s*%]+$/.test(name)) return null;
  if (TOTAL_LABEL.test(name) || /kdv|matrah|iskonto|indirim|nakit|kart|banka/i.test(name)) return null;

  return posLineFromInclusiveTotal({ name, totalInclusive: total, vatRate });
}

function dedupeLines(items: PosInvoiceLineItem[]): PosInvoiceLineItem[] {
  const seen = new Set<string>();
  const out: PosInvoiceLineItem[] = [];
  for (const item of items) {
    const key = `${item.name.toLowerCase()}::${item.total}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function parsePosReceiptFromText(
  text: string,
  opts?: { ocrEngine?: string | null; sourceKind?: ParsedPosReceipt['sourceKind']; vatRate?: number }
): ParsedPosReceipt {
  const vatRate = opts?.vatRate ?? DEFAULT_POS_VAT_RATE;
  const warnings: string[] = [];
  const lines = normalizeLines(text);
  const joined = lines.join('\n');

  if (!lines.length) {
    return {
      rawText: text,
      ocrEngine: opts?.ocrEngine ?? null,
      receiptNo: null,
      merchantName: null,
      merchantTaxId: null,
      buyerName: null,
      receiptDate: null,
      receiptTime: null,
      receiptAt: null,
      invoiceDueOn: null,
      paidBy: null,
      paymentBank: null,
      paymentMethod: null,
      paymentReceivedOn: null,
      cardLast4: null,
      receiptTotal: null,
      lineItems: [],
      vatRate,
      totals: computePosInvoiceTotals([]),
      confidence: 'low',
      warnings: ['Metin okunamadı. Fişi dik, net ve ışıklı çekin.'],
      sourceKind: opts?.sourceKind ?? 'text',
    };
  }

  const receiptNo = extractReceiptNo(lines, joined);
  const dateExtract = extractReceiptDateTime(joined, lines);
  const receiptDate = dateExtract.receiptDate;
  const receiptTime = dateExtract.receiptTime;

  const merchantTaxId = joined.match(META_VKN)?.[1]?.replace(/\s/g, '') ?? null;

  let buyerName: string | null = null;
  const buyerMatch = joined.match(
    /(?:musteri|m[uü][sş]teri|card\s*holder|kart\s*hamil[iı]?)\s*[:\-]?\s*([A-Za-zÇĞİÖŞÜçğıöşü][A-Za-zÇĞİÖŞÜçğıöşü \t.'-]{1,48})/i
  );
  if (buyerMatch?.[1]) {
    buyerName = buyerMatch[1].replace(/[ \t]+/g, ' ').trim();
    if (/tarih|tutar|toplam|banka|visa|master|kart|isyeri|onay/i.test(buyerName)) buyerName = null;
  }

  let merchantName: string | null = null;
  const isyeriMatch = joined.match(
    /(?:isyeri|işyeri|[uü]ye\s*[iı][sş]yeri|merchant|unvan|[uü]nvan)\s*[:\-]?\s*([A-Za-zÇĞİÖŞÜçğıöşü0-9][A-Za-zÇĞİÖŞÜçğıöşü0-9 \t.&'\-]{1,58})/i
  );
  if (isyeriMatch?.[1]) {
    merchantName = isyeriMatch[1].replace(/[ \t]+/g, ' ').trim();
    if (/musteri|m[uü][sş]teri|tarih|tutar|toplam/i.test(merchantName)) {
      merchantName = merchantName.split(/\s+(?:musteri|tarih|tutar|toplam)/i)[0].trim() || null;
    }
  }

  for (const line of lines.slice(0, 14)) {
    if (merchantName) break;
    if (line.length < 4 || line.length > 80) continue;
    if (/^\d/.test(line)) continue;
    if (/musteri|m[uü][sş]teri|card\s*holder|kart\s*hamil/i.test(line)) continue;
    if (
      /fi[sş]|tarih|t[o0]plam|kdv|tel|fax|v\.?\s*k|iban|www|(?:ö|o)denecek|saat|banka|tutar|satis|islem|onay|terminal|batch/i.test(
        line
      )
    ) {
      continue;
    }
    if (COMPANY_HINT.test(line) || (!merchantName && /[A-Za-zÇĞİÖŞÜçğıöşü]{3,}/.test(line) && line.length >= 5)) {
      merchantName = line;
      if (COMPANY_HINT.test(line)) break;
    }
  }

  const paymentBank = extractPaymentBank(joined, lines);
  const paymentMethod = extractPaymentMethod(joined);
  const cardM = joined.match(LAST4_RE);
  const cardLast4 = cardM?.[1] || cardM?.[2] || null;

  const receiptTotalRaw = extractReceiptTotal(lines);
  const reconciled = reconcileReceiptTotal(receiptTotalRaw, lines);
  const receiptTotal = reconciled.total;
  if (reconciled.adjusted && reconciled.reason) {
    warnings.push(reconciled.reason);
  }

  let lineItems = dedupeLines(
    lines.map((l) => parsePosLineItem(l, vatRate)).filter((x): x is PosInvoiceLineItem => x != null)
  );

  lineItems = lineItems.filter(
    (l) => !/musteri|m[uü][sş]teri|card\s*holder|kart\s*hamil/i.test(l.name)
  );

  if (receiptTotal != null && lineItems.length > 1) {
    lineItems = lineItems.filter((l) => Math.abs(l.total - receiptTotal) > 0.009);
  }

  if (receiptTotal != null && lineItems.length >= 1) {
    const sum = Math.round(lineItems.reduce((s, l) => s + l.total, 0) * 100) / 100;
    if (sum > 0 && Math.abs(sum - receiptTotal) / receiptTotal > 0.12) {
      warnings.push('Kalemler fiş toplamıyla uyuşmadı; tek satır kullanıldı.');
      lineItems = [
        posLineFromInclusiveTotal({
          name: merchantName ? `${merchantName}` : 'POS fiş',
          totalInclusive: receiptTotal,
          vatRate,
        }),
      ];
    }
  }

  if (lineItems.length === 0 && receiptTotal != null) {
    lineItems = [
      posLineFromInclusiveTotal({
        name: merchantName ? `${merchantName}` : 'POS fiş',
        totalInclusive: receiptTotal,
        vatRate,
      }),
    ];
  }

  if (!receiptTotal) warnings.push('Fiş toplamı okunamadı — tutarı elle girin (kuruşlu).');
  if (!receiptNo) warnings.push('Fiş no okunamadı — elle girin.');
  if (!paymentBank) warnings.push('Banka adı okunamadı — elle girin.');
  if (!receiptDate) warnings.push('Fiş tarihi okunamadı.');
  else if (dateExtract.ambiguous) {
    const alt = dateExtract.candidates[1]?.date;
    warnings.push(
      alt ? `Tarih belirsiz — alternatif: ${alt}. Kontrol edin.` : 'Tarih belirsiz — kontrol edin.'
    );
  } else if (dateExtract.dateConfidence < 45) {
    warnings.push('Fiş tarihi düşük güvenilirlikle okundu — kontrol edin.');
  }

  const totals = computePosInvoiceTotals(lineItems.map(recalcPosLine), { receiptTotal, vatRate });

  let confidence: ParsedPosReceipt['confidence'] = 'low';
  if (
    receiptTotal != null &&
    receiptDate &&
    dateExtract.dateConfidence >= 50 &&
    (receiptNo || paymentBank)
  ) {
    confidence = 'high';
  } else if (receiptTotal != null) {
    confidence = 'medium';
  }

  return {
    rawText: text,
    ocrEngine: opts?.ocrEngine ?? null,
    receiptNo,
    merchantName,
    merchantTaxId,
    buyerName,
    receiptDate,
    receiptTime,
    receiptAt: toIsoDateTime(receiptDate, receiptTime),
    invoiceDueOn: receiptDate,
    paidBy: null,
    paymentBank,
    paymentMethod,
    paymentReceivedOn: receiptDate,
    cardLast4,
    receiptTotal,
    lineItems,
    vatRate,
    totals,
    confidence,
    warnings,
    sourceKind: opts?.sourceKind ?? 'text',
  };
}

export function parseTrMoneyPos(raw: string | null | undefined): number | null {
  return parsePosMoney(raw);
}

export { amountsOnLine };
export {
  extractReceiptDateTime,
  parseTrDate,
  normalizeTime,
  ocrTextHasReceiptDate,
} from '@/lib/posReceiptInvoice/extractPosDate';
