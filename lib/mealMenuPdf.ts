import { Alert } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { escapeHtmlMealMenu, formatTrFullDayLabelFromYmd } from '@/lib/mealMenuDate';
import { sendPdfToPrinterEmail } from '@/lib/printerEmail';
import type { MealFields } from '@/lib/mealMenuUi';

function dayHasMealContent(fields: MealFields): boolean {
  return !!(fields.breakfast?.trim() || fields.lunch?.trim() || fields.dinner?.trim());
}

export const DEFAULT_MEAL_MENU_PDF_APPROVER = 'Soner Toprak';

export const DEFAULT_MEAL_MENU_PDF_FOOTER_NOTE =
  'Otel kuralları gereği yemek listesi eksiksiz uygulanacaktır. Her yemekten örnek alınıp 1 hafta buzdolabında muhafaza edilecektir.';

export type MealMenuPdfDay = {
  ymd: string;
  fields: MealFields;
};

export type MealMenuPdfInput = {
  hotelName: string;
  periodLabel: string;
  approverName: string;
  footerNote: string;
  days: MealMenuPdfDay[];
};

function pdfScale(rowCount: number) {
  if (rowCount <= 18) {
    return { title: 17, sub: 12, th: 9.5, td: 9.5, date: 8.5, footer: 9, pad: 6, line: 1.35, dateW: '24%', headMb: 10, footMt: 12 };
  }
  if (rowCount <= 24) {
    return { title: 16, sub: 11, th: 8.5, td: 8.5, date: 8, footer: 8.5, pad: 5, line: 1.3, dateW: '25%', headMb: 8, footMt: 10 };
  }
  if (rowCount <= 28) {
    return { title: 15, sub: 10.5, th: 8, td: 8, date: 7.5, footer: 8, pad: 4, line: 1.25, dateW: '26%', headMb: 8, footMt: 10 };
  }
  /* 29–31 günlük tam ay: tek A4 için sıkı düzen */
  if (rowCount <= 31) {
    return { title: 13, sub: 9.5, th: 7, td: 7, date: 6.5, footer: 7, pad: 2, line: 1.12, dateW: '27%', headMb: 6, footMt: 8 };
  }
  return { title: 12, sub: 9, th: 6.5, td: 6.5, date: 6, footer: 6.5, pad: 2, line: 1.1, dateW: '27%', headMb: 5, footMt: 6 };
}

export function mealMenuPdfRowsFromDays(days: MealMenuPdfDay[]): MealMenuPdfDay[] {
  return days.filter((d) => dayHasMealContent(d.fields));
}

