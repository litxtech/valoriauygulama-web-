/**
 * Temizlik listesi PDF (günlük / aylık).
 */
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { HousekeepingStatus } from '@/lib/roomHousekeeping';
import { formatHkDateTime } from '@/lib/roomHousekeeping';

export type HousekeepingPdfRow = {
  room_number: string;
  status: HousekeepingStatus;
  is_priority: boolean;
  note: string | null;
  scheduled_by_name: string | null;
  started_by_name: string | null;
  completed_by_name: string | null;
  started_at: string | null;
  completed_at: string | null;
  target_date: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusTr(status: HousekeepingStatus): string {
  switch (status) {
    case 'dirty':
      return 'Kirli';
    case 'cleaning':
      return 'Temizleniyor';
    case 'clean':
      return 'Temiz';
    default:
      return status;
  }
}

export function buildHousekeepingListHtml(
  rows: HousekeepingPdfRow[],
  meta: {
    title: string;
    subtitle: string;
    generatedAtLabel: string;
  }
): string {
  const body = rows
    .map((r, i) => {
      const pri = r.is_priority ? ' ★' : '';
      const who = r.completed_by_name || r.started_by_name || r.scheduled_by_name || '—';
      const when = formatHkDateTime(r.completed_at || r.started_at);
      return `<tr class="${r.status}">
        <td>${i + 1}</td>
        <td><strong>${escapeHtml(r.room_number)}${pri}</strong></td>
        <td>${escapeHtml(r.target_date)}</td>
        <td>${statusTr(r.status)}</td>
        <td>${escapeHtml(who)}</td>
        <td>${escapeHtml(when)}</td>
        <td>${escapeHtml(r.note || '—')}</td>
      </tr>`;
    })
    .join('\n');

  const dirty = rows.filter((r) => r.status === 'dirty').length;
  const cleaning = rows.filter((r) => r.status === 'cleaning').length;
  const clean = rows.filter((r) => r.status === 'clean').length;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; font-size: 11px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: #64748b; margin-bottom: 12px; }
  .stats { margin-bottom: 12px; }
  .stats span { display: inline-block; margin-right: 12px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
  th { background: #0f766e; color: #fff; }
  tr.dirty td { background: #fef2f2; }
  tr.cleaning td { background: #fff7ed; }
  tr.clean td { background: #f0fdf4; }
  .foot { margin-top: 10px; color: #94a3b8; font-size: 10px; }
</style></head><body>
  <h1>${escapeHtml(meta.title)}</h1>
  <div class="sub">${escapeHtml(meta.subtitle)}</div>
  <div class="stats">
    <span style="color:#dc2626">Kirli: ${dirty}</span>
    <span style="color:#ea580c">Temizleniyor: ${cleaning}</span>
    <span style="color:#16a34a">Temiz: ${clean}</span>
    <span>Toplam: ${rows.length}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Oda</th><th>Tarih</th><th>Durum</th><th>Personel</th><th>Zaman</th><th>Not</th>
      </tr>
    </thead>
    <tbody>${body || '<tr><td colspan="7">Kayıt yok</td></tr>'}</tbody>
  </table>
  <div class="foot">${escapeHtml(meta.generatedAtLabel)}</div>
</body></html>`;
}

export async function shareHousekeepingPdf(html: string, fileName: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: fileName,
      UTI: 'com.adobe.pdf',
    });
  } else {
    await Print.printAsync({ uri });
  }
}
