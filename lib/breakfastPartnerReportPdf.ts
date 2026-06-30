import { Alert, Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/lib/supabase';
import { sendPdfToPrinterEmail } from '@/lib/printerEmail';
import { DEFAULT_FINANCE_DOCUMENT_BRAND } from '@/lib/financeReportBranding';
import {
  fetchPartnerHotel,
  fetchPartnerLifetimeAmountTotal,
  fetchPartnerMonthStats,
  fetchPartnerOpenBalance,
  fetchPartnerPaymentHistory,
  fetchPartnerPortalOpenBalance,
  fmtPartnerMoney,
  formatPartnerDateTurkish,
  listPartnerDailyEntries,
  listPartnerDailyEntriesLedger,
  partnerEntryPayLabel,
  PARTNER_STATUS_LABELS,
  resolveEffectiveUnitPrice,
  type BreakfastPartnerHotel,
  type BreakfastPartnerHotelStatus,
  type PartnerDailyEntryLedgerRow,
  type PartnerPaymentRow,
} from '@/lib/breakfastPartner';

export type PartnerActivityReportEntry = {
  record_date: string;
  guest_count: number;
  unit_price_snapshot: number;
  line_total: number;
  note: string | null;
  amount_remaining?: number;
};

export type PartnerActivityReportData = {
  generatedAt: string;
  periodLabel: string;
  providerName: string;
  hotel: {
    name: string;
    contactName?: string | null;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
    address?: string | null;
    taxId?: string | null;
    taxOffice?: string | null;
    iban?: string | null;
    statusLabel: string;
    unitPrice: number;
    registeredAt?: string | null;
  };
  summary: {
    openBalance: number;
    monthGuestTotal: number;
    monthAmountTotal: number;
    lifetimeTotal: number;
    totalPayments: number;
    periodGuestTotal: number;
    periodAmountTotal: number;
    entryCount: number;
  };
  entries: PartnerActivityReportEntry[];
  payments: PartnerPaymentRow[];
};

function esc(s: string | null | undefined): string {
  if (s == null || s === '') return '—';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtTrDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}


function entryPayStatus(entry: PartnerActivityReportEntry): string {
  if (entry.amount_remaining == null) return '—';
  return partnerEntryPayLabel({
    guest_count: entry.guest_count,
    amount_remaining: entry.amount_remaining,
  });
}

function resolvePeriodLabel(entries: PartnerActivityReportEntry[], days: number): string {
  if (!entries.length) return `Son ${days} gün — kayıt yok`;
  const dates = entries.map((e) => e.record_date).sort();
  const from = formatPartnerDateTurkish(dates[0]!);
  const to = formatPartnerDateTurkish(dates[dates.length - 1]!);
  return `${from} — ${to} (${entries.length} kayıt)`;
}

function mapHotelToReportHotel(
  hotel: BreakfastPartnerHotel,
  unitPrice: number
): PartnerActivityReportData['hotel'] {
  return {
    name: hotel.name,
    contactName: hotel.contact_name,
    email: hotel.email,
    phone: hotel.phone,
    city: hotel.city,
    address: hotel.address,
    taxId: hotel.tax_id,
    taxOffice: hotel.tax_office,
    iban: hotel.iban,
    statusLabel: PARTNER_STATUS_LABELS[hotel.status as BreakfastPartnerHotelStatus] ?? hotel.status,
    unitPrice,
    registeredAt: hotel.created_at?.slice(0, 10) ?? null,
  };
}

async function fetchOrgName(organizationId: string): Promise<string> {
  const { data } = await supabase.from('organizations').select('name').eq('id', organizationId).maybeSingle();
  return data?.name?.trim() || DEFAULT_FINANCE_DOCUMENT_BRAND;
}

async function fetchAdminPartnerPayments(counterpartyId: string, limit = 60): Promise<PartnerPaymentRow[]> {
  const { data, error } = await supabase
    .from('finance_movements')
    .select('id, amount, movement_date, description, payment_method, created_at')
    .eq('counterparty_id', counterpartyId)
    .eq('kind', 'income')
    .order('movement_date', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    amount: Number(row.amount) || 0,
    movementDate: String(row.movement_date),
    description: (row.description as string | null) ?? null,
    paymentMethod: (row.payment_method as string | null) ?? null,
    createdAt: String(row.created_at),
  }));
}

