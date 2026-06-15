import { Alert, Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { DepartmentRuleDetail } from './types';
import { departmentLabel, ruleTypeLabel } from './constants';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d.includes('T') ? d : `${d}T12:00:00`).toLocaleDateString('tr-TR');
  } catch {
    return d;
  }
}

function formatTime(t: string | null | undefined): string {
  if (!t) return '';
  return t.slice(0, 5);
}

function contentToHtml(content: string): string {
  const trimmed = (content ?? '').trim();
  if (!trimmed) return '<p class="muted">—</p>';
  if (trimmed.includes('<p>') || trimmed.includes('<div')) return trimmed;

  return escapeHtml(trimmed)
    .split('\n')
    .map((line) => {
      const l = line.trim();
      if (!l) return '<br/>';
      if (l.startsWith('## ')) return `<h2>${escapeHtml(l.slice(3))}</h2>`;
      if (l.startsWith('### ')) return `<h3>${escapeHtml(l.slice(4))}</h3>`;
      if (l.startsWith('> ')) return `<div class="warn">${escapeHtml(l.slice(2))}</div>`;
      if (l.startsWith('!!! ')) return `<div class="urgent">${escapeHtml(l.slice(4))}</div>`;
      if (/^\d+\.\s/.test(l)) return `<p class="num">${escapeHtml(l)}</p>`;
      if (l.startsWith('- ') || l.startsWith('• ')) return `<p class="bullet">${escapeHtml(l)}</p>`;
      if (l === '[imza]' || l === '[signature]') return '<div class="sig-box"><p>İmza / Onay</p></div>';
      return `<p>${escapeHtml(l)}</p>`;
    })
    .join('');
}

export function buildDepartmentRulePdfHtml(
  detail: DepartmentRuleDetail,
  orgName: string,
  verifyUrl?: string,
): string {
  const r = detail.rule;
  const creator = r.creator?.full_name ?? '—';
  const qrData = encodeURIComponent(verifyUrl ?? `VALORIA-RULE:${r.verification_token}`);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${qrData}`;

  const validity = r.is_permanent
    ? 'Süresiz geçerli'
    : `${formatDate(r.start_date)} — ${formatDate(r.end_date)}`;

  const timeRange =
    r.start_time || r.end_time ? `${formatTime(r.start_time) || '—'} - ${formatTime(r.end_time) || '—'}` : '';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(r.document_number)} — ${escapeHtml(r.title)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm 16mm 16mm 16mm; }
    body { font-family: Georgia, serif; font-size: 10.5pt; line-height: 1.45; color: #111827; margin: 0; }
    .header { text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 16px; }
    .org { font-size: 11pt; letter-spacing: 0.12em; color: #0f766e; font-weight: 700; }
    .title { font-size: 14pt; font-weight: 700; margin: 8px 0 4px; }
    .meta { font-size: 9pt; color: #64748b; }
    .grid { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 16px 0; font-size: 9.5pt; }
    .grid div { min-width: 40%; }
    .label { color: #64748b; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.05em; }
    .body { margin-top: 16px; }
    h2 { font-size: 12pt; margin: 12px 0 6px; }
    h3 { font-size: 11pt; margin: 10px 0 4px; }
    .warn { background: #fef3c7; border-left: 4px solid #d97706; padding: 8px 12px; margin: 8px 0; }
    .urgent { background: #fee2e2; border-left: 4px solid #dc2626; padding: 8px 12px; margin: 8px 0; font-weight: 600; }
    .sig-box { border: 1px dashed #94a3b8; height: 64px; margin: 24px 0; padding: 8px; color: #64748b; }
    .footer { margin-top: 32px; display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #e2e8f0; padding-top: 12px; }
    .qr img { width: 72px; height: 72px; }
    .muted { color: #94a3b8; }
    .num, .bullet { margin: 4px 0; padding-left: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="org">${escapeHtml(orgName.toUpperCase())}</div>
    <div class="title">Bölüm Kuralları Belgesi</div>
    <div class="meta">${escapeHtml(r.title)}</div>
  </div>
  <div class="grid">
    <div><div class="label">Belge No</div><strong>${escapeHtml(r.document_number)}</strong></div>
    <div><div class="label">Versiyon</div>V${r.version}</div>
    <div><div class="label">Oluşturma</div>${formatDate(r.created_at)}</div>
    <div><div class="label">Geçerlilik</div>${validity}</div>
    ${timeRange ? `<div><div class="label">Saat</div>${timeRange}</div>` : ''}
    <div><div class="label">Departman</div>${escapeHtml(departmentLabel(r.department))}</div>
    <div><div class="label">Tür</div>${escapeHtml(ruleTypeLabel(r.rule_type))}</div>
    <div><div class="label">Hazırlayan</div>${escapeHtml(creator)}</div>
  </div>
  <div class="body">${contentToHtml(r.content)}</div>
  <div class="footer">
    <div>
      <div class="label">Personel imza / onay alanı</div>
      <div class="sig-box"></div>
    </div>
    <div class="qr">
      <img src="${qrUrl}" alt="QR"/>
      <div class="muted" style="font-size:7pt;margin-top:4px;">Doğrulama kodu</div>
    </div>
  </div>
</body>
</html>`;
}

export async function printDepartmentRulePdf(html: string, dialogTitle = 'Bölüm Kuralı PDF'): Promise<void> {
  try {
    const { uri } = await Print.printToFileAsync({ html });
    if (Platform.OS === 'web') {
      await Print.printAsync({ html });
      return;
    }
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle });
    } else {
      await Print.printAsync({ uri });
    }
  } catch (e) {
    Alert.alert('PDF hatası', e instanceof Error ? e.message : 'PDF oluşturulamadı');
  }
}

export function buildRulePreviewHtml(detail: DepartmentRuleDetail, orgName: string): string {
  return buildDepartmentRulePdfHtml(detail, orgName);
}
