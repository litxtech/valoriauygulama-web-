import type { KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';
import { displayCapturedName } from '@/lib/kbsCaptureHistory';
import {
  buildKbsReportFields,
  normalizeKbsParsedPayload,
} from '@/lib/kbsCaptureParsedFields';
import { buildKbsCaptureImageDataUriMap } from '@/lib/kbsCaptureReportImages';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fieldsTableHtml(fields: { label: string; value: string }[]): string {
  const rows = fields
    .map((f) => `<tr><td>${esc(f.label)}</td><td>${esc(f.value)}</td></tr>`)
    .join('');
  return `<table class="fields-table">${rows}</table>`;
}

function imageBlock(
  row: KbsCapturedDocumentRow,
  includeImages: boolean,
  imageMap: Map<string, string>
): string {
  if (!includeImages || !row.front_image_url) return '';
  const dataUri = imageMap.get(row.id);
  if (!dataUri) {
    return `<p class="img-fail">Kimlik görseli PDF'e eklenemedi.</p>`;
  }
  const room = esc(row.room_number?.trim() || '—');
  return `<div class="img-wrap">
    <div class="img-room">Oda ${room}</div>
    <img src="${dataUri}" alt="kimlik" />
  </div>`;
}

const SINGLE_PAGE_STYLES = `
@page { size: A4 portrait; margin: 10mm; }
html, body { margin: 0; padding: 0; color: #111; font-family: system-ui, sans-serif; }
.sheet { width: 100%; box-sizing: border-box; padding: 4px; }
.head { margin-bottom: 10px; page-break-inside: avoid; break-inside: avoid; }
.head h1 { font-size: 17px; margin: 0 0 4px; font-weight: 800; }
.head-meta { font-size: 11px; color: #64748b; }
.img-wrap { margin: 0 0 12px; text-align: center; page-break-inside: avoid; break-inside: avoid; }
.img-room {
  display: inline-block; margin-bottom: 6px; padding: 4px 10px; border-radius: 6px;
  background: #0d9488; color: #fff; font-size: 12px; font-weight: 800;
}
.img-wrap img {
  width: 100%; max-height: 280px; object-fit: contain;
  border-radius: 6px; border: 1px solid #e2e8f0;
}
.section-title {
  font-size: 14px; font-weight: 800; color: #0f172a;
  margin: 0 0 8px; padding-bottom: 6px; border-bottom: 2px solid #0d9488;
  page-break-after: avoid; break-after: avoid;
}
.identity-block { page-break-inside: avoid; break-inside: avoid; margin-bottom: 12px; }
.fields-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.fields-table td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; line-height: 1.4; }
.fields-table td:first-child { font-weight: 700; width: 38%; color: #475569; white-space: nowrap; }
.fields-table td:last-child { color: #0f172a; font-weight: 600; }
.fields-table tr { page-break-inside: avoid; break-inside: avoid; }
.img-fail { color: #b45309; font-size: 11px; font-weight: 600; }
`;

function buildSinglePageHtml(
  row: KbsCapturedDocumentRow,
  includeImage: boolean,
  imageMap: Map<string, string>
): string {
  const parsed = normalizeKbsParsedPayload(row.parsed_payload);
  const fields = buildKbsReportFields(row, parsed);
  const img = imageBlock(row, includeImage, imageMap);
  const headline = esc(displayCapturedName(row));
  const capturedAt = new Date(row.captured_at ?? row.created_at).toLocaleString('tr-TR');
  const capturer = row.captured_by_staff_name?.trim() || (row.scanned_by_user_id ? 'Personel' : '');
  const capturerLine = capturer
    ? `<div class="head-meta">Yükleyen: ${esc(capturer)}</div>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>${SINGLE_PAGE_STYLES}</style></head><body>
<div class="sheet">
  <div class="head">
    <h1>${headline}</h1>
    <div class="head-meta">${esc(capturedAt)}</div>
    ${capturerLine}
  </div>
  ${img}
  <div class="identity-block">
    <h2 class="section-title">Kimlik bilgileri</h2>
    ${fieldsTableHtml(fields)}
  </div>
</div>
</body></html>`;
}

function buildCardsHtml(
  rows: KbsCapturedDocumentRow[],
  includeImages: boolean,
  imageMap: Map<string, string>
): string {
  return rows
    .map((r) => {
      const parsed = normalizeKbsParsedPayload(r.parsed_payload);
      const fields = fieldsTableHtml(buildKbsReportFields(r, parsed));
      const img = imageBlock(r, includeImages, imageMap);
      const headline = esc(displayCapturedName(r));
      const capturer = r.captured_by_staff_name?.trim() || (r.scanned_by_user_id ? 'Personel' : '');
      const capturerHtml = capturer
        ? `<p class="card-meta">Yükleyen: ${esc(capturer)}</p>`
        : '';
      return `<section class="card"><h2>${headline}</h2>${capturerHtml}${img}<h3 class="section-title">Kimlik bilgileri</h3>${fields}</section>`;
    })
    .join('');
}

/** Tek kimlik — tek A4 sayfa (yazdır / PDF / WhatsApp). */
export async function buildKbsCaptureSingleReportHtml(
  row: KbsCapturedDocumentRow,
  includeImage: boolean
): Promise<string> {
  const imageMap = await buildKbsCaptureImageDataUriMap([row], includeImage, { singlePage: true });
  return buildSinglePageHtml(row, includeImage, imageMap);
}

/** Çoklu kimlik listesi raporu. */
export async function buildKbsCaptureReportHtml(
  title: string,
  rows: KbsCapturedDocumentRow[],
  includeImages: boolean
): Promise<string> {
  if (rows.length === 1) {
    return buildKbsCaptureSingleReportHtml(rows[0]!, includeImages);
  }

  const imageMap = await buildKbsCaptureImageDataUriMap(rows, includeImages);
  const cards = buildCardsHtml(rows, includeImages, imageMap);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
@page { size: A4 portrait; margin: 10mm; }
body{font-family:system-ui,sans-serif;padding:8px;color:#111;margin:0}
h1{font-size:16px;margin:0 0 6px}
h2{font-size:14px;margin:0 0 8px;font-weight:800}
.card{page-break-inside:avoid;margin-bottom:16px;border:1px solid #ddd;border-radius:8px;padding:10px}
.card-meta{font-size:12px;color:#0f766e;font-weight:700;margin:0 0 8px}
.section-title{
  font-size:13px;font-weight:800;color:#0f172a;margin:10px 0 8px;
  padding-bottom:6px;border-bottom:2px solid #0d9488;
}
.img-wrap{margin-bottom:8px;text-align:center;page-break-inside:avoid}
.img-room{
  display:inline-block;margin-bottom:4px;padding:4px 10px;border-radius:6px;
  background:#0d9488;color:#fff;font-size:12px;font-weight:800
}
img{max-width:100%;max-height:320px;object-fit:contain;border-radius:6px;border:1px solid #e2e8f0}
.img-fail{color:#b45309;font-size:11px;font-weight:600;margin-bottom:6px}
.fields-table{width:100%;border-collapse:collapse;font-size:11.5px}
.fields-table td{padding:6px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top;line-height:1.4}
.fields-table td:first-child{font-weight:700;width:38%;color:#475569}
.fields-table tr{page-break-inside:avoid;break-inside:avoid}
</style></head><body>
<h1>${esc(title)}</h1>
<p style="color:#666;font-size:11px;margin:0 0 10px">${rows.length} kayıt · ${new Date().toLocaleString('tr-TR')}</p>
${cards || '<p>Kayıt yok.</p>'}
</body></html>`;
}