function buildSummary(
  entries: PartnerActivityReportEntry[],
  openBalance: number,
  monthStats: { monthGuestTotal: number; monthAmountTotal: number },
  lifetimeTotal: number,
  payments: PartnerPaymentRow[]
): PartnerActivityReportData['summary'] {
  return {
    openBalance,
    monthGuestTotal: monthStats.monthGuestTotal,
    monthAmountTotal: monthStats.monthAmountTotal,
    lifetimeTotal,
    totalPayments: payments.reduce((s, p) => s + p.amount, 0),
    periodGuestTotal: entries.reduce((s, e) => s + e.guest_count, 0),
    periodAmountTotal: entries.reduce((s, e) => s + e.line_total, 0),
    entryCount: entries.length,
  };
}

function mapLedgerEntries(rows: PartnerDailyEntryLedgerRow[]): PartnerActivityReportEntry[] {
  return rows.map((e) => ({
    record_date: e.record_date,
    guest_count: e.guest_count,
    unit_price_snapshot: e.unit_price_snapshot,
    line_total: e.line_total,
    note: e.note,
    amount_remaining: e.amount_remaining,
  }));
}

function mapPlainEntries(
  rows: Awaited<ReturnType<typeof listPartnerDailyEntries>>
): PartnerActivityReportEntry[] {
  return rows.map((e) => ({
    record_date: e.record_date,
    guest_count: e.guest_count,
    unit_price_snapshot: e.unit_price_snapshot,
    line_total: e.line_total,
    note: e.note,
  }));
}

/** Partner portal — kendi işlem özetini yükler. */
export async function loadPartnerPortalActivityReport(
  partnerHotelId: string,
  days = 365
): Promise<PartnerActivityReportData> {
  const [ledgerRows, payments, openBalance, monthStats, lifetimeTotal] = await Promise.all([
    listPartnerDailyEntriesLedger(Math.min(days, 365), partnerHotelId),
    fetchPartnerPaymentHistory(60).catch(() => [] as PartnerPaymentRow[]),
    fetchPartnerPortalOpenBalance(),
    fetchPartnerMonthStats(partnerHotelId).catch(() => ({
      monthGuestTotal: 0,
      monthAmountTotal: 0,
      entryCount: 0,
    })),
    fetchPartnerLifetimeAmountTotal(partnerHotelId).catch(() => 0),
  ]);

  const hotel = await fetchPartnerHotel(partnerHotelId);
  if (!hotel) throw new Error('Partner otel bulunamadı');

  const unitPrice = await resolveEffectiveUnitPrice(hotel);
  const providerName = await fetchOrgName(hotel.organization_id);
  const entries = mapLedgerEntries(ledgerRows);

  return {
    generatedAt: new Date().toISOString(),
    periodLabel: resolvePeriodLabel(entries, days),
    providerName,
    hotel: mapHotelToReportHotel(hotel, unitPrice),
    summary: buildSummary(entries, openBalance, monthStats, lifetimeTotal, payments),
    entries,
    payments,
  };
}

/** Admin — belirli partner otel için işlem özeti. */
export async function loadAdminPartnerActivityReport(
  partnerHotelId: string,
  days = 365
): Promise<PartnerActivityReportData> {
  const hotel = await fetchPartnerHotel(partnerHotelId);
  if (!hotel) throw new Error('Partner otel bulunamadı');

  const limit = Math.min(days, 365);
  const [entryRows, payments, openBalance, monthStats, lifetimeTotal, unitPrice, providerName] =
    await Promise.all([
      listPartnerDailyEntries(partnerHotelId, { limit }),
      hotel.counterparty_id
        ? fetchAdminPartnerPayments(hotel.counterparty_id, 60)
        : Promise.resolve([] as PartnerPaymentRow[]),
      hotel.counterparty_id
        ? fetchPartnerOpenBalance(hotel.counterparty_id)
        : Promise.resolve(0),
      fetchPartnerMonthStats(partnerHotelId).catch(() => ({
        monthGuestTotal: 0,
        monthAmountTotal: 0,
        entryCount: 0,
      })),
      fetchPartnerLifetimeAmountTotal(partnerHotelId).catch(() => 0),
      resolveEffectiveUnitPrice(hotel),
      fetchOrgName(hotel.organization_id),
    ]);

  const entries = mapPlainEntries(entryRows);

  return {
    generatedAt: new Date().toISOString(),
    periodLabel: resolvePeriodLabel(entries, days),
    providerName,
    hotel: mapHotelToReportHotel(hotel, unitPrice),
    summary: buildSummary(entries, openBalance, monthStats, lifetimeTotal, payments),
    entries,
    payments,
  };
}

