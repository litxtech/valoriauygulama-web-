import { Alert, Platform, TurboModuleRegistry } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { sendPdfToPrinterEmail } from '@/lib/printerEmail';
import { supabase } from '@/lib/supabase';
import { formatDateShort } from '@/lib/date';
import { resolveCategoryLabel } from '@/lib/financeCategoriesApi';
import {
  COUNTERPARTY_TYPE_LABELS,
  fmtMoneyTry,
  LEDGER_SCOPE_LABELS,
  PAYMENT_METHOD_LABELS,
  type FinanceMovementKind,
  type FinanceLedgerScope,
  type MovementPaymentMethod,
} from '@/lib/financeLedger';
import { safeReportImageUrl } from '@/lib/financeCounterpartyAvatar';
import {
  buildReportPersonInfoCard,
  DEFAULT_FINANCE_REPORT_DISCLAIMER,
  resolveFinanceReportFooter,
} from '@/lib/financeCounterpartyReport';
import {
  DEFAULT_FINANCE_DOCUMENT_BRAND,
  resolveFinanceReportBranding,
  type FinanceReportBranding,
} from '@/lib/financeReportBranding';

const RECEIPT_CSS = `
  @page { size: A4 portrait; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    margin: 0;
    padding: 0;
    color: #1e293b;
    font-size: 11pt;
    line-height: 1.45;
    background: #fff;
  }
  .page { max-width: 100%; }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #7c3aed;
    padding-bottom: 12px;
    margin-bottom: 18px;
  }
  .brand { font-size: 18pt; font-weight: 800; color: #7c3aed; letter-spacing: 0.02em; }
  .brandSub { font-size: 9pt; color: #64748b; margin-top: 4px; font-weight: 600; }
  .headerMeta { text-align: right; font-size: 9pt; color: #64748b; line-height: 1.6; }
  .headerMeta strong { color: #334155; display: block; font-size: 10pt; }
  .docBadge {
    display: inline-block;
    padding: 6px 14px;
    border-radius: 4px;
    font-size: 9pt;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin-bottom: 10px;
  }
  .badgeExpense { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
  .badgeIncome { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
  .docTitle { font-size: 16pt; font-weight: 800; margin: 0 0 6px; color: #0f172a; }
  .docSub { font-size: 10pt; color: #64748b; margin: 0 0 18px; line-height: 1.5; }
  .amountBlock {
    border: 2px solid #e2e8f0;
    border-radius: 8px;
    padding: 18px 20px;
    margin-bottom: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f8fafc;
  }
  .amountBlock.expense { border-color: #fecaca; background: #fffbfb; }
  .amountBlock.income { border-color: #bbf7d0; background: #fafffb; }
  .amountLbl { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
  .amountVal { font-size: 26pt; font-weight: 900; line-height: 1.1; }
  .amountVal.expense { color: #dc2626; }
  .amountVal.income { color: #16a34a; }
  .amountRef { font-size: 9pt; color: #64748b; text-align: right; max-width: 42%; }
  .statement {
    font-size: 10pt;
    color: #475569;
    margin: 0 0 14px;
    padding: 10px 12px;
    background: #f1f5f9;
    border-left: 3px solid #7c3aed;
    border-radius: 0 6px 6px 0;
  }
  h2.section { font-size: 11pt; font-weight: 800; margin: 0 0 8px; color: #334155; text-transform: uppercase; letter-spacing: 0.04em; }
  table.data { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  table.data th, table.data td {
    border: 1px solid #cbd5e1;
    padding: 10px 12px;
    text-align: left;
    vertical-align: top;
    font-size: 10pt;
  }
  table.data th {
    background: #f1f5f9;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #475569;
    font-weight: 700;
  }
  table.data td.amt { text-align: right; font-weight: 800; white-space: nowrap; }
  table.data td.amt.expense { color: #dc2626; }
  table.data td.amt.income { color: #16a34a; }
  table.data tbody tr { background: #fff; }
  .noteBox {
    margin-bottom: 20px;
    padding: 12px 14px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: #fff;
  }
  .noteBox strong { font-size: 9pt; color: #64748b; text-transform: uppercase; }
  .noteBox p { margin: 6px 0 0; font-size: 10pt; color: #334155; }
  .attachments { margin-top: 8px; page-break-inside: avoid; }
  .attachGrid { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 10px; }
  .attachImg {
    max-width: 240px;
    max-height: 280px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    object-fit: contain;
  }
  .footer {
    margin-top: 28px;
    padding-top: 14px;
    border-top: 2px solid #e2e8f0;
    font-size: 9pt;
    color: #64748b;
  }
  .footerOrg { font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px; }
  .footerDisclaimer { line-height: 1.5; margin-bottom: 10px; }
  .footerBrand { text-align: center; font-weight: 800; color: #7c3aed; font-size: 10pt; letter-spacing: 0.08em; }
  .personCard {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin: 0 0 16px;
    padding: 12px 14px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #f8fafc;
    max-width: 100%;
  }
  .personPhoto {
    width: 56px;
    height: 56px;
    border-radius: 10px;
    object-fit: cover;
    border: 1px solid #cbd5e1;
    flex-shrink: 0;
  }
  .personPhotoPh {
    width: 56px;
    height: 56px;
    border-radius: 10px;
    background: #e2e8f0;
    color: #475569;
    font-size: 20px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .personCardBody { flex: 1; min-width: 0; }
  .personName { font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 6px; }
  .personLine { font-size: 11pt; color: #334155; margin-top: 3px; }
  .personLbl { color: #64748b; font-weight: 600; margin-right: 6px; }
`;

