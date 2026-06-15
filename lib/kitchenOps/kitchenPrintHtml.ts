/**
 * Valoria Hotel — Mutfak yazdırma / PDF HTML şablonu
 */
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export const KITCHEN_PRINT_HOTEL = 'Valoria Hotel';
export const KITCHEN_PRINT_DEPT = 'Mutfak Operasyon';

export type KitchenPrintColumn = { key: string; label: string; width?: string; align?: 'left' | 'center' | 'right' };

export type KitchenPrintRow = Record<string, string | number | null | undefined> & {
  /** Satır arka planı (örn. row-low, row-empty) */
  __rowClass?: string;
};

export type KitchenPrintMeta = { label: string; value: string }[];

export type KitchenPrintInput = {
  /** Örn. Stok listesi, Cari borç listesi */
  reportTitle: string;
  subtitle?: string;
  meta?: KitchenPrintMeta;
  columns: KitchenPrintColumn[];
  rows: KitchenPrintRow[];
  summary?: KitchenPrintMeta;
  landscape?: boolean;
  emptyMessage?: string;
  /** PDF üst bilgi — varsayılan: Mutfak Operasyon */
  brandDepartment?: string;
  /** PDF alt bilgi etiketi — varsayılan: Mutfak */
  footerTag?: string;
};

export function escapeKitchenHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cellValue(row: KitchenPrintRow, key: string): string {
  const v = row[key];
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

export function buildKitchenPrintHtml(input: KitchenPrintInput): string {
  const cols = input.columns;
  const colgroup = cols.map((c) => `<col style="width:${c.width ?? `${Math.floor(100 / cols.length)}%`}" />`).join('');
  const thead = `<thead><tr>${cols.map((c) => `<th class="col-${c.key}" style="text-align:${c.align ?? 'left'}">${escapeKitchenHtml(c.label)}</th>`).join('')}</tr></thead>`;

  const body =
    input.rows.length === 0
      ? `<tr><td colspan="${cols.length}" class="empty">${escapeKitchenHtml(input.emptyMessage ?? 'Kayıt bulunamadı.')}</td></tr>`
      : input.rows
          .map((row) => {
            const rowClass = row.__rowClass ? String(row.__rowClass) : '';
            const cells = cols
              .map(
                (c) =>
                  `<td class="col-${c.key}" style="text-align:${c.align ?? 'left'}">${escapeKitchenHtml(cellValue(row, c.key))}</td>`
              )
              .join('');
            return `<tr${rowClass ? ` class="${escapeKitchenHtml(rowClass)}"` : ''}>${cells}</tr>`;
          })
          .join('');

  const metaHtml = (input.meta ?? [])
    .map((m) => `<span><strong>${escapeKitchenHtml(m.label)}:</strong> ${escapeKitchenHtml(m.value)}</span>`)
    .join('');

  const summaryHtml = (input.summary ?? [])
    .map(
      (m) =>
        `<div class="summary-item"><span class="summary-label">${escapeKitchenHtml(m.label)}</span><span class="summary-value">${escapeKitchenHtml(m.value)}</span></div>`
    )
    .join('');

  const pageSize = input.landscape ? 'A4 landscape' : 'A4 portrait';
  const dept = input.brandDepartment ?? KITCHEN_PRINT_DEPT;
  const footerTag = input.footerTag ?? 'Mutfak';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${escapeKitchenHtml(KITCHEN_PRINT_HOTEL)} — ${escapeKitchenHtml(input.reportTitle)}</title>
  <style>
    @page { size: ${pageSize}; margin: 8mm; }
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 6px 8px 10px;
      color: #1a202c;
      font-size: 9px;
      line-height: 1.3;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .brand { border-bottom: 2px solid #0d9488; padding-bottom: 6px; margin-bottom: 8px; }
    .hotel { font-size: 14px; font-weight: 900; color: #0f766e; margin: 0; letter-spacing: -0.02em; }
    .dept { font-size: 10px; font-weight: 700; color: #334155; margin: 2px 0 0; }
    .report-title { font-size: 12px; font-weight: 800; color: #1e293b; margin: 6px 0 2px; }
    .subtitle { font-size: 9px; color: #64748b; margin: 0 0 6px; }
    .meta { color: #64748b; font-size: 8px; margin-bottom: 8px; line-height: 1.5; }
    .meta span { margin-right: 12px; display: inline-block; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 0.5px solid #cbd5e1; padding: 3px 5px; vertical-align: top; word-wrap: break-word; overflow-wrap: anywhere; }
    th { background: #ccfbf1; font-weight: 800; font-size: 7.5px; text-transform: uppercase; color: #134e4a; }
    tr:nth-child(even) td { background: #f8fafc; }
    tr.row-low td { background: #fef2f2 !important; color: #b91c1c; font-weight: 700; }
    tr.row-empty td { background: #fee2e2 !important; color: #7f1d1d; font-weight: 800; }
    tr.row-low th, tr.row-empty th { background: #fecaca; }
    .empty { text-align: center; color: #94a3b8; font-style: italic; padding: 16px; }
    .summary { margin-top: 10px; padding-top: 8px; border-top: 1px solid #cbd5e1; display: flex; flex-wrap: wrap; gap: 8px 16px; }
    .summary-item { min-width: 120px; }
    .summary-label { display: block; font-size: 7px; color: #64748b; text-transform: uppercase; font-weight: 700; }
    .summary-value { display: block; font-size: 11px; font-weight: 800; color: #0f766e; margin-top: 2px; }
    .footer { margin-top: 10px; font-size: 7px; color: #94a3b8; text-align: right; }
  </style>
</head>
<body>
  <div class="brand">
    <h1 class="hotel">${escapeKitchenHtml(KITCHEN_PRINT_HOTEL)}</h1>
    <p class="dept">${escapeKitchenHtml(dept)}</p>
  </div>
  <h2 class="report-title">${escapeKitchenHtml(input.reportTitle)}</h2>
  ${input.subtitle ? `<p class="subtitle">${escapeKitchenHtml(input.subtitle)}</p>` : ''}
  ${metaHtml ? `<div class="meta">${metaHtml}</div>` : ''}
  <table>
    <colgroup>${colgroup}</colgroup>
    ${thead}
    <tbody>${body}</tbody>
  </table>
  ${summaryHtml ? `<div class="summary">${summaryHtml}</div>` : ''}
  <div class="footer">${escapeKitchenHtml(KITCHEN_PRINT_HOTEL)} · ${escapeKitchenHtml(footerTag)} · ${input.rows.length} kayıt</div>
</body>
</html>`;
}

export function openKitchenPrintWindow(html: string): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const w = window.open('', '_blank', 'noopener');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
}

export async function kitchenHtmlToPdfUri(html: string, landscape = false): Promise<string> {
  const { uri } = await Print.printToFileAsync({
    html,
    width: landscape ? 842 : 595,
    height: landscape ? 595 : 842,
    margins: { top: 14, bottom: 14, left: 12, right: 12 },
  });
  return uri;
}

export async function shareKitchenPdf(html: string, fileName: string): Promise<void> {
  if (Platform.OS === 'web') {
    openKitchenPrintWindow(html);
    return;
  }
  const uri = await kitchenHtmlToPdfUri(html, html.includes('A4 landscape'));
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: fileName });
  } else {
    throw new Error('Paylaşım bu cihazda kullanılamıyor.');
  }
}

export async function printKitchenDocument(html: string, pdfUri?: string): Promise<void> {
  const uri = pdfUri ?? (await kitchenHtmlToPdfUri(html));
  await Print.printAsync({ uri });
}