const REPORT_CSS = `
  @page { size: A4 portrait; margin: 9mm 10mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; margin: 0; font-size: 8.5pt; line-height: 1.35; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1.5px solid #d97706; padding-bottom: 6px; margin-bottom: 8px; gap: 12px; }
  .brand { font-size: 11pt; font-weight: 800; color: #92400e; }
  .headerMeta { text-align: right; font-size: 7.5pt; color: #64748b; line-height: 1.4; }
  .partnerLine { font-size: 8.5pt; margin-bottom: 8px; color: #334155; }
  .partnerLine strong { color: #0f172a; font-size: 9.5pt; }
  .partnerMeta { color: #64748b; font-size: 7.5pt; margin-top: 2px; }
  .summaryGrid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px; margin-bottom: 10px; }
  .summaryCard { border: 1px solid #e2e8f0; border-radius: 5px; padding: 5px 6px; background: #f8fafc; }
  .summaryLbl { font-size: 6.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
  .summaryVal { font-size: 9.5pt; font-weight: 800; margin-top: 2px; color: #0f172a; white-space: nowrap; }
  .summaryValAccent { color: #b45309; }
  .sectionTitle { font-size: 8.5pt; font-weight: 800; margin: 8px 0 4px; color: #334155; }
  table.data { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 7.5pt; }
  table.data th, table.data td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: left; vertical-align: middle; }
  table.data th { background: #f1f5f9; font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.03em; color: #475569; font-weight: 700; }
  table.data td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table.data tr:nth-child(even) td { background: #fafafa; }
  .muted { color: #94a3b8; font-size: 7.5pt; margin: 2px 0 6px; }
  .footer { margin-top: 8px; padding-top: 5px; border-top: 1px solid #e2e8f0; font-size: 6.5pt; color: #94a3b8; text-align: center; }
`;