export type FinanceMovementReceiptInput = {
  id: string;
  kind: FinanceMovementKind;
  amount: number;
  movement_date: string;
  payment_method: MovementPaymentMethod | string;
  category: string;
  ledger_scope: FinanceLedgerScope;
  counterpartyLabel: string;
  personPhone?: string | null;
  partyTypeLabel?: string | null;
  profileImageUrl?: string | null;
  description: string;
  receipt_urls: string[];
  hotelName: string;
  /** PDF üst başlık; boşsa hotelName */
  documentBrandTitle?: string;
  creatorName?: string | null;
  created_at: string;
  isStripe?: boolean;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shortRef(id: string): string {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function escAttrUrl(url: string): string {
  return url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

export function buildFinanceMovementReceiptCaption(input: FinanceMovementReceiptInput): string {
  const doc = input.kind === 'income' ? 'Tahsilat' : 'Ödeme';
  return `${input.hotelName} · ${doc} belgesi · ${fmtMoneyTry(input.amount)} · #${shortRef(input.id)}`;
}

/** Yazıcı e-postası — kısa konu (SMTP / HP ePrint uyumu) */
export function buildFinanceMovementReceiptPrinterSubject(input: FinanceMovementReceiptInput): string {
  const doc = input.kind === 'income' ? 'Tahsilat' : 'Odeme';
  return `Valoria ${doc} fisi #${shortRef(input.id)} - ${fmtMoneyTry(input.amount)}`;
}

export type FinanceMovementReceiptHtmlOptions = {
  /** false = yazıcı mail için hafif PDF (uzak fiş fotoğrafları gömülmez) */
  includeReceiptPhotos?: boolean;
};

export function buildFinanceMovementReceiptHtml(
  input: FinanceMovementReceiptInput,
  options?: FinanceMovementReceiptHtmlOptions
): string {
  const includeReceiptPhotos = options?.includeReceiptPhotos !== false;
  const isIncome = input.kind === 'income';
  const receiptNo = shortRef(input.id);
  const amount = fmtMoneyTry(input.amount);
  const paymentLabel = input.isStripe
    ? 'Kart (Stripe POS)'
    : PAYMENT_METHOD_LABELS[input.payment_method as MovementPaymentMethod] ??
      String(input.payment_method || '—');
  const created = formatDateShort(new Date());
  const footer = resolveFinanceReportFooter({
    organizationName: input.hotelName,
    documentBrandTitle: input.documentBrandTitle,
  });
  const brandTitle = footer.documentBrandTitle || input.documentBrandTitle || DEFAULT_FINANCE_DOCUMENT_BRAND;

  const docBadge = isIncome ? 'TAHSİLAT BELGESİ' : 'ÖDEME BELGESİ';
  const docTitle = isIncome ? 'Alınan tahsilat' : 'Yapılan ödeme';
  const amountLbl = isIncome ? 'Tahsil edilen tutar' : 'Ödenen tutar';
  const rowKind = isIncome ? 'Tahsilat' : 'Ödeme';
  const tone = isIncome ? 'income' : 'expense';
  const statement = isIncome
    ? 'Bu belgede yalnızca aşağıdaki tek tahsilat kaydı yer almaktadır.'
    : 'Bu belgede yalnızca aşağıdaki tek ödeme kaydı yer almaktadır.';

  const hasPerson =
    (input.counterpartyLabel?.trim() && input.counterpartyLabel.trim() !== '—') ||
    !!input.personPhone?.trim() ||
    !!input.partyTypeLabel?.trim();

  const personCard = hasPerson
    ? buildReportPersonInfoCard({
        name: input.counterpartyLabel?.trim() || '—',
        phone: input.personPhone,
        partyTypeLabel: input.partyTypeLabel,
        lines: [
          `Kapsam: ${LEDGER_SCOPE_LABELS[input.ledger_scope] ?? input.ledger_scope}`,
          `Kategori: ${resolveCategoryLabel(input.category)}`,
        ],
        profileImageUrl: input.profileImageUrl,
      })
    : '';

  const singleRow = `<tr>
    <td>${escapeHtml(formatDateShort(input.movement_date))}</td>
    <td><strong>${escapeHtml(rowKind)}</strong></td>
    <td>${escapeHtml(resolveCategoryLabel(input.category))}</td>
    <td>${escapeHtml(LEDGER_SCOPE_LABELS[input.ledger_scope] ?? input.ledger_scope)}</td>
    <td>${escapeHtml(paymentLabel)}</td>
    <td class="amt ${tone}">${escapeHtml(amount)}</td>
  </tr>`;

  const noteHtml = input.description?.trim()
    ? `<div class="noteBox"><strong>Açıklama</strong><p>${escapeHtml(input.description.trim())}</p></div>`
    : '';

  const metaLines = [
    input.creatorName?.trim() ? `Kaydeden: ${escapeHtml(input.creatorName.trim())}` : '',
    `Sistem kayıt: ${escapeHtml(formatDateShort(input.created_at))}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const receiptImgs = includeReceiptPhotos
    ? (input.receipt_urls ?? []).map((u) => safeReportImageUrl(u)).filter((u): u is string => !!u)
    : [];

  const attachHtml =
    receiptImgs.length > 0
      ? `<div class="attachments">
  <h2 class="section">Ekler — fiş / belge görselleri</h2>
  <div class="attachGrid">${receiptImgs
    .map((url) => `<img class="attachImg" src="${escAttrUrl(url)}" alt="Fiş eki"/>`)
    .join('')}</div>
</div>`
      : !includeReceiptPhotos && (input.receipt_urls?.length ?? 0) > 0
        ? `<p class="statement">Not: Fiş fotoğrafları kayıtta mevcuttur; bu yazıcı gönderiminde hafif PDF kullanıldı (görseller eklenmedi).</p>`
        : '';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(docBadge)} · ${escapeHtml(receiptNo)}</title>
  <style>${RECEIPT_CSS}</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="brand">${escapeHtml(brandTitle)}</div>
      <div class="brandSub">${escapeHtml(input.hotelName)} · Muhasebe</div>
    </div>
    <div class="headerMeta">
      <strong>Belge no</strong>
      ${escapeHtml(receiptNo)}<br/>
      Belge tarihi: ${escapeHtml(created)}<br/>
      İşlem tarihi: ${escapeHtml(formatDateShort(input.movement_date))}
    </div>
  </div>

  <span class="docBadge ${isIncome ? 'badgeIncome' : 'badgeExpense'}">${escapeHtml(docBadge)}</span>
  <h1 class="docTitle">${escapeHtml(docTitle)}</h1>
  <p class="docSub">Tek kayıt belgesi (liste veya özet değil)</p>

  <div class="amountBlock ${tone}">
    <div>
      <div class="amountLbl">${escapeHtml(amountLbl)}</div>
      <div class="amountVal ${tone}">${escapeHtml(amount)}</div>
    </div>
    <div class="amountRef">
      Fiş no: ${escapeHtml(receiptNo)}<br/>
      ${metaLines}
    </div>
  </div>

  <p class="statement">${escapeHtml(statement)}</p>

  <h2 class="section">İşlem özeti (1 kayıt)</h2>
  <table class="data">
    <thead>
      <tr>
        <th>Tarih</th>
        <th>İşlem</th>
        <th>Kategori</th>
        <th>Kapsam</th>
        <th>Ödeme</th>
        <th style="text-align:right">Tutar</th>
      </tr>
    </thead>
    <tbody>${singleRow}</tbody>
  </table>

  ${noteHtml}
  ${attachHtml}

  <div class="footer">
    <div class="footerOrg">${escapeHtml(footer.organizationLine)}</div>
    <div class="footerDisclaimer">${escapeHtml(footer.disclaimer ?? DEFAULT_FINANCE_REPORT_DISCLAIMER)}</div>
    <div class="footerBrand">${escapeHtml(footer.documentBrandTitle)}</div>
  </div>
</div>
</body>
</html>`;
}

export async function createMovementReceiptPdfFile(
  input: FinanceMovementReceiptInput,
  opts?: { forPrinterEmail?: boolean }
): Promise<{ uri: string; fileName: string; html: string }> {
  const html = buildFinanceMovementReceiptHtml(input, {
    includeReceiptPhotos: !opts?.forPrinterEmail,
  });
  const file = await Print.printToFileAsync(
    opts?.forPrinterEmail
      ? { html, base64: false }
      : {
          html,
          width: 595,
          height: 842,
          margins: { top: 48, bottom: 48, left: 40, right: 40 },
        }
  );
  const uri = file?.uri;
  if (!uri) throw new Error('PDF oluşturulamadı');
  const prefix = input.kind === 'income' ? 'tahsilat' : 'gider';
  return { uri, fileName: `${prefix}-fis-${shortRef(input.id)}.pdf`, html };
}

function ensureFileUri(uri: string): string {
  return uri.startsWith('file://') ? uri : `file://${uri}`;
}

async function trySharePdf(
  uri: string,
  caption: string,
  fileName: string,
  whatsappOnly: boolean
): Promise<boolean> {
  if (Platform.OS === 'web' || !TurboModuleRegistry.get('RNShare')) return false;
  try {
    const RNShare = require('react-native-share').default as {
      open: (options: Record<string, unknown>) => Promise<unknown>;
      Social: { WHATSAPP: string };
    };
    const options: Record<string, unknown> = {
      title: caption,
      subject: fileName,
      message: caption,
      url: ensureFileUri(uri),
      type: 'application/pdf',
      failOnCancel: false,
    };
    if (whatsappOnly) options.social = RNShare.Social.WHATSAPP;
    await RNShare.open(options);
    return true;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e ?? '');
    if (/cancel|did not share|User did not/i.test(msg)) return true;
    return false;
  }
}

export async function shareFinanceMovementReceiptPdf(input: FinanceMovementReceiptInput): Promise<void> {
  const caption = buildFinanceMovementReceiptCaption(input);
  const { uri, fileName } = await createMovementReceiptPdfFile(input);
  if (await trySharePdf(uri, caption, fileName, false)) return;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Fiş PDF',
      UTI: 'com.adobe.pdf',
    });
    return;
  }
  Alert.alert('PDF hazır', uri);
}

