import { Alert, Platform, TurboModuleRegistry } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatDateShort } from '@/lib/date';
import {
  CHECK_DIRECTION_LABELS,
  CHECK_STATUS_LABELS,
  fmtMoneyTry,
  type FinanceCheckDirection,
  type FinanceCheckStatus,
} from '@/lib/finance';
import { CHECK_DIR_META } from '@/lib/financeCheckTheme';
import { DEFAULT_FINANCE_DOCUMENT_BRAND } from '@/lib/financeReportBranding';
import { supabase } from '@/lib/supabase';

export type FinanceCheckPreviewData = {
  direction: FinanceCheckDirection;
  counterparty_name: string;
  amount: number;
  status: FinanceCheckStatus;
  check_number?: string | null;
  bank_name?: string | null;
  branch_name?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  purpose?: string | null;
  notes?: string | null;
  image_urls?: string[];
};

export type FinanceCheckPdfInput = FinanceCheckPreviewData & {
  id?: string;
  organizationName?: string;
};

const CHECK_PDF_CSS = `
  @page { size: A4 portrait; margin: 16mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; margin: 0; font-size: 11pt; line-height: 1.45; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #d97706; padding-bottom: 12px; margin-bottom: 16px; }
  .brand { font-size: 16pt; font-weight: 800; color: #92400e; }
  .brandSub { font-size: 9pt; color: #64748b; margin-top: 4px; font-weight: 600; }
  .headerMeta { text-align: right; font-size: 9pt; color: #64748b; line-height: 1.5; }
  .dirBadge { display: inline-block; padding: 5px 12px; border-radius: 20px; font-size: 9pt; font-weight: 800; margin-bottom: 10px; }
  .dirGiven { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
  .dirReceived { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
  .docTitle { font-size: 18pt; font-weight: 900; margin: 0 0 6px; color: #0f172a; }
  .docSub { font-size: 10pt; color: #64748b; margin: 0 0 16px; }
  .amountBox {
    border: 2px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin-bottom: 18px;
    display: flex; justify-content: space-between; align-items: center; background: #fffbeb;
  }
  .amountLbl { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
  .amountVal { font-size: 28pt; font-weight: 900; color: #0f172a; }
  .statusPill { font-size: 10pt; font-weight: 800; padding: 6px 12px; border-radius: 8px; background: #f1f5f9; color: #334155; }
  table.data { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  table.data th, table.data td { border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left; font-size: 10pt; vertical-align: top; }
  table.data th { background: #f8fafc; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; width: 32%; }
  .note { margin-top: 12px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; font-size: 10pt; white-space: pre-wrap; }
  .images { margin-top: 16px; page-break-inside: avoid; }
  .images img { max-width: 100%; max-height: 280px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 10px; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 8.5pt; color: #94a3b8; }
  .micr { font-family: monospace; font-size: 10pt; color: #64748b; margin-top: 16px; letter-spacing: 0.5px; }
`;