export function buildBreakfastPartnerReportHtml(data: PartnerActivityReportData): string {
  const h = data.hotel;
  const s = data.summary;

  const partnerMeta = [
    h.contactName,
    h.phone,
    h.email,
    h.city,
    h.taxId ? `VN: ${h.taxId}` : null,
    h.taxOffice,
    h.iban,
    `${fmtPartnerMoney(h.unitPrice)}/kişi`,
  ]
    .filter(Boolean)
    .join(' · ');

  const entryRows = data.entries
    .map(
      (e) => `<tr>
        <td>${esc(formatPartnerDateTurkish(e.record_date))}</td>
        <td class="num">${e.guest_count}</td>
        <td class="num">${esc(fmtPartnerMoney(e.line_total))}</td>
        <td>${esc(entryPayStatus(e))}</td>
      </tr>`
    )
    .join('');

  const paymentRows = data.payments
    .map(
      (p) => `<tr>
        <td>${esc(formatPartnerDateTurkish(p.movementDate))}</td>
        <td>${esc(p.description?.trim() || 'Tahsilat')}</td>
        <td class="num">${esc(fmtPartnerMoney(p.amount))}</td>
      </tr>`
    )
    .join('');

  const fileSlug = h.name.replace(/[^\w\u00C0-\u024F]+/gi, '-').slice(0, 32) || 'partner';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${esc(h.name)} — Cari özet</title>
  <style>${REPORT_CSS}</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">${esc(data.providerName)} · Kahvaltı cari</div>
      <div class="partnerLine"><strong>${esc(h.name)}</strong></div>
      ${partnerMeta ? `<div class="partnerMeta">${esc(partnerMeta)}</div>` : ''}
    </div>
    <div class="headerMeta">
      <div>${esc(fmtTrDateTime(data.generatedAt))}</div>
      <div>${esc(data.periodLabel)}</div>
      <div>${esc(h.statusLabel)}</div>
    </div>
  </div>

  <div class="summaryGrid">
    <div class="summaryCard">
      <div class="summaryLbl">Açık cari</div>
      <div class="summaryVal summaryValAccent">${esc(fmtPartnerMoney(s.openBalance))}</div>
    </div>
    <div class="summaryCard">
      <div class="summaryLbl">Bu ay kişi</div>
      <div class="summaryVal">${s.monthGuestTotal}</div>
    </div>
    <div class="summaryCard">
      <div class="summaryLbl">Bu ay tutar</div>
      <div class="summaryVal">${esc(fmtPartnerMoney(s.monthAmountTotal))}</div>
    </div>
    <div class="summaryCard">
      <div class="summaryLbl">Dönem kişi</div>
      <div class="summaryVal">${s.periodGuestTotal}</div>
    </div>
    <div class="summaryCard">
      <div class="summaryLbl">Dönem tutar</div>
      <div class="summaryVal">${esc(fmtPartnerMoney(s.periodAmountTotal))}</div>
    </div>
    <div class="summaryCard">
      <div class="summaryLbl">Tahsilat</div>
      <div class="summaryVal">${esc(fmtPartnerMoney(s.totalPayments))}</div>
    </div>
  </div>

  <div class="sectionTitle">Günlük kayıtlar (${s.entryCount})</div>
  ${
    data.entries.length
      ? `<table class="data">
    <thead>
      <tr>
        <th>Tarih</th>
        <th>Kişi</th>
        <th>Tutar</th>
        <th>Durum</th>
      </tr>
    </thead>
    <tbody>${entryRows}</tbody>
  </table>`
      : `<p class="muted">Kayıt yok.</p>`
  }

  <div class="sectionTitle">Tahsilatlar (${data.payments.length})</div>
  ${
    data.payments.length
      ? `<table class="data">
    <thead>
      <tr>
        <th>Tarih</th>
        <th>Açıklama</th>
        <th>Tutar</th>
      </tr>
    </thead>
    <tbody>${paymentRows}</tbody>
  </table>`
      : `<p class="muted">Tahsilat yok.</p>`
  }

  <div class="footer">${esc(data.providerName)} · ${esc(fileSlug)} · ${esc(fmtTrDateTime(data.generatedAt))}</div>
</body>
</html>`;
}

function reportFileName(data: PartnerActivityReportData): string {
  const slug = data.hotel.name.replace(/[^\w\u00C0-\u024F]+/gi, '-').slice(0, 24) || 'partner';
  const date = data.generatedAt.slice(0, 10);
  return `kahvalti-partner-${slug}-${date}.pdf`;
}

async function createReportPdf(data: PartnerActivityReportData): Promise<{ uri: string; html: string; fileName: string }> {
  const html = buildBreakfastPartnerReportHtml(data);
  const file = await Print.printToFileAsync({ html, base64: false });
  if (!file?.uri) throw new Error('PDF oluşturulamadı');
  return { uri: file.uri, html, fileName: reportFileName(data) };
}

export async function exportBreakfastPartnerReport(
  data: PartnerActivityReportData,
  action: 'share' | 'print' | 'printer'
): Promise<void> {
  const { uri, html, fileName } = await createReportPdf(data);
  const subject = `Kahvaltı Partner Özeti — ${data.hotel.name}`;

  if (action === 'printer') {
    await sendPdfToPrinterEmail({ pdfUri: uri, subject, fileName });
    Alert.alert('Gönderildi', 'İşlem özeti yazıcı e-postasına iletildi.');
    return;
  }

  if (action === 'print') {
    if (Platform.OS === 'web') {
      await Print.printAsync({ html });
    } else {
      await Print.printAsync({ uri });
    }
    return;
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: subject,
    });
  } else {
    Alert.alert('PDF hazır', uri);
  }
}
