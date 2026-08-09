/**
 * Karbon raporu: HTML → PDF (expo-print) ve CSV dışa aktarma.
 */
import { printToLocalPdfFile } from '@/lib/persistExpoPrintPdf';
import * as Sharing from 'expo-sharing';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { HMB_HOTEL_INFO } from '@/constants/hmbHotel';
import { DEFAULT_METHODOLOGY_SUMMARY, SCOPE3_SPEND_DISCLAIMER } from '@/lib/carbonConstants';
import type { Scope3SpendMonthRow } from '@/lib/carbonScope3Spend';

export type CarbonReportMonthRow = {
  month_start: string;
  electricity_kwh: number;
  water_m3: number;
  gas_m3: number;
  waste_kg: number;
  electricity_factor: number;
  water_factor: number;
  gas_factor: number;
  waste_factor: number;
  methodology_version?: string | null;
  methodology_summary?: string | null;
  electricity_factor_source?: string | null;
  water_factor_source?: string | null;
  gas_factor_source?: string | null;
  waste_factor_source?: string | null;
  data_collection_notes?: string | null;
  prepared_by_name?: string | null;
  verification_notes?: string | null;
};

export function hotelTotalKgCo2(row: CarbonReportMonthRow): number {
  return (
    Number(row.electricity_kwh || 0) * Number(row.electricity_factor || 0) +
    Number(row.water_m3 || 0) * Number(row.water_factor || 0) +
    Number(row.gas_m3 || 0) * Number(row.gas_factor || 0) +
    Number(row.waste_kg || 0) * Number(row.waste_factor || 0)
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(n: number, max = 2): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: max }).format(n);
}

function monthLabel(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'MMMM yyyy', { locale: tr });
  } catch {
    return dateStr;
  }
}

export function buildCarbonReportHtml(params: {
  rows: CarbonReportMonthRow[];
  yearLabel: string;
  occupancyByMonth: Record<string, number>;
  generatedAtIso: string;
  preparedByName: string;
  /** Ana tesis tablosundan ayrı; boş veya yoksa bölüm basılmaz. */
  scope3ByMonth?: Scope3SpendMonthRow[] | null;
}): string {
  const reportDate = format(new Date(params.generatedAtIso), "d MMMM yyyy HH:mm", { locale: tr });

  const tableRows = params.rows
    .map((r) => {
      const total = hotelTotalKgCo2(r);
      const occ = params.occupancyByMonth[r.month_start] ?? 0;
      const perNight = occ > 0 ? total / occ : 0;
      return `
    <tr>
      <td>${escapeHtml(monthLabel(r.month_start))}</td>
      <td>${fmt(r.electricity_kwh)}</td>
      <td>${fmt(r.water_m3)}</td>
      <td>${fmt(r.gas_m3)}</td>
      <td>${fmt(r.waste_kg)}</td>
      <td>${fmt(total, 1)}</td>
      <td>${fmt(occ, 1)}</td>
      <td>${occ > 0 ? fmt(perNight, 2) : '—'}</td>
    </tr>`;
    })
    .join('');

  const latestMethod = [...params.rows].sort((a, b) => b.month_start.localeCompare(a.month_start))[0];
  const methodology = latestMethod?.methodology_summary?.trim() || DEFAULT_METHODOLOGY_SUMMARY;

  const scope3 = params.scope3ByMonth?.filter((x) => x && x.month_start) ?? [];
  const scope3Table =
    scope3.length > 0
      ? `
  <h2 style="color:#92400e;">Scope 3 — harcama bazlı tahmin (ayrı blok)</h2>
  <p class="muted" style="border:1px solid #fcd34d;background:#fffbeb;padding:8px;border-radius:6px;">
    ${escapeHtml(SCOPE3_SPEND_DISCLAIMER)}
  </p>
  <table>
    <thead>
      <tr>
        <th>Ay</th>
        <th>Onaylı harcama (TRY)</th>
        <th>Onaylı maaş (TRY)</th>
        <th>Toplam TRY</th>
        <th>Çarpan (kg/TRY)</th>
        <th>Tahmini kg CO₂e</th>
      </tr>
    </thead>
    <tbody>
      ${scope3
        .map((s) => {
          return `
      <tr>
        <td>${escapeHtml(monthLabel(s.month_start))}</td>
        <td>${fmt(s.approved_expenses_try)}</td>
        <td>${fmt(s.approved_salary_try)}</td>
        <td>${fmt(s.total_try)}</td>
        <td>${fmt(s.factor_kg_co2e_per_try, 5)}</td>
        <td>${fmt(s.kg_co2e_estimate, 2)}</td>
      </tr>`;
        })
        .join('')}
    </tbody>
  </table>`
      : '';

  const factorAppendix = params.rows
    .map((r) => {
      const ml = monthLabel(r.month_start);
      return `
    <div style="margin-bottom:12px;padding:8px;border:1px solid #e2e8f0;border-radius:6px;">
      <p style="font-weight:700;margin:0 0 6px 0;">${escapeHtml(ml)} · sürüm ${escapeHtml(r.methodology_version?.trim() || '1.0')}</p>
      <p><strong>Elektrik k.</strong>: ${escapeHtml(r.electricity_factor_source?.trim() || '—')}</p>
      <p><strong>Su k.</strong>: ${escapeHtml(r.water_factor_source?.trim() || '—')}</p>
      <p><strong>Gaz k.</strong>: ${escapeHtml(r.gas_factor_source?.trim() || '—')}</p>
      <p><strong>Atık k.</strong>: ${escapeHtml(r.waste_factor_source?.trim() || '—')}</p>
      <p><strong>Veri toplama</strong>: ${escapeHtml(r.data_collection_notes?.trim() || '—')}</p>
      <p><strong>İç doğrulama</strong>: ${escapeHtml(r.verification_notes?.trim() || '—')}</p>
    </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; padding: 22px; color: #0f172a; font-size: 10.5px; line-height: 1.45; }
    h1 { font-size: 14px; margin: 0 0 6px 0; }
    h2 { font-size: 11px; margin: 16px 0 8px 0; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .muted { color: #64748b; font-size: 9.5px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #e2e8f0; padding: 5px 6px; text-align: left; }
    th { background: #f1f5f9; font-size: 9px; }
    .block { margin-bottom: 12px; }
    .footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #64748b; }
    .sig { margin-top: 28px; }
    .line { border-bottom: 1px solid #334155; width: 220px; margin-top: 36px; }
  </style>
</head>
<body>
  <h1>Tesis operasyonel karbon özeti (bilgilendirme)</h1>
  <p class="muted">Metodoloji sürümü (güncel ay): ${escapeHtml(latestMethod?.methodology_version?.trim() || '1.0')} · Dönem: ${escapeHtml(params.yearLabel)}</p>
  <p class="muted">Rapor üretim zamanı: ${escapeHtml(reportDate)}</p>

  <div class="block">
    <p><strong>İşletme</strong>: ${escapeHtml(HMB_HOTEL_INFO.title)}</p>
    <p><strong>Adres</strong>: ${escapeHtml(HMB_HOTEL_INFO.address)}</p>
    <p><strong>Vergi no</strong>: ${escapeHtml(HMB_HOTEL_INFO.taxNumber)}</p>
  </div>

  <h2>Aylık tüketim ve tahmini CO₂ (tesis toplamı)</h2>
  <table>
    <thead>
      <tr>
        <th>Ay</th>
        <th>Elektrik (kWh)</th>
        <th>Su (m³)</th>
        <th>Gaz (m³)</th>
        <th>Atık (kg)</th>
        <th>Toplam (kg CO₂)</th>
        <th>Konaklama gecesi</th>
        <th>kg CO₂ / gece</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows || '<tr><td colspan="8">Kayıt yok.</td></tr>'}
    </tbody>
  </table>

  ${scope3Table}

  <h2>Metodoloji özeti</h2>
  <div class="block">
    <p>${escapeHtml(methodology).replace(/\n/g, '<br/>')}</p>
  </div>

  <h2>Katsayı ve veri kaynakları (aylık)</h2>
  <div class="block">${factorAppendix || '<p>—</p>'}</div>

  <div class="footer">
    Bu belge otomatik üretilmiştir. Resmî mevzuat kapsamındaki beyanların yerine geçmez; iç kontrol ve denetim için kullanılmalıdır.
  </div>

  <div class="sig">
    <p><strong>Hazırlayan</strong>: ${escapeHtml(params.preparedByName || '—')}</p>
    <div class="line"></div>
    <p class="muted">Ad soyad / unvan / tarih</p>
  </div>
</body>
</html>`;
}

export async function shareCarbonPdf(html: string, fileBaseName: string): Promise<void> {
  const { uri } = await printToLocalPdfFile({ html, base64: false });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: fileBaseName,
      UTI: 'com.adobe.pdf',
    });
  }
}