export async function printFinanceMovementReceipt(input: FinanceMovementReceiptInput): Promise<void> {
  const { html, uri } = await createMovementReceiptPdfFile(input);
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
  } else {
    await Print.printAsync({ uri });
  }
}

/** Ayarlardaki yazıcı e-postasına PDF (diğer muhasebe raporlarındaki “Yazıcı mail”). */
export async function mailFinanceMovementReceiptToPrinter(
  input: FinanceMovementReceiptInput
): Promise<void> {
  const subject = buildFinanceMovementReceiptPrinterSubject(input);
  const { uri, fileName } = await createMovementReceiptPdfFile(input, { forPrinterEmail: true });
  const pdfName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  await sendPdfToPrinterEmail({
    pdfUri: uri,
    subject,
    fileName: pdfName,
  });
  Alert.alert('Gönderildi', 'Fiş yazıcı e-posta adresine iletildi.');
}

export async function shareFinanceMovementReceiptWhatsApp(
  input: FinanceMovementReceiptInput
): Promise<void> {
  const caption = buildFinanceMovementReceiptCaption(input);
  const { uri, fileName } = await createMovementReceiptPdfFile(input);
  if (await trySharePdf(uri, caption, fileName, true)) return;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'WhatsApp — fiş PDF',
      UTI: 'com.adobe.pdf',
    });
    return;
  }
  Alert.alert('WhatsApp', 'Bu cihazda PDF paylaşımı desteklenmiyor.');
}

