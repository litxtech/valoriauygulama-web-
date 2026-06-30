import type { InvoiceLineItem, ParsedSupplierInvoice } from '@/lib/financeInvoiceOcr/types';
import { parseTrMoney } from '@/lib/financeInvoiceOcr/parseInvoiceText';

function tagValues(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[a-z0-9]+:)?${tag}[^>]*>([^<]*)</(?:[a-z0-9]+:)?${tag}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const v = m[1]?.trim();
    if (v) out.push(v);
  }
  return out;
}

function firstTag(xml: string, tag: string): string | null {
  return tagValues(xml, tag)[0] ?? null;
}

function extractInvoiceLines(xml: string): InvoiceLineItem[] {
  const blocks = xml.match(/<(?:[a-z0-9]+:)?InvoiceLine[\s\S]*?<\/(?:[a-z0-9]+:)?InvoiceLine>/gi) ?? [];
  const items: InvoiceLineItem[] = [];
  let i = 0;
  for (const block of blocks) {
    const name =
      firstTag(block, 'Name') ??
      block.match(/<(?:[a-z0-9]+:)?Description>([^<]+)/i)?.[1]?.trim() ??
      '';
    const qtyRaw = firstTag(block, 'InvoicedQuantity') ?? firstTag(block, 'BaseQuantity');
    const totalRaw =
      firstTag(block, 'LineExtensionAmount') ??
      firstTag(block, 'PriceAmount') ??
      firstTag(block, 'TaxInclusiveAmount');
    const unitPriceRaw = firstTag(block, 'PriceAmount');
    const total = parseTrMoney(totalRaw);
    if (!name || total == null) continue;
    items.push({
      id: `ubl-${i++}`,
      name,
      quantity: parseTrMoney(qtyRaw),
      unit: firstTag(block, 'unitCode') ?? null,
      unitPrice: parseTrMoney(unitPriceRaw),
      total,
    });
  }
  return items;
}

export function looksLikeEInvoiceXml(content: string): boolean {
  const head = content.slice(0, 8000).toLowerCase();
  if (!head.includes('<?xml')) return false;
  if (head.includes('camt.053') || head.includes('camt.054') || head.includes(':61:')) return false;
  return (
    head.includes('invoice') &&
    (head.includes('invoiceline') ||
      head.includes('payableamount') ||
      head.includes('ubl:invoice') ||
      head.includes('efatura'))
  );
}

export function parseEInvoiceXml(content: string): ParsedSupplierInvoice {
  const invoiceNo = firstTag(content, 'ID');
  const invoiceDate = firstTag(content, 'IssueDate')?.slice(0, 10) ?? null;
  const supplierName =
    content.match(/<(?:[a-z0-9]+:)?AccountingSupplierParty[\s\S]*?<(?:[a-z0-9]+:)?Name>([^<]+)/i)?.[1]?.trim() ??
    null;
  const lineItems = extractInvoiceLines(content);
  const grandTotal =
    parseTrMoney(firstTag(content, 'PayableAmount')) ??
    parseTrMoney(firstTag(content, 'TaxInclusiveAmount')) ??
    parseTrMoney(firstTag(content, 'LegalMonetaryTotal'));

  let confidence: ParsedSupplierInvoice['confidence'] = 'low';
  if (lineItems.length >= 1 && grandTotal != null) confidence = 'high';
  else if (lineItems.length >= 1 || grandTotal != null) confidence = 'medium';

  return {
    rawText: content.slice(0, 12000),
    ocrEngine: 'e-invoice-xml',
    invoiceNo,
    invoiceDate,
    supplierName,
    supplierTaxId:
      content.match(/<(?:[a-z0-9]+:)?PartyTaxScheme[\s\S]*?<(?:[a-z0-9]+:)?ID>([^<]+)/i)?.[1]?.trim() ?? null,
    buyerName:
      content.match(/<(?:[a-z0-9]+:)?AccountingCustomerParty[\s\S]*?<(?:[a-z0-9]+:)?Name>([^<]+)/i)?.[1]?.trim() ??
      null,
    lineItems,
    subtotal: parseTrMoney(firstTag(content, 'TaxExclusiveAmount')),
    taxAmount: parseTrMoney(firstTag(content, 'TaxAmount')),
    grandTotal,
    confidence,
    warnings: lineItems.length === 0 ? ['e-Fatura satırları okunamadı.'] : [],
    sourceKind: 'xml',
  };
}