export function buildCarbonReportCsv(params: {
  rows: CarbonReportMonthRow[];
  occupancyByMonth: Record<string, number>;
  scope3ByMonth?: Scope3SpendMonthRow[] | null;
}): string {
  const header =
    'Ay;Elektrik_kWh;Su_m3;Gaz_m3;Atik_kg;Elektrik_katsayi;Su_katsayi;Gaz_katsayi;Atik_katsayi;Toplam_kg_CO2;Konaklama_gecesi;kg_CO2_gece_basina;Metodoloji_surumu\n';
  const lines = params.rows.map((r) => {
    const total = hotelTotalKgCo2(r);
    const occ = params.occupancyByMonth[r.month_start] ?? 0;
    const per = occ > 0 ? total / occ : '';
    return [
      r.month_start.slice(0, 7),
      r.electricity_kwh,
      r.water_m3,
      r.gas_m3,
      r.waste_kg,
      r.electricity_factor,
      r.water_factor,
      r.gas_factor,
      r.waste_factor,
      total.toFixed(2),
      occ,
      per === '' ? '' : Number(per).toFixed(4),
      (r.methodology_version ?? '').replace(/;/g, ','),
    ].join(';');
  });
  let out = '\ufeff' + header + lines.join('\n');
  const s3 = params.scope3ByMonth?.filter((x) => x?.month_start) ?? [];
  if (s3.length > 0) {
    out +=
      '\n\nSCOPE3_TAHMIN_AYRI_BLOK\n' +
      'Ay;Onayli_harcama_TRY;Onayli_maas_TRY;Toplam_TRY;kg_CO2e_tahmini;Carpan_kg_per_TRY\n';
    out += s3
      .map((s) =>
        [
          s.month_start.slice(0, 7),
          s.approved_expenses_try,
          s.approved_salary_try,
          s.total_try,
          s.kg_co2e_estimate,
          s.factor_kg_co2e_per_try,
        ].join(';')
      )
      .join('\n');
  }
  return out;
}
