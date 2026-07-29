import { parsePosReceiptFromText } from '@/lib/posReceiptInvoice/parsePosReceipt';
import { ocrPosReceiptImage } from '@/lib/posReceiptInvoice/ocrPosReceiptImage';
import type { ParsedPosReceipt } from '@/lib/posReceiptInvoice/types';
import type { PickedInvoiceDocument } from '@/lib/financeInvoiceDocumentPick';

function extensionFromName(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  if (i < 0) return '';
  return fileName.slice(i + 1).toLowerCase();
}

async function readFileText(uri: string, fileName: string): Promise<string> {
  const { readStatementFile } = await import('@/lib/bankStatement/readFile');
  const { text } = await readStatementFile(uri, fileName);
  return text;
}

async function scanOne(
  doc: PickedInvoiceDocument
): Promise<{ text: string; engine: string | null; sourceKind: ParsedPosReceipt['sourceKind'] }> {
  const name = doc.fileName?.trim() || 'fis.jpg';
  const ext = extensionFromName(name);
  const isPdf = ext === 'pdf' || doc.kind === 'pdf';
  const isXml = ext === 'xml' || doc.kind === 'xml';
  const isImage =
    doc.kind === 'image' ||
    !ext ||
    ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'].includes(ext);

  if (isPdf) {
    const text = await readFileText(doc.uri, name.endsWith('.pdf') ? name : `${name}.pdf`);
    return { text, engine: 'pdf-text', sourceKind: 'pdf' };
  }
  if (isXml) {
    const text = await readFileText(doc.uri, name);
    return { text, engine: 'xml', sourceKind: 'xml' };
  }
  if (isImage) {
    const ocr = await ocrPosReceiptImage(doc.uri);
    return { text: ocr.text, engine: ocr.engine, sourceKind: 'image' };
  }
  const text = await readFileText(doc.uri, name);
  return { text, engine: 'file-text', sourceKind: 'text' };
}

export async function scanPosReceiptFromDocument(
  doc: PickedInvoiceDocument
): Promise<ParsedPosReceipt & { sourceUri: string; sourceFileName: string }> {
  const raw = await scanOne(doc);
  const parsed = parsePosReceiptFromText(raw.text, {
    ocrEngine: raw.engine,
    sourceKind: raw.sourceKind,
  });
  return {
    ...parsed,
    sourceUri: doc.uri,
    sourceFileName: doc.fileName?.trim() || 'fis.jpg',
  };
}

export async function scanPosReceiptDocument(
  uri: string,
  fileName?: string | null
): Promise<ParsedPosReceipt & { sourceUri: string; sourceFileName: string | null }> {
  const doc: PickedInvoiceDocument = {
    uri,
    fileName: fileName?.trim() || 'fis.jpg',
    kind: 'image',
  };
  const raw = await scanOne(doc);
  const parsed = parsePosReceiptFromText(raw.text, {
    ocrEngine: raw.engine,
    sourceKind: raw.sourceKind,
  });
  return { ...parsed, sourceUri: uri, sourceFileName: fileName ?? null };
}

export async function scanPosReceiptDocuments(
  docs: PickedInvoiceDocument[]
): Promise<
  ParsedPosReceipt & { sourceUri: string; sourceFileName: string | null; sourceUris: string[] }
> {
  if (!docs.length) throw new Error('Belge seçilmedi');
  // Sayfalar sırayla — tek fişte genelde 1 sayfa; paralel bellek baskısı olmasın
  const parts: Awaited<ReturnType<typeof scanOne>>[] = [];
  for (const d of docs) {
    parts.push(await scanOne(d));
  }
  const text = parts.map((p) => p.text).filter(Boolean).join('\n');
  const engines = parts.map((p) => p.engine).filter(Boolean);
  const sourceKind = parts.length > 1 ? 'mixed' : parts[0].sourceKind;
  const parsed = parsePosReceiptFromText(text, {
    ocrEngine: engines.join('+') || null,
    sourceKind,
  });
  return {
    ...parsed,
    sourceUri: docs[0].uri,
    sourceFileName: docs.length === 1 ? docs[0].fileName : `${docs.length} belge`,
    sourceUris: docs.map((d) => d.uri),
  };
}