/** Tek fiş PDF — hareket detayı / liste satırları */
export const FINANCE_MOVEMENT_RECEIPT_SELECT = `
  id,
  organization_id,
  counterparty_id,
  kind,
  amount,
  movement_date,
  payment_method,
  category,
  counterparty_name,
  description,
  receipt_urls,
  created_at,
  source_payment_request_id,
  counterparty:counterparty_id(name, phone, party_type, profile_image),
  guest:guest_id(full_name),
  creator:created_by_staff_id(full_name)
`;

export async function loadFinanceMovementReceiptInput(
  movementId: string,
  selectedOrg?: { name?: string | null; finance_report_brand?: string | null } | null
): Promise<FinanceMovementReceiptInput> {
  let { data, error } = await supabase
    .from('finance_movements')
    .select(`${FINANCE_MOVEMENT_RECEIPT_SELECT}, ledger_scope`)
    .eq('id', movementId)
    .single();
  if (error?.message?.includes('ledger_scope')) {
    const res = await supabase
      .from('finance_movements')
      .select(FINANCE_MOVEMENT_RECEIPT_SELECT)
      .eq('id', movementId)
      .single();
    data = res.data;
    error = res.error;
  }
  if (error || !data) {
    throw new Error(error?.message ?? 'Kayıt bulunamadı');
  }
  return prepareFinanceMovementReceiptInput(
    data as Parameters<typeof prepareFinanceMovementReceiptInput>[0],
    selectedOrg
  );
}

