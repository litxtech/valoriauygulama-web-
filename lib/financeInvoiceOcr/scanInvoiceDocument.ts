import { parseInvoiceFromText } from '@/lib/financeInvoiceOcr/parseInvoiceText';
import { looksLikeEInvoiceXml, parseEInvoiceXml } from '@/lib/financeInvoiceOcr/eInvoiceXmlParse';
import type { InvoiceScanResult, ParsedSupplierInvoice } from '@/lib/financeInvoiceOcr/types';
import type { PickedInvoiceDocument } from '@/lib/financeInvoiceDocumentPick';

function extensionFromName(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  if (i < 0) return '';
  return fileName.slice(i + 1).toLowerCase();
}

function isPdf(fileName: string, uri: string): boolean {
  return extensionFromName(fileName) === 'pdf' || uri.toLowerCase().includes('.pdf');
}

function isXml(fileName: string): boolean {
  return extensionFromName(fileName) === 'xml';
}

function isImageFile(fileName: string): boolean {
  const ext = extensionFromName(fileName);
  return ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'].includes(ext);
}

async function ocrImageUri(uri: string): Promise<{ text: string; engine: string | null }> {
  const { ocrLinesFromImage } = await import('@/lib/scanner/ocrLinesFromImage');
  try {
    const { lines, engine } = await ocrLinesFromImage(uri, { document: true, fast: false });
    return { text: lines.join('\n'), engine };
  } catch {
    const { ocrLinesFromImageExpoOnly } = await import('@/lib/scanner/ocrLinesFromImage');
    const { lines, engine } = await ocrLinesFromImageExpoOnly(uri, { document: true });
    return { text: lines.join('\n'), engine };
  }
}

async function readFileText(uri: string, fileName: string): Promise<string> {
  const { readStatementFile } = await import('@/lib/bankStatement/readFile');
  const { text } = await readStatementFile(uri, fileName);
  return text;
}

async function scanSingleDocument(doc: PickedInvoiceDocument | { uri: string; fileName: string; kind?: PickedInvoiceDocument['kind'] }): Promise<ParsedSupplierInvoice> {
  const name = doc.fileName?.trim() || 'fatura';
  const kind = doc.kind ?? (isPdf(name, doc.uri) ? 'pdf' : isXml(name) ? 'xml' : isImageFile(name) ? 'image' : 'other');
  let text = '';
  let engine: string | null = null;
  let sourceKind: ParsedSupplierInvoice['sourceKind'] = 'text';

  if (kind === 'pdf' || isPdf(name, doc.uri)) {
    text = await readFileText(doc.uri, name.endsWith('.pdf') ? name : `${name}.pdf`);
    engine = 'pdf-text';
    sourceKind = 'pdf';
    if (text.trim().length < 40) {
      return {
        ...parseInvoiceFromText(text, { ocrEngine: engine, sourceKind: 'pdf' }),
        warnings: [
          'PDF metni çıkarılamadı (taranmış olabilir). Fotoğraf olarak tekrar deneyin veya kalemleri elle girin.',
        ],
      };
    }
  } else if (kind === 'xml' || isXml(name)) {
    text = await readFileText(doc.uri, name);
    engine = 'xml';
    sourceKind = 'xml';
    if (looksLikeEInvoiceXml(text)) return { ...parseEInvoiceXml(text), sourceKind: 'xml' };
  } else if (kind === 'image' || isImageFile(name)) {
    const ocr = await ocrImageUri(doc.uri);
    text = ocr.text;
    engine = ocr.engine;
    sourceKind = 'image';
  } else {
    text = await readFileText(doc.uri, name);
    engine = 'file-text';
    if (looksLikeEInvoiceXml(text)) return { ...parseEInvoiceXml(text), sourceKind: 'xml' };
    sourceKind = 'text';
  }

  return parseInvoiceFromText(text, { ocrEngine: engine, sourceKind });
}

function mergeScans(scans: ParsedSupplierInvoice[], source: { uri: string; fileName: string | null; uris: string[] }): InvoiceScanResult {
  if (scans.length === 1) {
    return {
      ...scans[0],
      sourceUri: source.uri,
      sourceFileName: source.fileName,
      sourceUris: source.uris,
    };
  }

  const lineItems = scans.flatMap((s) => s.lineItems);
  const warnings = [...new Set(scans.flatMap((s) => s.warnings))];
  const rawText = scans.map((s) => s.rawText).join('\n---\n').slice(0, 24000);
  const grandTotals = scans.map((s) => s.grandTotal).filter((n): n is number => n != null);
  const grandTotal = grandTotals.length ? Math.max(...grandTotals) : null;

  let confidence: ParsedSupplierInvoice['confidence'] = 'low';
  if (lineItems.length >= 2 && grandTotal != null) confidence = 'high';
  else if (lineItems.length >= 1 || grandTotal != null) confidence = 'medium';

  const first = scans[0];
  return {
    rawText,
    ocrEngine: scans.map((s) => s.ocrEngine).filter(Boolean).join('+') || null,
    invoiceNo: scans.find((s) => s.invoiceNo)?.invoiceNo ?? first.invoiceNo,
    invoiceDate: scans.find((s) => s.invoiceDate)?.invoiceDate ?? first.invoiceDate,
    supplierName: scans.find((s) => s.supplierName)?.supplierName ?? first.supplierName,
    supplierTaxId: scans.find((s) => s.supplierTaxId)?.supplierTaxId ?? first.supplierTaxId,
    buyerName: scans.find((s) => s.buyerName)?.buyerName ?? first.buyerName,
    lineItems,
    subtotal: scans.find((s) => s.subtotal)?.subtotal ?? null,
    taxAmount: scans.find((s) => s.taxAmount)?.taxAmount ?? null,
    grandTotal,
    confidence,
    warnings: scans.length > 1 ? [`${scans.length} belge birleştirildi`, ...warnings] : warnings,
    sourceKind: 'mixed',
    sourceUri: source.uri,
    sourceFileName: source.fileName,
    sourceUris: source.uris,
  };
}

export async function scanInvoiceDocument(
  uri: string,
  fileName?: string | null
): Promise<InvoiceScanResult> {
  const name = fileName?.trim() || 'fatura';
  const scan = await scanSingleDocument({ uri, fileName: name });
  return mergeScans([scan], { uri, fileName: fileName ?? null, uris: [uri] });
}

export async function scanInvoiceDocuments(docs: PickedInvoiceDocument[]): Promise<InvoiceScanResult> {
  if (!docs.length) throw new Error('Belge seçilmedi');
  const scans = await Promise.all(docs.map((d) => scanSingleDocument(d)));
  return mergeScans(scans, {
    uri: docs[0].uri,
    fileName: docs.length === 1 ? docs[0].fileName : `${docs.length} belge`,
    uris: docs.map((d) => d.uri),
  });
}
