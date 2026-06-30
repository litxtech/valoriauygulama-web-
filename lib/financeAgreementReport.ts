import { formatDateShort } from '@/lib/date';
import { fmtMoneyTry, PAYMENT_METHOD_LABELS, type MovementPaymentMethod } from '@/lib/financeLedger';
import { resolveCategoryLabel } from '@/lib/financeCategoriesApi';
import {
  buildReportPersonInfoCard,
  reportFooterHtml,
  type FinanceReportFooter,
} from '@/lib/financeCounterpartyReport';
import { AGREEMENT_STATUS_LABELS, type CounterpartyAgreementRow, type AgreementMovementRow } from '@/lib/financeCounterpartyAgreements';
import { DEFAULT_FINANCE_DOCUMENT_BRAND } from '@/lib/financeReportBranding';

const PLAN_CSS = `
  @page { size: A4 portrait; margin: 16mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; margin: 0; font-size: 11pt; }
  .header { display: flex; justify-content: space-between; border-bottom: 2px solid #7c3aed; padding-bottom: 10px; margin-bottom: 14px; }
  .brand { font-size: 15pt; font-weight: 800; color: #5b21b6; }
  .brandSub { font-size: 9pt; color: #64748b; margin-top: 2px; }
  .reportTitle { font-size: 17pt; font-weight: 800; margin: 8px 0 4px; }
  .reportSub { font-size: 10pt; color: #64748b; margin-bottom: 14px; }
  .accountOverview { page-break-inside: avoid; break-inside: avoid; margin-bottom: 14px; }
  .planHero {
    border: 2px solid #7c3aed;
    border-radius: 12px;
    padding: 16px 18px;
    margin: 12px 0 18px;
    background: linear-gradient(135deg, #faf5ff 0%, #f8fafc 100%);
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .planHeroTitle { font-size: 16pt; font-weight: 800; color: #5b21b6; margin-bottom: 10px; }
  .planGrid { display: flex; flex-wrap: wrap; gap: 12px; page-break-inside: avoid; break-inside: avoid; }
  .planBox { flex: 1; min-width: 120px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; page-break-inside: avoid; break-inside: avoid; }
  .planLbl { font-size: 9pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
  .planVal { font-size: 14pt; font-weight: 800; margin-top: 4px; }
  .planValPaid { color: #dc2626; }
  .planValRem { color: #7c3aed; }
  .planValTarget { color: #0f172a; }
  .planBar { height: 8px; background: #e2e8f0; border-radius: 4px; margin-top: 12px; overflow: hidden; }
  .planBarFill { height: 100%; background: #7c3aed; border-radius: 4px; }
  .section h2 { font-size: 12pt; margin: 0 0 8px; color: #334155; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 6px; }
  table.reportTable thead { display: table-header-group; }
  table.reportTable tr { page-break-inside: avoid; break-inside: avoid; }
  th, td { border: 1px solid #e2e8f0; padding: 7px 8px; text-align: left; }
  th { background: #f1f5f9; font-weight: 700; }
  .amt { text-align: right; font-weight: 700; color: #dc2626; }
  .muted { color: #94a3b8; font-size: 10pt; }
  .personCard {
    display: flex; align-items: flex-start; gap: 14px; margin: 0 0 14px; padding: 12px 14px;
    border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; max-width: 420px;
    page-break-inside: avoid; break-inside: avoid;
  }
  .personPhoto, .personPhotoPh { width: 56px; height: 56px; border-radius: 10px; flex-shrink: 0; }
  .personPhotoPh { background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #475569; }
  .personName { font-size: 14pt; font-weight: 800; }
  .personLine { font-size: 10pt; color: #334155; margin-top: 3px; }
  .personLbl { color: #64748b; font-weight: 600; margin-right: 6px; }
`;

function esc(s: string | null | undefined): string {
  if (s == null || s === '') return '—';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export type AgreementReportInput = {
  personName: string;
  partyTypeLabel?: string;
  phone?: string | null;
  profileImageUrl?: string | null;
  documentBrandTitle?: string;
  agreement: CounterpartyAgreementRow;
  movements: AgreementMovementRow[];
  footer: FinanceReportFooter;
};

export function buildAgreementReportHtml(input: AgreementReportInput): string {
  const { agreement: a } = input;
  const pct = a.target_amount > 0 ? Math.min(100, Math.round((a.amount_paid / a.target_amount) * 100)) : 0;
  const brand = esc(input.documentBrandTitle || DEFAULT_FINANCE_DOCUMENT_BRAND);
  const created = formatDateShort(new Date());

  const personCard = buildReportPersonInfoCard({
    name: input.personName,
    phone: input.phone,
    partyTypeLabel: input.partyTypeLabel,
    profileImageUrl: input.profileImageUrl,
  });

  const paymentRows = input.movements
    .map(
      (m) => `<tr>
      <td>${esc(formatDateShort(m.movement_date))}</td>
      <td class="amt">−${esc(fmtMoneyTry(m.amount))}</td>
      <td>${esc(resolveCategoryLabel(m.category))}</td>
      <td>${esc(PAYMENT_METHOD_LABELS[m.payment_method as MovementPaymentMethod] ?? m.payment_method)}</td>
      <td>${esc(m.description)}</td>
    </tr>`
    )
    .join('');

  const notesBlock = a.notes?.trim()
    ? `<p class="muted" style="margin-top:8px"><strong>Not:</strong> ${esc(a.notes.trim())}</p>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${PLAN_CSS}</style></head><body>
<div class="header">
  <div><div class="brand">${brand}</div><div class="brandSub">Ödeme planı belgesi</div></div>
  <div style="text-align:right;font-size:10pt;color:#64748b">Oluşturulma: ${esc(created)}</div>
</div>
<div class="reportTitle">Ödeme planı</div>
<div class="reportSub">${esc(a.title)} · ${esc(AGREEMENT_STATUS_LABELS[a.status])} · Başlangıç ${esc(formatDateShort(a.started_on))}</div>

<div class="accountOverview">
${personCard}

<div class="planHero">
  <div class="planHeroTitle">${esc(a.title)}</div>
  <div class="planGrid">
    <div class="planBox"><div class="planLbl">Hedef tutar</div><div class="planVal planValTarget">${esc(fmtMoneyTry(a.target_amount))}</div></div>
    <div class="planBox"><div class="planLbl">Ödenen</div><div class="planVal planValPaid">${esc(fmtMoneyTry(a.amount_paid))}</div></div>
    <div class="planBox"><div class="planLbl">Mevcut borç</div><div class="planVal planValRem">${esc(fmtMoneyTry(a.amount_remaining))}</div></div>
  </div>
  <div class="planBar"><div class="planBarFill" style="width:${pct}%"></div></div>
  <p class="muted" style="margin-top:8px">İlerleme: %${pct}</p>
  ${notesBlock}
</div>
</div>

<div class="section">
  <h2>Plana bağlı ödemeler (${input.movements.length})</h2>
  ${
    input.movements.length === 0
      ? '<p class="muted">Henüz bu plana bağlı ödeme yok.</p>'
      : `<table class="reportTable">
    <thead><tr><th>Tarih</th><th>Tutar</th><th>Kategori</th><th>Ödeme</th><th>Açıklama</th></tr></thead>
    <tbody>${paymentRows}</tbody>
  </table>`
  }
</div>

<p class="muted" style="margin-top:16px">Genel cari özeti (tüm tahsilat/ödemeler) bu belgede yer almaz; yalnızca seçili ödeme planı gösterilir.</p>

${reportFooterHtml(input.footer)}
</body></html>`;
}