export function buildMealMenuPdfHtml(input: MealMenuPdfInput): string {
  const rows = mealMenuPdfRowsFromDays(input.days);
  const sc = pdfScale(Math.max(rows.length, 1));
  const hotel = escapeHtmlMealMenu(input.hotelName.trim() || 'Otel');
  const period = escapeHtmlMealMenu(input.periodLabel);
  const approver = escapeHtmlMealMenu(input.approverName.trim() || DEFAULT_MEAL_MENU_PDF_APPROVER);
  const note = escapeHtmlMealMenu(input.footerNote.trim() || DEFAULT_MEAL_MENU_PDF_FOOTER_NOTE);

  const tableBody = rows
    .map((d) => {
      const f = d.fields;
      const dateCell = escapeHtmlMealMenu(formatTrFullDayLabelFromYmd(d.ymd));
      const b = f.breakfast.trim() ? escapeHtmlMealMenu(f.breakfast) : '—';
      const l = f.lunch.trim() ? escapeHtmlMealMenu(f.lunch) : '—';
      const di = f.dinner.trim() ? escapeHtmlMealMenu(f.dinner) : '—';
      return `<tr>
        <td class="date">${dateCell}</td>
        <td>${b}</td>
        <td>${l}</td>
        <td>${di}</td>
      </tr>`;
    })
    .join('');

  const emptyRow =
  rows.length === 0
    ? `<tr><td colspan="4" class="empty">Bu ay için kayıtlı yemek bulunmuyor.</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${hotel} — Aylık yemek listesi ${period}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm 11mm 12mm 11mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #111827;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page { width: 100%; max-width: 190mm; margin: 0 auto; }
    .head { border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: ${sc.headMb}px; }
    .hotel { font-size: ${sc.title}px; font-weight: 800; margin: 0 0 4px; letter-spacing: -0.02em; }
    .period { font-size: ${sc.sub}px; font-weight: 700; margin: 0; color: #1e293b; }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: ${sc.td}px;
      line-height: ${sc.line};
    }
    th {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: ${sc.pad}px 5px;
      font-size: ${sc.th}px;
      font-weight: 700;
      text-align: left;
      vertical-align: middle;
    }
    td {
      border: 1px solid #e2e8f0;
      padding: ${sc.pad}px 5px;
      vertical-align: top;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
  td.date, th.date {
    width: ${sc.dateW};
    font-weight: 700;
    white-space: nowrap;
    font-size: ${sc.date}px;
    line-height: 1.15;
    vertical-align: top;
  }
  th:nth-child(1), td:nth-child(1) { width: ${sc.dateW}; }
  th:nth-child(2), td:nth-child(2) { width: calc((100% - ${sc.dateW}) / 3); }
  th:nth-child(3), td:nth-child(3) { width: calc((100% - ${sc.dateW}) / 3); }
  th:nth-child(4), td:nth-child(4) { width: calc((100% - ${sc.dateW}) / 3); }
    tr:nth-child(even) td { background: #fafafa; }
    .empty { text-align: center; color: #64748b; font-style: italic; padding: 12px; }
    .footer { margin-top: ${sc.footMt}px; border-top: 1px solid #cbd5e1; padding-top: 6px; }
    .note-title { font-size: ${sc.footer}px; font-weight: 700; color: #334155; margin: 0 0 2px; }
    .note { font-size: ${sc.footer}px; line-height: 1.35; color: #334155; margin: 0 0 6px; text-align: justify; }
    .sign { display: flex; justify-content: flex-end; margin-top: 4px; }
    .sign-box { min-width: 52%; border-top: 1px solid #0f172a; padding-top: 6px; text-align: center; }
    .sign-label { font-size: ${sc.footer}px; color: #64748b; margin: 0 0 4px; }
    .sign-name { font-size: ${sc.sub}px; font-weight: 700; margin: 0; }
  </style>
</head>
<body>
  <div class="page">
    <div class="head">
      <h1 class="hotel">${hotel}</h1>
      <p class="period">Aylık personel yemek listesi — ${period}</p>
    </div>
    <table>
      <thead>
        <tr>
          <th class="date">Tarih</th>
          <th>Kahvaltı</th>
          <th>Öğle yemeği</th>
          <th>Akşam yemeği</th>
        </tr>
      </thead>
      <tbody>
        ${tableBody}${emptyRow}
      </tbody>
    </table>
    <div class="footer">
      <p class="note-title">Not</p>
      <p class="note">${note}</p>
      <div class="sign">
        <div class="sign-box">
          <p class="sign-label">Hazırlayan</p>
          <p class="sign-name">${approver}</p>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function mealMenuPdfFileName(periodLabel: string): string {
  const safe = periodLabel
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9çğıöşü-]/gi, '');
  return `yemek-listesi-${safe || 'aylik'}.pdf`;
}

export function mealMenuPdfSubject(input: MealMenuPdfInput): string {
  const hotel = input.hotelName.trim() || 'Otel';
  return `Valoria Yemek Listesi - ${hotel} - ${input.periodLabel}`;
}

export async function generateMealMenuPdfFile(input: MealMenuPdfInput): Promise<string> {
  const rows = mealMenuPdfRowsFromDays(input.days);
  if (rows.length === 0) {
    throw new Error('Bu ay için yazdırılacak yemek kaydı bulunmuyor.');
  }
  const html = buildMealMenuPdfHtml(input);
  const { uri } = await Print.printToFileAsync({
    html,
    width: 595,
    height: 842,
    margins: { top: 28, bottom: 32, left: 32, right: 32 },
  });
  return uri;
}

export async function sendMealMenuPdfToPrinterEmail(input: MealMenuPdfInput, pdfUri: string): Promise<void> {
  await sendPdfToPrinterEmail({
    pdfUri,
    subject: mealMenuPdfSubject(input),
    fileName: mealMenuPdfFileName(input.periodLabel),
  });
}

export async function exportMealMenuPdf(input: MealMenuPdfInput): Promise<void> {
  let uri: string;
  try {
    uri = await generateMealMenuPdfFile(input);
  } catch (e: unknown) {
    Alert.alert('PDF', (e as Error)?.message ?? 'PDF oluşturulamadı.');
    return;
  }

  const canShare = await Sharing.isAvailableAsync();

  Alert.alert('Aylık yemek listesi PDF', 'Yazdırmak veya paylaşmak için bir seçenek seçin.', [
    {
      text: 'Yazdır',
      onPress: () => {
        Print.printAsync({ uri }).catch((e: unknown) => {
          Alert.alert('Hata', (e as Error)?.message ?? 'Yazdırılamadı');
        });
      },
    },
    {
      text: 'Yazıcıya Mail Gönder',
      onPress: () => {
        sendMealMenuPdfToPrinterEmail(input, uri)
          .then(() => Alert.alert('Gönderildi', 'Belge yazıcı e-posta adresine gönderildi.'))
          .catch((e: unknown) => Alert.alert('Hata', (e as Error)?.message ?? 'Yazıcıya gönderilemedi'));
      },
    },
    ...(canShare
      ? [
          {
            text: 'Paylaş / Kaydet',
            onPress: () => {
              Sharing.shareAsync(uri, {
                mimeType: 'application/pdf',
                dialogTitle: 'Aylık yemek listesi PDF',
                UTI: 'com.adobe.pdf',
              }).catch((e: unknown) => {
                Alert.alert('Hata', (e as Error)?.message ?? 'Paylaşılamadı');
              });
            },
          } as const,
        ]
      : []),
    { text: 'İptal', style: 'cancel' },
  ]);
}