export async function prepareFinanceMovementReceiptInput(
  row: {
    id: string;
    organization_id: string;
    kind: FinanceMovementKind;
    amount: number;
    movement_date: string;
    payment_method: string;
    category: string;
    ledger_scope?: FinanceLedgerScope;
    counterparty_name: string | null;
    description: string;
    receipt_urls: string[] | null;
    created_at: string;
    source_payment_request_id?: string | null;
    counterparty?: {
      name: string;
      phone?: string | null;
      party_type?: string | null;
      profile_image?: string | null;
    } | null;
    guest?: { full_name: string | null } | null;
    creator?: { full_name: string | null } | null;
  },
  selectedOrg?: { name?: string | null; finance_report_brand?: string | null } | null
): Promise<FinanceMovementReceiptInput> {
  let branding: FinanceReportBranding;
  if (selectedOrg?.name?.trim()) {
    branding = resolveFinanceReportBranding(selectedOrg);
  } else {
    const { data: org } = await supabase
      .from('organizations')
      .select('name, finance_report_brand')
      .eq('id', row.organization_id)
      .maybeSingle();
    branding = resolveFinanceReportBranding({
      organizationName: org?.name,
      financeReportBrand: (org as { finance_report_brand?: string | null } | null)?.finance_report_brand,
    });
  }
  const orgName = branding.organizationName;
  const documentBrandTitle = branding.documentBrandTitle;

  const who =
    row.guest?.full_name?.trim() ||
    row.counterparty?.name?.trim() ||
    row.counterparty_name?.trim() ||
    '—';
  const partyType = row.counterparty?.party_type;
  const partyTypeLabel = partyType
    ? (COUNTERPARTY_TYPE_LABELS[partyType as keyof typeof COUNTERPARTY_TYPE_LABELS] ?? partyType)
    : null;

  return {
    id: row.id,
    kind: row.kind,
    amount: Number(row.amount),
    movement_date: row.movement_date,
    payment_method: row.payment_method,
    category: row.category,
    ledger_scope: row.ledger_scope ?? 'hotel',
    counterpartyLabel: who,
    personPhone: row.counterparty?.phone ?? null,
    partyTypeLabel: partyTypeLabel,
    profileImageUrl: row.counterparty?.profile_image ?? null,
    description: row.description ?? '',
    receipt_urls: Array.isArray(row.receipt_urls) ? row.receipt_urls : [],
    hotelName: orgName,
    documentBrandTitle,
    creatorName: row.creator?.full_name ?? null,
    created_at: row.created_at,
    isStripe: !!row.source_payment_request_id,
  };
}
