import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { auditScoreLabel } from '@/lib/audit';
import { monthLabelTr } from '@/lib/financeLedger';
import type { MonthlyReportData } from '@/lib/performanceDashboard';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildAuditMonthlyReportHtml(data: MonthlyReportData): string {
  const ym = data.month_key;
  const depts = data.leaderboard?.departments ?? [];
  const sessions = data.sessions ?? [];
  const below = data.below_threshold_staff ?? [];

  const deptRows = depts
    .map(
      (d) =>
        `<tr><td>${d.rank}</td><td>${esc(d.name)}</td><td>${d.avg_score != null ? auditScoreLabel(d.avg_score) : '—'}</td><td>${d.audit_count}</td></tr>`
    )
    .join('');

  const sessionRows = sessions
    .map((s) => {
      const dt = new Date(s.conducted_at).toLocaleString('tr-TR');
      return `<tr><td>${esc(s.category_name)}</td><td>${dt}</td><td>${auditScoreLabel(s.session_score)}</td><td>${esc(s.auditor_name ?? '—')}</td></tr>`;
    })
    .join('');

  const belowRows = below
    .map(
      (s) =>
        `<tr><td>${esc(s.full_name ?? '—')}</td><td>${auditScoreLabel(s.evaluation_combined)}</td><td>${s.evaluation_audit != null ? auditScoreLabel(s.evaluation_audit) : '—'}</td><td>${s.evaluation_management != null ? auditScoreLabel(s.evaluation_management) : '—'}</td></tr>`
    )
    .join('');

  const belowWarn = below.length
    ? `<p class="warn">${below.length} personel esik altinda; calisma iliskisi degerlendirmesi gerekebilir.</p>`
    : '<p>Esik altinda personel yok.</p>';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    body{font-family:system-ui,-apple-system,sans-serif;padding:28px;color:#0f172a;line-height:1.45}
    h1{font-size:22px;margin:0 0 6px} h2{font-size:15px;margin:28px 0 10px;color:#334155}
    .meta{color:#64748b;font-size:13px;margin-bottom:24px}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}
    th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left}
    th{background:#f8fafc;font-weight:700}
    .warn{background:#fef2f2;color:#991b1b;padding:12px;border-radius:8px;font-size:13px}
  </style></head><body>
  <h1>${esc(data.organization_name ?? 'Isletme')} — Denetim ve Performans Raporu</h1>
  <p class="meta">${esc(monthLabelTr(ym))} · Olusturulma: ${new Date(data.generated_at).toLocaleString('tr-TR')}</p>
  <h2>Bolum siralamasi</h2>
  <table><tr><th>#</th><th>Bolum</th><th>Ortalama</th><th>Denetim</th></tr>${deptRows || '<tr><td colspan="4">Kayit yok</td></tr>'}</table>
  <h2>Denetim oturumlari</h2>
  <table><tr><th>Bolum</th><th>Tarih</th><th>Skor</th><th>Denetci</th></tr>${sessionRows || '<tr><td colspan="4">Kayit yok</td></tr>'}</table>
  <h2>70 alti personel (birlesik skor)</h2>
  ${belowWarn}
  <table><tr><th>Personel</th><th>Birlesik</th><th>Denetim</th><th>Yonetim</th></tr>${belowRows || '<tr><td colspan="4">—</td></tr>'}</table>
  </body></html>`;
}

export async function exportAuditMonthlyReportPdf(data: MonthlyReportData): Promise<string> {
  const html = buildAuditMonthlyReportHtml(data);
  const { uri } = await Print.printToFileAsync({ html });
  if (Platform.OS !== 'web' && (await Sharing.isAvailableAsync())) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Denetim raporu ${data.month_key}`,
    });
  }
  return uri;
}
