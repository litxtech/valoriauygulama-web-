import { Alert, Platform } from 'react-native';
import { sendPdfToPrinterEmail } from '@/lib/printerEmail';
import {
  buildKitchenPrintReport,
  type KitchenPrintPayload,
  type KitchenPrintReportKind,
} from './kitchenPrintReports';
import {
  kitchenHtmlToPdfUri,
  openKitchenPrintWindow,
  printKitchenDocument,
  shareKitchenPdf,
} from './kitchenPrintHtml';

async function resolvePayload(kind: KitchenPrintReportKind): Promise<KitchenPrintPayload> {
  return buildKitchenPrintReport(kind);
}

export async function downloadKitchenReportPdf(kind: KitchenPrintReportKind): Promise<void> {
  const payload = await resolvePayload(kind);
  if (Platform.OS === 'web') {
    openKitchenPrintWindow(payload.html);
    return;
  }
  await shareKitchenPdf(payload.html, payload.fileName);
}

export async function printKitchenReport(kind: KitchenPrintReportKind): Promise<void> {
  const payload = await resolvePayload(kind);
  if (Platform.OS === 'web') {
    openKitchenPrintWindow(payload.html);
    return;
  }
  const uri = await kitchenHtmlToPdfUri(payload.html, payload.landscape);
  await printKitchenDocument(payload.html, uri);
}

export async function emailKitchenReportToPrinter(kind: KitchenPrintReportKind): Promise<void> {
  const payload = await resolvePayload(kind);
  const uri = await kitchenHtmlToPdfUri(payload.html, payload.landscape);
  await sendPdfToPrinterEmail({
    pdfUri: uri,
    subject: payload.subject,
    fileName: payload.fileName,
  });
}

export async function runKitchenPrintAction(
  kind: KitchenPrintReportKind,
  action: 'pdf' | 'print' | 'email'
): Promise<void> {
  if (action === 'pdf') await downloadKitchenReportPdf(kind);
  else if (action === 'print') await printKitchenReport(kind);
  else await emailKitchenReportToPrinter(kind);
}

export function kitchenPrintErrorMessage(e: unknown): string {
  return (e as Error)?.message ?? 'İşlem tamamlanamadı.';
}

export function alertKitchenPrintError(e: unknown): void {
  Alert.alert('Yazdırma', kitchenPrintErrorMessage(e));
}
