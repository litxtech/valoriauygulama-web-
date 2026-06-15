import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert, Platform, TurboModuleRegistry } from 'react-native';
import { sendPdfToPrinterEmail } from '@/lib/printerEmail';
import { supabase } from '@/lib/supabase';
import { formatDateShort } from '@/lib/date';
import {
  COUNTERPARTY_TYPE_LABELS,
  fmtMoneyTry,
  LEDGER_SCOPE_LABELS,
  PAYMENT_METHOD_LABELS,
  type FinanceLedgerScope,
} from '@/lib/financeLedger';
import { resolveCategoryLabel } from '@/lib/financeCategoriesApi';
import { safeReportImageUrl } from '@/lib/financeCounterpartyAvatar';
import {
  DEFAULT_FINANCE_DOCUMENT_BRAND,
  resolveFinanceReportBranding,
} from '@/lib/financeReportBranding';

export type CounterpartyReportMovement = {
  movement_date: string;
  kind: string;
  amount: number;
  category: string;
  description: string;
  ledger_scope: FinanceLedgerScope;
  payment_method?: string;
};

export const DEFAULT_FINANCE_REPORT_PREPARER = 'Soner Toprak';
export const DEFAULT_FINANCE_REPORT_DISCLAIMER =
  'Bu belge otel muhasebe kayıtlarının resmi özetidir. İç kullanım içindir; yetkisiz kopyalama ve paylaşım yasaktır.';

export type FinanceReportFooter = {
  preparedByName: string;
  organizationLine: string;
  disclaimer: string;
  documentBrandTitle: string;
};

export function resolveFinanceReportFooter(opts?: {
  organizationName?: string | null;
  financeReportBrand?: string | null;
  documentBrandTitle?: string | null;
}): FinanceReportFooter {
  const org = opts?.organizationName?.trim();
  const branding = resolveFinanceReportBranding({
    organizationName: opts?.organizationName,
    financeReportBrand: opts?.financeReportBrand,
  });
  return {
    preparedByName: DEFAULT_FINANCE_REPORT_PREPARER,
    organizationLine: org ? `Tesis: ${org}` : 'Valoria Hotel · Muhasebe',
    disclaimer: DEFAULT_FINANCE_REPORT_DISCLAIMER,
    documentBrandTitle: opts?.documentBrandTitle?.trim() || branding.documentBrandTitle,
  };
}

export type CounterpartyPersonReportInput = {
  personName: string;
  partyTypeLabel: string;
  phone?: string | null;
  notes?: string | null;
  profileImageUrl?: string | null;
  scopeLabel: string;
  income: number;
  expense: number;
  movements: CounterpartyReportMovement[];
  footer: FinanceReportFooter;
};

export type CounterpartyListReportRow = {
  name: string;
  partyTypeLabel: string;
  phone?: string | null;
  income: number;
  expense: number;
  net: number;
};

/** PDF / yazdır: hangi hareket türü dahil edilsin */
export type FinanceReportKindFilter = 'paid' | 'received' | 'all';

export const FINANCE_REPORT_KIND_LABELS: Record<FinanceReportKindFilter, string> = {
  paid: 'Ödenen',
  received: 'Alınan',
  all: 'Tümü',
};

function movementMatchesKindFilter(kind: string, filter: FinanceReportKindFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'paid') return kind === 'expense';
  return kind === 'income';
}

