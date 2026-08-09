/**
 * Tüm stok listesi PDF – HTML tablo + expo-print / web yazdır.
 */
import { Platform } from 'react-native';
import { printToLocalPdfFile } from '@/lib/persistExpoPrintPdf';
import * as Sharing from 'expo-sharing';

export type StockListPdfRow = {
  name: string;
  category: string | null;
  unit: string | null;
  current_stock: number;
  min_stock: number | null;
  lastMovementLine: string | null;
  critical: boolean;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatShortDateTime(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const h = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${day}.${month}.${d.getFullYear()} ${h}:${min}`;
}

export function buildStockListHtml(
  rows: StockListPdfRow[],
  meta: { filterLabel: string; searchHint: string; generatedAtLabel: string }
): string {
  const thead = `
    <thead>
      <tr>
        <th class="c-num">#</th>
        <th class="c-name">Ürün</th>
        <th class="c-cat">Kat.</th>
        <th class="c-qty">Mevc.</th>
        <th class="c-min">Min</th>
        <th class="c-last">Son işlem</th>
      </tr>
    </thead>`;
  const bodyRows = rows
    .map((r, i) => {
      const cat = r.category ? escapeHtml(r.category) : '—';
      const unit = r.unit ? escapeHtml(r.unit) : 'adet';
      const stockCell = `${r.current_stock} ${escapeHtml(unit)}${r.critical ? ' ⚠' : ''}`;
      const minCell = r.min_stock != null ? String(r.min_stock) : '—';
      const last = r.lastMovementLine ? escapeHtml(r.lastMovementLine) : '—';
      const rowClass = r.critical ? ' class="critical"' : '';
      return `<tr${rowClass}>
        <td class="c-num">${i + 1}</td>
        <td class="c-name">${escapeHtml(r.name)}</td>
        <td class="c-cat">${cat}</td>
        <td class="c-qty">${stockCell}</td>
        <td class="c-min">${minCell}</td>
        <td class="c-last">${last}</td>
      </tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: A4 landscape; margin: 6mm; }
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      margin: 0;
      padding: 4px 6px 8px;
      color: #1a202c;
      font-size: 8.5px;
      line-height: 1.25;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1 {
      font-size: 11px;
      margin: 0 0 3px;
      padding: 0;
      color: #1a365d;
      font-weight: 700;
    }
    .meta {
      color: #64748b;
      font-size: 7px;
      margin: 0 0 4px;
      line-height: 1.35;
      white-space: normal;
    }
    .meta span { margin-right: 10px; }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      border: 0.5px solid #cbd5e1;
      padding: 2px 4px;
      text-align: left;
      vertical-align: top;
      word-wrap: break-word;
      overflow-wrap: break-word;
      hyphens: auto;
    }
    th {
      background: #e2e8f0;
      font-weight: 700;
      font-size: 7px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      color: #334155;
      padding: 3px 4px;
    }
    .c-num { width: 3%; text-align: center; }
    .c-name { width: 26%; }
    .c-cat { width: 14%; }
    .c-qty { width: 10%; white-space: nowrap; }
    .c-min { width: 5%; text-align: center; }
    .c-last { width: 42%; font-size: 7px; line-height: 1.3; }
    tr.critical .c-qty { background: #fee2e2; font-weight: 700; }
    tr:nth-child(even) td { background: #f8fafc; }
  </style>
</head>
<body>
  <h1>Valoria Hotel – Stok listesi</h1>
  <div class="meta">
    <span>${escapeHtml(meta.generatedAtLabel)}</span>
    <span>Filtre: ${escapeHtml(meta.filterLabel)}</span>
    <span>Arama: ${escapeHtml(meta.searchHint)}</span>
    <span>${rows.length} satır</span>
  </div>
  <table>
    <colgroup>
      <col style="width:3%" /><col style="width:26%" /><col style="width:14%" /><col style="width:10%" /><col style="width:5%" /><col style="width:42%" />
    </colgroup>
    ${thead}
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`;
}

export function openStockListPrintWindow(html: string): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const w = window.open('', '_blank', 'noopener');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

/** A4 yatay (points @72dpi) – tablo daha geniş sığar */
export async function exportStockListPdf(html: string): Promise<string> {
  const { uri } = await printToLocalPdfFile({
    html,
    width: 842,
    height: 595,
    margins: { top: 14, bottom: 14, left: 12, right: 12 },
  });
  return uri;
}

export async function shareStockListPdf(html: string): Promise<void> {
  if (Platform.OS === 'web') {
    openStockListPrintWindow(html);
    return;
  }
  try {
    const uri = await exportStockListPdf(html);
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Stok listesi PDF' });
    } else {
      throw new Error(`PDF hazır: ${uri}`);
    }
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    if (msg.includes('PDF hazır')) {
      openStockListPrintWindow(html);
      return;
    }
    throw e;
  }
}

export { formatShortDateTime };