function esc(s: string | null | undefined): string {
  if (s == null || s === '') return '—';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function checkFileSlug(input: FinanceCheckPdfInput): string {
  const cp = input.counterparty_name.replace(/[^\w\u00C0-\u024F]+/gi, '-').slice(0, 24);
  return cp || 'cek';
}

export function buildFinanceCheckPdfHtml(input: FinanceCheckPdfInput): string {
  const brand = esc(input.organizationName || DEFAULT_FINANCE_DOCUMENT_BRAND);
  const dir = input.direction as FinanceCheckDirection;
  const dirMeta = CHECK_DIR_META[dir];
  const dirClass = dir === 'given' ? 'dirGiven' : 'dirReceived';
  const created = formatDateShort(new Date());
  const images = (input.image_urls ?? []).filter(Boolean);

  const rows = [
    ['Karşı taraf / Lehtar', esc(input.counterparty_name)],
    ['Durum', esc(CHECK_STATUS_LABELS[input.status as FinanceCheckStatus])],
    ['Düzenleme tarihi', input.issue_date ? esc(formatDateShort(input.issue_date)) : '—'],
    ['Vade tarihi', input.due_date ? esc(formatDateShort(input.due_date)) : '—'],
    ['Çek numarası', esc(input.check_number)],
    ['Banka', esc(input.bank_name)],
    ['Şube', esc(input.branch_name)],
    ['Amaç', esc(input.purpose)],
  ];

  const tableRows = rows
    .map(
      ([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`,
    )
    .join('');

  const notesBlock = input.notes?.trim()
    ? `<div class="note"><strong>Not</strong><br/>${esc(input.notes)}</div>`
    : '';

  const imagesBlock =
    images.length > 0
      ? `<div class="images"><strong>Çek görseli</strong>${images.map((u) => `<div><img src="${esc(u)}" alt="cek"/></div>`).join('')}</div>`
      : '';

  const micr = [
    input.check_number ? `№ ${esc(input.check_number)}` : null,
    input.due_date ? `Vade ${esc(formatDateShort(input.due_date))}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${CHECK_PDF_CSS}</style></head><body>
  <div class="header">
    <div>
      <div class="brand">${brand}</div>
      <div class="brandSub">Çek defteri kaydı</div>
    </div>
    <div class="headerMeta">
      <div>Oluşturma: ${esc(created)}</div>
      ${input.id ? `<div>Ref: ${esc(input.id.slice(0, 8))}</div>` : ''}
    </div>
  </div>
  <span class="dirBadge ${dirClass}">${esc(CHECK_DIRECTION_LABELS[dir])}</span>
  <h1 class="docTitle">Çek özeti</h1>
  <p class="docSub">${esc(dirMeta.label)} · ${esc(input.counterparty_name)}</p>
  <div class="amountBox">
    <div>
      <div class="amountLbl">Tutar</div>
      <div class="amountVal">${esc(fmtMoneyTry(Number(input.amount)))}</div>
    </div>
    <div class="statusPill">${esc(CHECK_STATUS_LABELS[input.status as FinanceCheckStatus])}</div>
  </div>
  <table class="data">${tableRows}</table>
  ${notesBlock}
  ${imagesBlock}
  ${micr ? `<div class="micr">${micr}</div>` : ''}
  <div class="footer">Bu belge bilgilendirme amaçlıdır. Resmi çek belgesi yerine geçmez.</div>
</body></html>`;
}

export function buildFinanceCheckShareCaption(input: FinanceCheckPdfInput): string {
  const parts = [
    CHECK_DIRECTION_LABELS[input.direction as FinanceCheckDirection],
    input.counterparty_name,
    fmtMoneyTry(Number(input.amount)),
    CHECK_STATUS_LABELS[input.status as FinanceCheckStatus],
  ];
  if (input.due_date) parts.push(`Vade ${formatDateShort(input.due_date)}`);
  return parts.join(' · ');
}

async function createFinanceCheckPdfFile(input: FinanceCheckPdfInput): Promise<{ uri: string; fileName: string; html: string }> {
  const html = buildFinanceCheckPdfHtml(input);
  const file = await Print.printToFileAsync({ html, base64: false });
  const uri = file?.uri;
  if (!uri) throw new Error('PDF oluşturulamadı');
  const fileName = `cek-${checkFileSlug(input)}${input.id ? `-${input.id.slice(0, 8)}` : ''}.pdf`;
  return { uri, fileName, html };
}

function ensureFileUri(uri: string): string {
  return uri.startsWith('file://') ? uri : `file://${uri}`;
}

async function trySharePdf(
  uri: string,
  caption: string,
  fileName: string,
  message?: string,
): Promise<boolean> {
  if (Platform.OS === 'web' || !TurboModuleRegistry.get('RNShare')) return false;
  try {
    const RNShare = require('react-native-share').default as {
      open: (options: Record<string, unknown>) => Promise<unknown>;
    };
    await RNShare.open({
      title: caption,
      subject: fileName,
      message: message ?? caption,
      url: ensureFileUri(uri),
      type: 'application/pdf',
      failOnCancel: false,
    });
    return true;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e ?? '');
    if (/cancel|did not share|User did not/i.test(msg)) return true;
    return false;
  }
}

export async function shareFinanceCheckPdf(input: FinanceCheckPdfInput): Promise<void> {
  const { uri, fileName } = await createFinanceCheckPdfFile(input);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Çek PDF',
      UTI: 'com.adobe.pdf',
    });
    return;
  }
  Alert.alert('PDF hazır', fileName);
}

export async function shareFinanceCheck(input: FinanceCheckPdfInput): Promise<void> {
  const caption = buildFinanceCheckShareCaption(input);
  const { uri, fileName } = await createFinanceCheckPdfFile(input);
  if (await trySharePdf(uri, caption, fileName, `${caption}\n\nÇek PDF eki.`)) return;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Çek paylaş',
      UTI: 'com.adobe.pdf',
    });
    return;
  }
  Alert.alert('Paylaşım', caption);
}

export async function printFinanceCheck(input: FinanceCheckPdfInput): Promise<void> {
  const { html, uri } = await createFinanceCheckPdfFile(input);
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
  } else {
    await Print.printAsync({ uri });
  }
}

export async function loadFinanceCheckPdfInput(checkId: string): Promise<FinanceCheckPdfInput | null> {
  const { data, error } = await supabase
    .from('finance_checks')
    .select('*, organizations(name)')
    .eq('id', checkId)
    .single();
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  const org = r.organizations as { name?: string } | null;
  return {
    id: String(r.id),
    direction: r.direction as FinanceCheckDirection,
    counterparty_name: String(r.counterparty_name ?? ''),
    amount: Number(r.amount),
    status: r.status as FinanceCheckStatus,
    check_number: (r.check_number as string | null) ?? null,
    bank_name: (r.bank_name as string | null) ?? null,
    branch_name: (r.branch_name as string | null) ?? null,
    issue_date: (r.issue_date as string | null) ?? null,
    due_date: (r.due_date as string | null) ?? null,
    purpose: (r.purpose as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    image_urls: Array.isArray(r.image_urls) ? (r.image_urls as string[]) : [],
    organizationName: org?.name ?? undefined,
  };
}

export function financeCheckPdfInputFromPreview(
  data: FinanceCheckPreviewData,
  opts?: { id?: string; organizationName?: string },
): FinanceCheckPdfInput {
  return { ...data, id: opts?.id, organizationName: opts?.organizationName };
}