function esc(s: string | null | undefined): string {
  if (s == null || s === '') return '—';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttrUrl(url: string): string {
  return url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** PDF’te kişi adı tek yerde — sol bilgi kartı (foto opsiyonel, isim tekrarlanmaz) */
export function buildReportPersonInfoCard(opts: {
  name: string;
  phone?: string | null;
  partyTypeLabel?: string | null;
  lines?: string[];
  profileImageUrl?: string | null;
}): string {
  const name = opts.name?.trim() || '—';
  const rows: string[] = [];
  if (opts.partyTypeLabel?.trim()) {
    rows.push(`<div class="personLine"><span class="personLbl">Tür</span> ${esc(opts.partyTypeLabel.trim())}</div>`);
  }
  if (opts.phone?.trim()) {
    rows.push(`<div class="personLine"><span class="personLbl">Telefon</span> ${esc(opts.phone.trim())}</div>`);
  }
  for (const line of opts.lines ?? []) {
    if (line?.trim()) {
      rows.push(`<div class="personLine">${esc(line.trim())}</div>`);
    }
  }

  const photoUrl = safeReportImageUrl(opts.profileImageUrl);
  const photoHtml = photoUrl
    ? `<img class="personPhoto" src="${escAttrUrl(photoUrl)}" alt=""/>`
    : `<div class="personPhotoPh">${esc(name.charAt(0).toUpperCase())}</div>`;

  return `<div class="personCard">
  ${photoHtml}
  <div class="personCardBody">
    <div class="personName">${esc(name)}</div>
    ${rows.join('\n')}
  </div>
</div>`;
}

function scopeLabel(scope: string | null | undefined): string {
  if (scope === 'hotel' || scope === 'personal') return LEDGER_SCOPE_LABELS[scope];
  return scope?.trim() ? esc(scope) : LEDGER_SCOPE_LABELS.hotel;
}

function paymentLabel(method: string | null | undefined): string {
  if (!method?.trim()) return '—';
  const key = method as keyof typeof PAYMENT_METHOD_LABELS;
  return PAYMENT_METHOD_LABELS[key] ? PAYMENT_METHOD_LABELS[key] : esc(method);
}

const REPORT_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1e293b; font-size: 12px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #7c3aed; padding-bottom: 12px; margin-bottom: 16px; }
  .brand { font-size: 20px; font-weight: 800; color: #7c3aed; }
  .brandSub { font-size: 11px; color: #64748b; margin-top: 2px; }
  .reportTitle { font-size: 18px; font-weight: 800; margin-top: 8px; }
  .reportSub { font-size: 12px; color: #64748b; margin-top: 4px; line-height: 1.5; }
  .summary { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
  .sumBox { flex: 1; min-width: 140px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #f8fafc; }
  .sumLbl { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; }
  .sumVal { font-size: 18px; font-weight: 800; margin-top: 4px; }
  .sumIn { color: #16a34a; }
  .sumOut { color: #dc2626; }
  .sumPaid { color: #16a34a; }
  .rowPaid { color: #16a34a; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; color: #475569; }
  .colAmt { text-align: right; white-space: nowrap; font-weight: 700; }
  .rowIn { color: #16a34a; }
  .rowOut { color: #dc2626; }
  .footer { margin-top: 24px; font-size: 11px; color: #475569; border-top: 2px solid #e2e8f0; padding-top: 14px; }
  .footerOrg { font-size: 11px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px; }
  .footerPreparer { font-size: 12px; margin-bottom: 8px; color: #475569; }
  .footerDisclaimer { font-size: 10px; color: #64748b; line-height: 1.5; margin-bottom: 10px; }
  .footerBrand { font-size: 11px; font-weight: 800; color: #7c3aed; text-align: center; letter-spacing: 0.06em; }
  .section { margin-top: 20px; }
  h2 { font-size: 14px; margin: 0 0 8px; }
  .personCard {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin: 12px 0 18px;
    padding: 14px 16px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #f8fafc;
    max-width: 420px;
  }
  .personPhoto {
    width: 64px;
    height: 64px;
    border-radius: 10px;
    object-fit: cover;
    border: 1px solid #cbd5e1;
    flex-shrink: 0;
  }
  .personPhotoPh {
    width: 64px;
    height: 64px;
    border-radius: 10px;
    background: #e2e8f0;
    color: #475569;
    font-size: 22px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .personCardBody { flex: 1; min-width: 0; }
  .personName { font-size: 16px; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
  .personLine { font-size: 12px; color: #334155; margin-top: 4px; line-height: 1.45; }
  .personLbl { color: #64748b; font-weight: 600; margin-right: 6px; }
`;

export function reportFooterHtml(footer: FinanceReportFooter): string {
  return `<div class="footer">
  <div class="footerOrg">${esc(footer.organizationLine)}</div>
  <div class="footerPreparer"><strong>Hazırlayan:</strong> ${esc(footer.preparedByName)}</div>
  <div class="footerDisclaimer">${esc(footer.disclaimer)}</div>
  <div class="footerBrand">${esc(footer.documentBrandTitle)}</div>
</div>`;
}

function reportShell(title: string, subtitle: string, body: string, footer: FinanceReportFooter): string {
  const created = formatDateShort(new Date());
  const brand = esc(footer.documentBrandTitle || DEFAULT_FINANCE_DOCUMENT_BRAND);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${REPORT_CSS}</style></head><body>
<div class="header">
  <div><div class="brand">${brand}</div><div class="brandSub">Muhasebe — Cari ödeme raporu</div></div>
  <div style="text-align:right"><div class="reportSub">Oluşturulma: ${esc(created)}</div></div>
</div>
<div class="reportTitle">${esc(title)}</div>
<div class="reportSub">${subtitle}</div>
${body}
${reportFooterHtml(footer)}
</body></html>`;
}

export function buildCounterpartyPersonReportHtml(
  input: CounterpartyPersonReportInput,
  kindFilter: FinanceReportKindFilter = 'paid'
): string {
  const reportMetaLine = [input.scopeLabel, FINANCE_REPORT_KIND_LABELS[kindFilter]].filter(Boolean).join(' · ');

  const personCard = buildReportPersonInfoCard({
    name: input.personName,
    phone: input.phone,
    partyTypeLabel: input.partyTypeLabel,
    lines: input.notes?.trim() ? [`Not: ${input.notes.trim()}`] : [],
    profileImageUrl: input.profileImageUrl,
  });

  const filtered = input.movements.filter((m) => movementMatchesKindFilter(m.kind, kindFilter));
  const sorted = [...filtered].sort((a, b) => b.movement_date.localeCompare(a.movement_date));

  const rows = sorted
    .map((m) => {
      const isIn = m.kind === 'income';
      const kindLabel = isIn ? 'Alınan' : 'Ödenen';
      const sign = isIn ? '+' : '−';
      const amt = Number(m.amount);
      const rowClass = isIn ? 'rowIn' : 'rowPaid';
      return `<tr>
        <td>${esc(formatDateShort(m.movement_date))}</td>
        <td class="${rowClass}">${esc(kindLabel)}</td>
        <td class="colAmt ${rowClass}">${sign}${esc(fmtMoneyTry(Number.isFinite(amt) ? amt : 0))}</td>
        <td>${scopeLabel(m.ledger_scope)}</td>
        <td>${esc(resolveCategoryLabel(m.category ?? 'other'))}</td>
        <td>${paymentLabel(m.payment_method)}</td>
        <td>${esc(m.description)}</td>
      </tr>`;
    })
    .join('');

  let summaryHtml = '';
  if (kindFilter === 'paid') {
    summaryHtml = `<div class="summary">
  <div class="sumBox"><div class="sumLbl">Toplam ödenen</div><div class="sumVal sumPaid">${esc(fmtMoneyTry(input.expense))}</div></div>
  <div class="sumBox"><div class="sumLbl">İşlem</div><div class="sumVal">${sorted.length}</div></div>
</div>`;
  } else if (kindFilter === 'received') {
    summaryHtml = `<div class="summary">
  <div class="sumBox"><div class="sumLbl">Toplam alınan</div><div class="sumVal sumIn">${esc(fmtMoneyTry(input.income))}</div></div>
  <div class="sumBox"><div class="sumLbl">İşlem</div><div class="sumVal">${sorted.length}</div></div>
</div>`;
  } else {
    const net = input.income - input.expense;
    const netClass = net >= 0 ? 'sumIn' : 'sumPaid';
    summaryHtml = `<div class="summary">
  <div class="sumBox"><div class="sumLbl">Toplam alınan</div><div class="sumVal sumIn">${esc(fmtMoneyTry(input.income))}</div></div>
  <div class="sumBox"><div class="sumLbl">Toplam ödenen</div><div class="sumVal sumPaid">${esc(fmtMoneyTry(input.expense))}</div></div>
  <div class="sumBox"><div class="sumLbl">Net</div><div class="sumVal ${netClass}">${esc(fmtMoneyTry(net))}</div></div>
</div>`;
  }

  const body = `
${personCard}
${summaryHtml}
<div class="section">
  <h2>İşlem listesi (${sorted.length} kayıt)</h2>
  ${sorted.length === 0 ? '<p>Seçilen türde kayıt yok.</p>' : `<table>
    <tr>
      <th>Tarih</th><th>Tür</th><th>Tutar</th><th>Kapsam</th><th>Kategori</th><th>Ödeme</th><th>Açıklama</th>
    </tr>${rows}</table>`}
</div>`;

  return reportShell('Kişi ödeme raporu', reportMetaLine, body, input.footer);
}

export function buildCounterpartyListReportHtml(
  params: {
    scopeLabel: string;
    rows: CounterpartyListReportRow[];
    grandIncome: number;
    grandExpense: number;
    footer: FinanceReportFooter;
  },
  kindFilter: FinanceReportKindFilter = 'paid'
): string {
  const subtitle = `${params.scopeLabel} · ${FINANCE_REPORT_KIND_LABELS[kindFilter]}`;

  if (kindFilter === 'paid') {
    const sorted = [...params.rows]
      .filter((r) => r.expense >= 0.01)
      .sort((a, b) => b.expense - a.expense || a.name.localeCompare(b.name, 'tr'));
    const tableRows = sorted
      .map(
        (r) => `<tr>
      <td>${esc(r.name)}</td>
      <td>${esc(r.partyTypeLabel)}</td>
      <td>${esc(r.phone?.trim() || '—')}</td>
      <td class="colAmt rowPaid">${esc(fmtMoneyTry(r.expense))}</td>
    </tr>`
      )
      .join('');
    const body = `
<div class="summary">
  <div class="sumBox"><div class="sumLbl">Toplam ödenen</div><div class="sumVal sumPaid">${esc(fmtMoneyTry(params.grandExpense))}</div></div>
  <div class="sumBox"><div class="sumLbl">Kişi</div><div class="sumVal">${sorted.length}</div></div>
</div>
<div class="section">
  <h2>Kişi bazlı özet — ödenen</h2>
  <table>
    <tr><th>Kişi / firma</th><th>Tür</th><th>Telefon</th><th>Ödenen</th></tr>
    ${tableRows || '<tr><td colspan="4">Kayıt yok</td></tr>'}
  </table>
</div>`;
    return reportShell('Kişi ödemeleri — özet', subtitle, body, params.footer);
  }

  if (kindFilter === 'received') {
    const sorted = [...params.rows]
      .filter((r) => r.income >= 0.01)
      .sort((a, b) => b.income - a.income || a.name.localeCompare(b.name, 'tr'));
    const tableRows = sorted
      .map(
        (r) => `<tr>
      <td>${esc(r.name)}</td>
      <td>${esc(r.partyTypeLabel)}</td>
      <td>${esc(r.phone?.trim() || '—')}</td>
      <td class="colAmt rowIn">${esc(fmtMoneyTry(r.income))}</td>
    </tr>`
      )
      .join('');
    const body = `
<div class="summary">
  <div class="sumBox"><div class="sumLbl">Toplam alınan</div><div class="sumVal sumIn">${esc(fmtMoneyTry(params.grandIncome))}</div></div>
  <div class="sumBox"><div class="sumLbl">Kişi</div><div class="sumVal">${sorted.length}</div></div>
</div>
<div class="section">
  <h2>Kişi bazlı özet — alınan</h2>
  <table>
    <tr><th>Kişi / firma</th><th>Tür</th><th>Telefon</th><th>Alınan</th></tr>
    ${tableRows || '<tr><td colspan="4">Kayıt yok</td></tr>'}
  </table>
</div>`;
    return reportShell('Kişi ödemeleri — özet', subtitle, body, params.footer);
  }

  const sorted = [...params.rows].sort((a, b) => b.expense - a.expense || a.name.localeCompare(b.name, 'tr'));
  const tableRows = sorted
    .map(
      (r) => `<tr>
      <td>${esc(r.name)}</td>
      <td>${esc(r.partyTypeLabel)}</td>
      <td>${esc(r.phone?.trim() || '—')}</td>
      <td class="colAmt rowIn">${esc(fmtMoneyTry(r.income))}</td>
      <td class="colAmt rowPaid">${esc(fmtMoneyTry(r.expense))}</td>
      <td class="colAmt">${esc(fmtMoneyTry(r.net))}</td>
    </tr>`
    )
    .join('');

  const body = `
<div class="summary">
  <div class="sumBox"><div class="sumLbl">Toplam alınan</div><div class="sumVal sumIn">${esc(fmtMoneyTry(params.grandIncome))}</div></div>
  <div class="sumBox"><div class="sumLbl">Toplam ödenen</div><div class="sumVal sumPaid">${esc(fmtMoneyTry(params.grandExpense))}</div></div>
  <div class="sumBox"><div class="sumLbl">Kişi</div><div class="sumVal">${sorted.length}</div></div>
</div>
<div class="section">
  <h2>Kişi bazlı özet — tümü</h2>
  <table>
    <tr><th>Kişi / firma</th><th>Tür</th><th>Telefon</th><th>Alınan</th><th>Ödenen</th><th>Net</th></tr>
    ${tableRows || '<tr><td colspan="6">Kayıt yok</td></tr>'}
  </table>
</div>`;

  return reportShell('Kişi ödemeleri — özet', subtitle, body, params.footer);
}

function normalizeMovementRow(
  row: Record<string, unknown>
): CounterpartyReportMovement {
  return {
    movement_date: String(row.movement_date ?? ''),
    kind: String(row.kind ?? 'expense'),
    amount: Number(row.amount) || 0,
    category: String(row.category ?? 'other'),
    description: String(row.description ?? ''),
    ledger_scope: row.ledger_scope === 'personal' ? 'personal' : 'hotel',
    payment_method: row.payment_method ? String(row.payment_method) : undefined,
  };
}

export async function fetchCounterpartyMovementsForReport(
  counterpartyId: string,
  scopeFilter: 'all' | FinanceLedgerScope,
  limit = 500
): Promise<CounterpartyReportMovement[]> {
  const selectWithScope =
    'movement_date, kind, amount, category, description, ledger_scope, payment_method';
  const selectBase = 'movement_date, kind, amount, category, description, payment_method';

  let q = supabase
    .from('finance_movements')
    .select(selectWithScope)
    .eq('counterparty_id', counterpartyId)
    .order('movement_date', { ascending: false })
    .limit(limit);
  if (scopeFilter !== 'all') q = q.eq('ledger_scope', scopeFilter);

  let { data, error } = await q;
  let usedFallback = false;

  if (error?.message?.includes('ledger_scope')) {
    usedFallback = true;
    const res = await supabase
      .from('finance_movements')
      .select(selectBase)
      .eq('counterparty_id', counterpartyId)
      .order('movement_date', { ascending: false })
      .limit(limit);
    data = res.data as typeof data;
    error = res.error;
  }

  if (error) throw error;

  let rows = ((data ?? []) as Record<string, unknown>[]).map(normalizeMovementRow);
  if (usedFallback && scopeFilter !== 'all') {
    rows = rows.filter((r) => r.ledger_scope === scopeFilter);
  }
  return rows;
}

function financeReportPdfFileName(fileName: string): string {
  return fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
}

function ensurePdfFileUri(uri: string): string {
  return uri.startsWith('file://') ? uri : `file://${uri}`;
}

async function tryShareFinancePdfWithRNShare(
  uri: string,
  message: string,
  fileName: string,
  whatsappOnly: boolean
): Promise<boolean> {
  if (Platform.OS === 'web' || !TurboModuleRegistry.get('RNShare')) {
    return false;
  }

  try {
    const RNShare = require('react-native-share').default as {
      open: (options: Record<string, unknown>) => Promise<unknown>;
      Social: { WHATSAPP: string };
    };
    const options: Record<string, unknown> = {
      title: message,
      subject: fileName,
      message,
      url: ensurePdfFileUri(uri),
      type: 'application/pdf',
      failOnCancel: false,
    };
    if (whatsappOnly) {
      options.social = RNShare.Social.WHATSAPP;
    }
    await RNShare.open(options);
    return true;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e ?? '');
    if (/cancel|did not share|User did not/i.test(msg)) return true;
    return false;
  }
}

/** PDF üretimi — paylaşım/yazdırma öncesi; spinner bu aşamada gösterilir. */
export async function createFinanceReportPdfUri(html: string): Promise<string> {
  const file = await Print.printToFileAsync({ html, base64: false });
  const uri = file?.uri;
  if (!uri) throw new Error('PDF dosyası oluşturulamadı');
  return uri;
}

export async function runFinanceReportAction(opts: {
  html: string;
  /** Önceden üretilmiş PDF; verilirse tekrar render edilmez. */
  pdfUri?: string;
  fileName: string;
  mailSubject: string;
  shareDialogTitle: string;
  action: 'share' | 'print' | 'mail' | 'whatsapp';
}): Promise<void> {
  const uri = opts.pdfUri ?? (await createFinanceReportPdfUri(opts.html));
  const pdfName = financeReportPdfFileName(opts.fileName);

  if (opts.action === 'mail') {
    await sendPdfToPrinterEmail({
      pdfUri: uri,
      subject: opts.mailSubject,
      fileName: pdfName,
    });
    Alert.alert('Gönderildi', 'Rapor yazıcı e-posta adresine iletildi.');
    return;
  }

  if (opts.action === 'print') {
    if (Platform.OS === 'web') {
      await Print.printAsync({ html: opts.html });
    } else {
      await Print.printAsync({ uri });
    }
    return;
  }

  if (opts.action === 'whatsapp') {
    const caption = opts.mailSubject || opts.shareDialogTitle;
    if (await tryShareFinancePdfWithRNShare(uri, caption, pdfName, true)) return;

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: 'WhatsApp — PDF',
      });
      return;
    }

    Alert.alert('WhatsApp', 'Bu cihazda PDF paylaşımı desteklenmiyor.');
    return;
  }

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: opts.shareDialogTitle,
    });
  } else {
    Alert.alert('PDF hazır', uri);
  }
}

export function counterpartyPartyTypeLabel(
  partyType: string,
  partyTypeLabel?: string | null
): string {
  const custom = partyTypeLabel?.trim();
  if (custom) return custom;
  return COUNTERPARTY_TYPE_LABELS[partyType as keyof typeof COUNTERPARTY_TYPE_LABELS] ?? partyType;
}
