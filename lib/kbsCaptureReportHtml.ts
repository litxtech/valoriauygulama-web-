import type { KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';
import { displayCapturedName } from '@/lib/kbsCaptureHistory';
import { formatKbsNationality, formatKbsTrDate, kbsDisplayFullName } from '@/lib/kbsDisplayFormat';
import type { ParsedDocument } from '@/lib/scanner/types';
import { listMissingIdFields } from '@/lib/kbsCaptureParsedFields';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function asParsed(row: KbsCapturedDocumentRow): ParsedDocument | null {
  const p = row.parsed_payload;
  if (!p || typeof p !== 'object') return null;
  return p as ParsedDocument;
}

function rowFields(row: KbsCapturedDocumentRow): { label: string; value: string }[] {
  const p = asParsed(row);
  const missing = p ? listMissingIdFields(p) : [];
  return [
    { label: 'Oda', value: row.room_number ?? '—' },
    { label: 'Soyad', value: p?.lastName ?? '—' },
    { label: 'Ad', value: p?.firstName ?? '—' },
    { label: 'Tam ad', value: (p && kbsDisplayFullName(p)) ?? '—' },
    { label: 'Belge no', value: p?.documentNumber ?? '—' },
    { label: 'Seri no', value: p?.documentSeries ?? '—' },
    { label: 'Doğum tarihi', value: formatKbsTrDate(p?.birthDate) ?? '—' },
    { label: 'Uyruk', value: formatKbsNationality(p?.nationalityCode) ?? '—' },
    { label: 'Son kullanım tarihi', value: formatKbsTrDate(p?.expiryDate) ?? '—' },
    { label: 'Cinsiyet', value: p?.gender ?? '—' },
    { label: 'Anne adı', value: p?.motherName ?? '—' },
    { label: 'Baba adı', value: p?.fatherName ?? '—' },
    { label: 'Kayıt', value: new Date(row.captured_at ?? row.created_at).toLocaleString('tr-TR') },
    ...(missing.length ? [{ label: 'Eksik alanlar', value: missing.join(', ') }] : []),
  ];
}

/** Tek kimlik detayı — yazdır / PDF. */
export function buildKbsCaptureSingleReportHtml(
  row: KbsCapturedDocumentRow,
  includeImage: boolean
): string {
  return buildKbsCaptureReportHtml('Kimlik bilgileri', [row], includeImage);
}

export function buildKbsCaptureReportHtml(
  title: string,
  rows: KbsCapturedDocumentRow[],
  includeImages: boolean
): string {
  const cards = rows
    .map((r) => {
      const fields = rowFields(r)
        .map((f) => `<tr><td>${esc(f.label)}</td><td>${esc(f.value)}</td></tr>`)
        .join('');
      const img =
        includeImages && r.front_image_url
          ? `<div class="img-wrap"><img src="${esc(r.front_image_url)}" alt="kimlik" /></div>`
          : '';
      const headline = esc(displayCapturedName(r));
      return `<section class="card"><h2>${headline}</h2>${img}<table>${fields}</table></section>`;
    })
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
body{font-family:system-ui,sans-serif;padding:12px;color:#111}
h1{font-size:18px;margin:0 0 8px}
h2{font-size:15px;margin:0 0 8px}
.card{page-break-inside:avoid;margin-bottom:20px;border:1px solid #ddd;border-radius:8px;padding:12px}
.img-wrap{margin-bottom:10px;text-align:center}
img{max-width:100%;max-height:420px;object-fit:contain;border-radius:6px}
table{width:100%;border-collapse:collapse;font-size:13px}
td{padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top}
td:first-child{font-weight:600;width:38%;color:#444}
</style></head><body>
<h1>${esc(title)}</h1>
<p style="color:#666;font-size:12px">${rows.length} kayıt · ${new Date().toLocaleString('tr-TR')}</p>
${cards || '<p>Kayıt yok.</p>'}
</body></html>`;
}
