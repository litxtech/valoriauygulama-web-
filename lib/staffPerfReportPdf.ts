/**
 * Resmi Personel Denetim & Performans PDF raporu (İK dosyası kalitesinde).
 */
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { sendPdfToPrinterEmail } from '@/lib/printerEmail';
import {
  DEFAULT_FINANCE_DOCUMENT_BRAND,
  type FinanceReportBranding,
} from '@/lib/financeReportBranding';
import { getPerfBand, formatPerfScore } from '@/lib/staffPerfBands';
import type { StaffPerfAiPayload } from '@/lib/staffPerfAiEvaluation';
import type { StaffPerfEvent, StaffPerfScoreLog } from '@/lib/staffPerfSystem';

function esc(v: string | null | undefined): string {
  return String(v ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function yn(v: { answer: boolean; rationale: string }): string {
  return `<strong>${v.answer ? 'Evet' : 'Hayır'}</strong> — ${esc(v.rationale)}`;
}

export type StaffPerfReportInput = {
  branding?: FinanceReportBranding;
  reportNumber: string;
  generatedAt?: string;
  preparedByName: string;
  approvedByName?: string | null;
  staff: {
    fullName: string;
    department?: string | null;
    position?: string | null;
    role?: string | null;
    hireDate?: string | null;
    phone?: string | null;
    address?: string | null;
    personnelNo?: string | null;
    profileImageUrl?: string | null;
    familyMother?: string | null;
    familyFather?: string | null;
    familySpouse?: string | null;
    familyChildren?: string | null;
    emergencyName?: string | null;
    emergencyPhone?: string | null;
    education?: string | null;
    certificates?: string | null;
    achievements?: string | null;
  };
  score: number;
  events: StaffPerfEvent[];
  scoreLog: StaffPerfScoreLog[];
  ai?: StaffPerfAiPayload | null;
  officialDecision?: string | null;
  verifyPayload?: string;
};

export function buildStaffPerfReportHtml(input: StaffPerfReportInput): string {
  const brand = input.branding?.documentBrandTitle || DEFAULT_FINANCE_DOCUMENT_BRAND;
  const orgName = input.branding?.organizationName || DEFAULT_FINANCE_DOCUMENT_BRAND;
  const band = getPerfBand(input.score);
  const when = input.generatedAt ?? new Date().toISOString();
  const verify = encodeURIComponent(
    input.verifyPayload ?? `VALORIA-PERF:${input.reportNumber}:${input.staff.fullName}:${input.score}`
  );
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=88x88&data=${verify}`;

  const positives = input.events.filter((e) => e.delta_points > 0);
  const negatives = input.events.filter((e) => e.delta_points < 0);

  const eventRows = input.events
    .slice(0, 40)
    .map(
      (e) => `<tr>
      <td>${esc(e.report_number)}</td>
      <td>${esc(fmtDateTime(e.conducted_at))}</td>
      <td>${esc(e.title)}</td>
      <td class="${e.delta_points > 0 ? 'pos' : 'neg'}">${e.delta_points > 0 ? '+' : ''}${e.delta_points}</td>
      <td>${e.score_before} → ${e.score_after}</td>
      <td>${esc(e.note)}</td>
    </tr>`
    )
    .join('');

  const logRows = input.scoreLog
    .slice(0, 30)
    .map(
      (l) => `<tr>
      <td>${esc(fmtDateTime(l.logged_at))}</td>
      <td>${l.score_before}</td>
      <td>${l.score_after}</td>
      <td class="${l.delta_points > 0 ? 'pos' : 'neg'}">${l.delta_points > 0 ? '+' : ''}${l.delta_points}</td>
      <td>${esc(l.reason)}</td>
    </tr>`
    )
    .join('');

  const ai = input.ai;
  const aiBlock = ai
    ? `<section class="sec">
        <h2>Yapay Zekâ — Gelecek Yıl Değerlendirmesi</h2>
        <div class="grid2">
          <div class="qa"><span>Otelde tutulmalı mı?</span><p>${yn(ai.retain_next_year)}</p></div>
          <div class="qa"><span>Terfi alabilir mi?</span><p>${yn(ai.promotion_eligible)}</p></div>
          <div class="qa"><span>Şef olabilir mi?</span><p>${yn(ai.can_be_supervisor)}</p></div>
          <div class="qa"><span>Maaş artışı öneriliyor mu?</span><p>${yn(ai.salary_increase)}</p></div>
          <div class="qa"><span>Eğitime gönderilmeli mi?</span><p>${yn(ai.needs_training)}</p></div>
          <div class="qa"><span>Departman değişmeli mi?</span><p>${yn(ai.department_change)}</p></div>
          <div class="qa"><span>İşten ayrılma riski?</span><p>${yn(ai.attrition_risk)}</p></div>
          <div class="qa"><span>Uzun vadeli katkı?</span><p>${yn(ai.long_term_contribution)}</p></div>
        </div>
        <p><strong>Misafir memnuniyetine etkisi:</strong> ${esc(ai.guest_impact)}</p>
        <p><strong>Takım üzerindeki etkisi:</strong> ${esc(ai.team_impact)}</p>
        <p><strong>Risk analizi:</strong> ${esc(ai.risk_analysis)}</p>
        <div class="gm"><strong>Genel Yönetici Yorumu</strong><p>${esc(ai.general_manager_comment)}</p></div>
      </section>`
    : '';

  const photo = input.staff.profileImageUrl
    ? `<img class="avatar" src="${esc(input.staff.profileImageUrl)}" alt=""/>`
    : `<div class="avatar ph">VK</div>`;

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${esc(input.reportNumber)} — Personel Performans Raporu</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 16mm 14mm 18mm 14mm;
      @bottom-center {
        content: "Sayfa " counter(page) " / " counter(pages);
        font-size: 9px;
        color: #64748b;
        font-family: 'Segoe UI', Arial, sans-serif;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 10.5px;
      line-height: 1.45;
      color: #0f172a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .letterhead {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid #0f3d3a;
      padding-bottom: 10px;
      margin-bottom: 14px;
      gap: 12px;
    }
    .brand-mark {
      width: 52px; height: 52px; border-radius: 8px;
      background: linear-gradient(145deg, #0f3d3a, #1a6b64);
      color: #f8fafc; font-weight: 800; font-size: 18px;
      display: flex; align-items: center; justify-content: center;
      letter-spacing: 0.5px;
    }
    .brand h1 { margin: 0; font-size: 18px; color: #0f3d3a; letter-spacing: 0.4px; }
    .brand .sub { color: #475569; font-size: 10px; margin-top: 2px; }
    .meta { text-align: right; font-size: 9.5px; color: #334155; }
    .meta strong { color: #0f172a; }
    .doc-title {
      text-align: center; margin: 12px 0 14px;
      font-size: 14px; font-weight: 800; letter-spacing: 1.2px;
      text-transform: uppercase; color: #0f3d3a;
    }
    .hero {
      display: grid; grid-template-columns: 72px 1fr 120px; gap: 12px;
      border: 1px solid #cbd5e1; padding: 10px; margin-bottom: 12px;
      background: linear-gradient(180deg, #f8fafc, #fff);
    }
    .avatar { width: 72px; height: 72px; object-fit: cover; border-radius: 6px; border: 1px solid #cbd5e1; }
    .avatar.ph {
      display: flex; align-items: center; justify-content: center;
      background: #e2e8f0; color: #475569; font-weight: 800;
    }
    .score-box {
      border: 2px solid ${band.color}; background: ${band.bg};
      border-radius: 8px; text-align: center; padding: 8px 6px;
    }
    .score-box .n { font-size: 22px; font-weight: 800; color: ${band.color}; }
    .score-box .l { font-size: 9px; font-weight: 700; color: ${band.color}; margin-top: 2px; }
    .sec { margin: 14px 0; page-break-inside: avoid; }
    .sec h2 {
      margin: 0 0 8px; font-size: 11.5px; color: #0f3d3a;
      border-left: 3px solid #1a6b64; padding-left: 8px; letter-spacing: 0.3px;
    }
    table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
    th, td { border: 1px solid #e2e8f0; padding: 5px 6px; text-align: left; vertical-align: top; }
    th { background: #0f3d3a; color: #f8fafc; font-weight: 700; }
    .pos { color: #047857; font-weight: 700; }
    .neg { color: #b91c1c; font-weight: 700; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
    .qa { border: 1px solid #e2e8f0; padding: 6px 8px; background: #f8fafc; }
    .qa span { display: block; font-size: 9px; color: #64748b; font-weight: 700; margin-bottom: 2px; }
    .qa p { margin: 0; }
    .gm { border: 1px solid #99f6e4; background: #f0fdfa; padding: 8px 10px; margin-top: 8px; }
    .gm p { margin: 4px 0 0; }
    .kv { display: grid; grid-template-columns: 140px 1fr; gap: 3px 8px; }
    .kv .k { color: #64748b; }
    .sigs {
      display: grid; grid-template-columns: 1fr 1fr; gap: 24px;
      margin-top: 28px; page-break-inside: avoid;
    }
    .sig-box {
      border-top: 1px solid #94a3b8; padding-top: 8px; min-height: 72px;
    }
    .sig-box .lbl { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; }
    .sig-box .name { margin-top: 28px; font-weight: 700; }
    .decision {
      border: 2px solid #0f3d3a; padding: 10px; margin-top: 12px;
      background: #f8fafc;
    }
    .foot {
      margin-top: 18px; padding-top: 8px; border-top: 1px solid #cbd5e1;
      display: flex; justify-content: space-between; align-items: flex-end;
      font-size: 9px; color: #64748b;
    }
    .chips { display: flex; gap: 8px; margin: 8px 0 0; flex-wrap: wrap; }
    .chip { border: 1px solid #cbd5e1; padding: 4px 8px; border-radius: 4px; background: #fff; }
    .chip b { color: #0f3d3a; }
  </style>
</head>
<body>
  <div class="letterhead">
    <div style="display:flex;gap:10px;align-items:center">
      <div class="brand-mark">VH</div>
      <div class="brand">
        <h1>${esc(brand)}</h1>
        <div class="sub">İnsan Kaynakları · Personel Denetim ve Performans Sistemi</div>
        <div class="sub">${esc(orgName)}</div>
      </div>
    </div>
    <div class="meta">
      <div><strong>Rapor No:</strong> ${esc(input.reportNumber)}</div>
      <div><strong>Tarih:</strong> ${esc(fmtDateTime(when))}</div>
      <div style="margin-top:6px"><img src="${qrUrl}" width="72" height="72" alt="QR"/></div>
      <div>Doğrulama QR</div>
    </div>
  </div>

  <div class="doc-title">Resmi Personel Performans Raporu</div>

  <div class="hero">
    ${photo}
    <div>
      <div style="font-size:15px;font-weight:800">${esc(input.staff.fullName)}</div>
      <div class="kv" style="margin-top:6px">
        <div class="k">Departman</div><div>${esc(input.staff.department)}</div>
        <div class="k">Görev / Rol</div><div>${esc(input.staff.position || input.staff.role)}</div>
        <div class="k">İşe giriş</div><div>${esc(input.staff.hireDate)}</div>
        <div class="k">Personel no</div><div>${esc(input.staff.personnelNo)}</div>
        <div class="k">Telefon</div><div>${esc(input.staff.phone)}</div>
      </div>
    </div>
    <div class="score-box">
      <div class="n">${formatPerfScore(input.score)}</div>
      <div class="l">${esc(band.labelTr)}</div>
    </div>
  </div>

  <div class="chips">
    <div class="chip">Artı olay: <b>${positives.length}</b></div>
    <div class="chip">Eksi olay: <b>${negatives.length}</b></div>
    <div class="chip">Toplam denetim: <b>${input.events.length}</b></div>
  </div>

  <section class="sec">
    <h2>Kimlik ve Aile Bilgileri</h2>
    <div class="kv">
      <div class="k">İkamet</div><div>${esc(input.staff.address)}</div>
      <div class="k">Anne</div><div>${esc(input.staff.familyMother)}</div>
      <div class="k">Baba</div><div>${esc(input.staff.familyFather)}</div>
      <div class="k">Eş</div><div>${esc(input.staff.familySpouse)}</div>
      <div class="k">Çocuk</div><div>${esc(input.staff.familyChildren)}</div>
      <div class="k">Acil kişi</div><div>${esc(input.staff.emergencyName)} · ${esc(input.staff.emergencyPhone)}</div>
      <div class="k">Eğitim</div><div>${esc(input.staff.education)}</div>
      <div class="k">Sertifikalar</div><div>${esc(input.staff.certificates)}</div>
      <div class="k">Ödüller</div><div>${esc(input.staff.achievements)}</div>
    </div>
  </section>

  <section class="sec">
    <h2>Denetim Geçmişi (Artı / Eksi Olaylar)</h2>
    <table>
      <thead>
        <tr>
          <th>Kayıt No</th><th>Tarih / Saat</th><th>Olay</th><th>Puan</th><th>Skor</th><th>Not</th>
        </tr>
      </thead>
      <tbody>
        ${eventRows || '<tr><td colspan="6">Kayıt yok</td></tr>'}
      </tbody>
    </table>
  </section>

  <section class="sec">
    <h2>Puan Değişim Logu</h2>
    <table>
      <thead>
        <tr><th>Tarih / Saat</th><th>Önce</th><th>Sonra</th><th>Delta</th><th>Gerekçe</th></tr>
      </thead>
      <tbody>
        ${logRows || '<tr><td colspan="5">Log yok</td></tr>'}
      </tbody>
    </table>
  </section>

  ${aiBlock}

  <section class="sec">
    <h2>Sonuç ve Resmi Karar</h2>
    <div class="decision">
      <p><strong>Genel başarı puanı:</strong> ${formatPerfScore(input.score)} — ${esc(band.labelTr)}</p>
      <p>${esc(
        input.officialDecision ||
          ai?.general_manager_comment ||
          'Bu rapor İnsan Kaynakları personel dosyasına konulmak üzere hazırlanmıştır.'
      )}</p>
    </div>
  </section>

  <div class="sigs">
    <div class="sig-box">
      <div class="lbl">Hazırlayan · Elektronik imza</div>
      <div class="name">${esc(input.preparedByName)}</div>
    </div>
    <div class="sig-box">
      <div class="lbl">Onaylayan · Elektronik imza</div>
      <div class="name">${esc(input.approvedByName || '………………………………')}</div>
    </div>
  </div>

  <div class="foot">
    <div>
      ${esc(brand)} · Gizli / İnsan Kaynakları<br/>
      Bu belge silinemez denetim kayıtlarına dayanır. QR ile doğrulanabilir.
    </div>
    <div style="text-align:right">
      ${esc(input.reportNumber)}<br/>
      Sayfa numarası yazdırma motoru tarafından eklenir
    </div>
  </div>
</body>
</html>`;
}

export async function exportStaffPerfReportPdf(input: StaffPerfReportInput): Promise<string> {
  const html = buildStaffPerfReportHtml(input);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (Platform.OS === 'web') {
    await sendPdfToPrinterEmail({
      pdfUri: uri,
      subject: `Performans Raporu ${input.reportNumber}`,
      fileName: `${input.reportNumber}.pdf`,
    });
  } else if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Performans Raporu ${input.reportNumber}`,
      UTI: 'com.adobe.pdf',
    });
  }
  return uri;
}
