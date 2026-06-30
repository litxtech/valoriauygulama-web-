import { supabase } from '@/lib/supabase';
import { uploadAgreementContract } from '@/lib/financeAgreementContract';
import type { PickedInvoiceDocument } from '@/lib/financeInvoiceDocumentPick';
import {
  buildInvoiceAgreementTitle,
  formatLineItemsForNotes,
  serializeLineItems,
  sumInvoiceLineItems,
} from '@/lib/financeInvoiceOcr/parseInvoiceText';
import { scanInvoiceDocument, scanInvoiceDocuments } from '@/lib/financeInvoiceOcr/scanInvoiceDocument';
import type { InvoiceLineItem, InvoiceScanResult } from '@/lib/financeInvoiceOcr/types';
import {
  createCounterpartyAgreement,
  type AgreementMovementKind,
} from '@/lib/financeCounterpartyAgreements';

export { scanInvoiceDocument, scanInvoiceDocuments };
export type { InvoiceLineItem, InvoiceScanResult };

export type InvoiceDraftPreview = {
  title: string;
  targetAmount: number;
  startedOn: string;
  notes: string;
  lineItems: InvoiceLineItem[];
  invoiceNo: string;
  supplierCompany: string;
  supplierTaxId: string;
  buyerName: string;
};

export type CreateInvoiceDebtInput = {
  organizationId: string;
  counterpartyId: string;
  title: string;
  targetAmount: number;
  startedOn?: string;
  notes?: string;
  lineItems: InvoiceLineItem[];
  contractUris: string[];
  createdByStaffId?: string | null;
  movementKind?: AgreementMovementKind;
  /** OCR tedarikçi adını cari kaydına yaz */
  syncCounterpartyName?: string | null;
};

export async function scanAndParseInvoice(
  uri: string,
  fileName?: string | null
): Promise<InvoiceScanResult> {
  return scanInvoiceDocument(uri, fileName);
}

export async function scanAndParseInvoiceDocs(docs: PickedInvoiceDocument[]): Promise<InvoiceScanResult> {
  return scanInvoiceDocuments(docs);
}

export function buildDraftFromScan(scan: InvoiceScanResult): InvoiceDraftPreview {
  const lineItems = scan.lineItems;
  const lineSum = sumInvoiceLineItems(lineItems);
  const targetAmount = scan.grandTotal ?? (lineSum > 0 ? lineSum : 0);
  const notesParts: string[] = [];
  if (scan.buyerName) notesParts.push(`Alıcı: ${scan.buyerName}`);
  if (scan.supplierTaxId) notesParts.push(`VKN: ${scan.supplierTaxId}`);
  const itemsNote = formatLineItemsForNotes(lineItems);
  if (itemsNote) notesParts.push(itemsNote);
  if (scan.warnings.length) notesParts.push(scan.warnings.join(' · '));

  return {
    title: buildInvoiceAgreementTitle(scan),
    targetAmount,
    startedOn: scan.invoiceDate ?? new Date().toISOString().slice(0, 10),
    notes: notesParts.join('\n\n'),
    lineItems,
    invoiceNo: scan.invoiceNo ?? '',
    supplierCompany: scan.supplierName ?? '',
    supplierTaxId: scan.supplierTaxId ?? '',
    buyerName: scan.buyerName ?? '',
  };
}

export async function createDebtFromInvoice(
  input: CreateInvoiceDebtInput
): Promise<{ id: string } | { error: string }> {
  const contractUrls: string[] = [];
  for (const uri of input.contractUris) {
    try {
      contractUrls.push(await uploadAgreementContract(uri));
    } catch (e) {
      return { error: (e as Error)?.message ?? 'Fatura yüklenemedi' };
    }
  }

  if (input.syncCounterpartyName?.trim()) {
    const { error: nameErr } = await supabase
      .from('finance_counterparties')
      .update({ name: input.syncCounterpartyName.trim() })
      .eq('id', input.counterpartyId);
    if (nameErr) return { error: nameErr.message };
  }

  return createCounterpartyAgreement({
    organizationId: input.organizationId,
    counterpartyId: input.counterpartyId,
    title: input.title,
    targetAmount: input.targetAmount,
    startedOn: input.startedOn,
    notes: input.notes,
    contractUrls,
    lineItems: input.lineItems,
    createdByStaffId: input.createdByStaffId,
    movementKind: input.movementKind,
  });
}

export function lineItemsToDb(lineItems: InvoiceLineItem[]): Record<string, unknown>[] {
  return serializeLineItems(lineItems);
}

export function sourceKindLabel(kind: InvoiceScanResult['sourceKind']): string {
  switch (kind) {
    case 'image':
      return 'Fotoğraf (OCR)';
    case 'pdf':
      return 'PDF';
    case 'xml':
      return 'e-Fatura XML';
    case 'mixed':
      return 'Çoklu belge';
    default:
      return 'Metin';
  }
}
