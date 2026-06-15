import { Alert, Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { sendPdfToPrinterEmail } from '@/lib/printerEmail';
import { contractTypeLabel } from '@/lib/managedContracts/constants';
import type { ManagedContractDetail } from '@/lib/managedContracts/types';

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

function partyBlock(parties: ManagedContractDetail['parties'], side: 'party_1' | 'party_2'): string {
  const list = parties.filter((p) => p.party_side === side);
  if (list.length === 0) return '<p>—</p>';
  return list
    .map((p) => {
      const lines = [
        p.party_role ? `<strong>${escapeHtml(p.party_role)}</strong>` : '',
        p.company_name ? escapeHtml(p.company_name) : '',
        p.full_name ? escapeHtml(p.full_name) : '',
        p.is_authority && p.authority_title ? `Yetkili: ${escapeHtml(p.authority_title)}` : '',
        p.id_number ? `TC/VKN: ${escapeHtml(p.id_number)}` : p.tax_number ? `Vergi No: ${escapeHtml(p.tax_number)}` : '',
        p.phone ? `Tel: ${escapeHtml(p.phone)}` : '',
        p.email ? escapeHtml(p.email) : '',
        p.address ? escapeHtml(p.address) : '',
      ].filter(Boolean);
      return `<div class="party">${lines.map((l) => `<p>${l}</p>`).join('')}</div>`;
    })
    .join('');
}

function signatureBlock(signatures: ManagedContractDetail['signatures']): string {
  if (signatures.length === 0) {
    return '<p class="muted">Henüz imza yok.</p>';
  }
  return signatures
    .map((s) => {
      const img =
        s.signature_data?.startsWith('data:image') || s.signature_data?.startsWith('image/')
          ? `<img src="${s.signature_data.replace(/"/g, '&quot;')}" alt="imza"/>`
          : s.signature_method === 'typed_name' && s.signature_data
            ? `<p class="typed-sig">${escapeHtml(s.signature_data)}</p>`
            : '';
      return `<div class="sig-item">
        <p><strong>${escapeHtml(s.signer_name)}</strong>${s.signer_title ? ` — ${escapeHtml(s.signer_title)}` : ''}</p>
        ${img}
        <p class="muted">${formatDate(s.signed_at)} · ${escapeHtml(s.signature_method)} · v${s.version_no}</p>
      </div>`;
    })
    .join('');
}

export function buildManagedContractPdfHtml(detail: ManagedContractDetail, verifyUrl?: string): string {
  const c = detail.contract;
  const qrData = encodeURIComponent(verifyUrl ?? `VALORIA:${c.contract_number}:${c.id}`);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=72x72&data=${qrData}`;

  const bodyParas = escapeHtml(c.body_text || '')
    .split('\n')
    .map((line) => (line.trim() ? `<p>${line}</p>` : '<br/>'))
    .join('');

  const special =
    c.special_clauses?.trim()
      ? `<h3>Özel Maddeler</h3>${escapeHtml(c.special_clauses)
          .split('\n')
          .map((l) => (l.trim() ? `<p>${l}</p>` : ''))
          .join('')}`
      : '';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(c.contract_number)} — ${escapeHtml(c.title)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm 16mm 16mm 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, 'Times New Roman', Times, serif;
      font-size: 10.5pt;
      line-height: 1.45;
      color: #111827;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page { max-width: 178mm; margin: 0 auto; }
    .head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .head-left h1 { margin: 0 0 4px; font-size: 15pt; font-weight: 700; }
    .head-left .sub { margin: 0; font-size: 9.5pt; color: #475569; }
    .head-right { text-align: right; font-size: 9pt; }
    .head-right img { width: 56px; height: 56px; }
    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 14px;
      font-size: 9.5pt;
    }
    .meta-box {
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 8px 10px;
      background: #f8fafc;
    }
    .meta-box h4 { margin: 0 0 6px; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
    .party-box { border: 1px solid #e2e8f0; padding: 8px 10px; border-radius: 4px; min-height: 80px; }
    .party-box h4 { margin: 0 0 6px; font-size: 9pt; color: #334155; }
    .party p { margin: 0 0 3px; font-size: 9.5pt; }
    .body { margin-bottom: 12px; text-align: justify; }
    .body p { margin: 0 0 6px; }
    h3 { font-size: 11pt; margin: 14px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; page-break-inside: avoid; }
    .sig-item { border-top: 1px solid #94a3b8; padding-top: 8px; min-height: 70px; }
    .sig-item img { max-width: 140px; max-height: 48px; display: block; margin: 4px 0; }
    .typed-sig { font-family: 'Brush Script MT', cursive; font-size: 18pt; margin: 4px 0; }
    .muted { color: #64748b; font-size: 8.5pt; }
    .footer {
      margin-top: 18px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      font-size: 8pt;
      color: #64748b;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="head">
      <div class="head-left">
        <h1>${escapeHtml(c.title)}</h1>
        <p class="sub">${escapeHtml(contractTypeLabel(c.contract_type))} · Sürüm v${c.current_version_no}</p>
      </div>
      <div class="head-right">
        <img src="${qrUrl}" alt="QR"/>
        <p><strong>${escapeHtml(c.contract_number)}</strong></p>
      </div>
    </div>

    <div class="meta">
      <div class="meta-box">
        <h4>Tarihler</h4>
        <p>Başlangıç: ${formatDate(c.start_date)}</p>
        <p>Bitiş: ${formatDate(c.end_date)}</p>
        <p>Durum: ${escapeHtml(c.status)}</p>
      </div>
      <div class="meta-box">
        <h4>Belge</h4>
        <p>Oluşturulma: ${formatDate(c.created_at)}</p>
        <p>Onay: ${c.approved_at ? formatDate(c.approved_at) : '—'}</p>
      </div>
    </div>

    <div class="parties">
      <div class="party-box"><h4>Taraf 1</h4>${partyBlock(detail.parties, 'party_1')}</div>
      <div class="party-box"><h4>Taraf 2</h4>${partyBlock(detail.parties, 'party_2')}</div>
    </div>

    <div class="body">${bodyParas}</div>
    ${special}

    <h3>İmzalar</h3>
    <div class="signatures">${signatureBlock(detail.signatures)}</div>

    <div class="footer">
      ${escapeHtml(detail.parties.find((p) => p.party_side === 'party_1')?.company_name?.trim() || c.title)} · ${escapeHtml(c.contract_number)} · ${new Date().toLocaleString('tr-TR')}
    </div>
  </div>
</body>
</html>`;
}

export async function exportManagedContractPdf(
  detail: ManagedContractDetail,
  action: 'share' | 'print' | 'printer',
): Promise<void> {
  const html = buildManagedContractPdfHtml(detail);
  const file = await Print.printToFileAsync({ html, base64: false });
  const fileName = `${detail.contract.contract_number.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;

  if (action === 'printer') {
    await sendPdfToPrinterEmail({
      pdfUri: file.uri,
      subject: `Sözleşme: ${detail.contract.title} (${detail.contract.contract_number})`,
      fileName,
    });
    Alert.alert('Gönderildi', 'Sözleşme PDF yazıcı e-postasına iletildi.');
    return;
  }

  if (action === 'print') {
    if (Platform.OS === 'web') {
      await Print.printAsync({ html });
    } else {
      await Print.printAsync({ uri: file.uri });
    }
    return;
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: fileName });
  } else {
    Alert.alert('PDF hazır', file.uri);
  }
}
