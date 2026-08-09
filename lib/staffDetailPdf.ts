import { Platform } from 'react-native';
import { printToLocalPdfFile } from '@/lib/persistExpoPrintPdf';
import * as Sharing from 'expo-sharing';

export type StaffPdfData = {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  role?: string | null;
  department?: string | null;
  position?: string | null;
  organizationName?: string | null;
  address?: string | null;
  officeLocation?: string | null;
  hireDate?: string | null;
  terminationDate?: string | null;
  personnelNo?: string | null;
  sgkNo?: string | null;
  contractType?: string | null;
  emergency1Name?: string | null;
  emergency1Phone?: string | null;
  emergency2Name?: string | null;
  emergency2Phone?: string | null;
  achievements?: string | null;
  certificationsSummary?: string | null;
  previousWorkExperience?: string | null;
  drivesVehicle?: boolean | null;
  kvkkConsentAt?: string | null;
  notes?: string | null;
};

function esc(v: string | null | undefined): string {
  return String(v ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildStaffDetailHtml(data: StaffPdfData): string {
  const drivesVehicleText = data.drivesVehicle === true ? 'Evet' : 'Hayir';
  const contractTypeMap: Record<string, string> = {
    full_time: 'Belirsiz sureli',
    fixed_term: 'Belirli sureli',
    seasonal: 'Sezonluk',
    intern: 'Stajyer',
    other: 'Diger',
  };
  const contractTypeLabel = contractTypeMap[String(data.contractType ?? '').trim()] ?? esc(data.contractType);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    @page { size: A4; margin: 14mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; font-size: 11px; line-height: 1.35; }
    .head { border-bottom: 2px solid #1e293b; padding-bottom: 8px; margin-bottom: 10px; display:flex; justify-content:space-between; gap: 12px; }
    .title { font-size: 16px; font-weight: 800; letter-spacing: 0.3px; }
    .sub { color: #475569; font-size: 10px; margin-top: 3px; }
    .card { border: 1px solid #dbe2ea; border-radius: 8px; padding: 8px; margin-bottom: 8px; page-break-inside: avoid; }
    .sec { font-size: 12px; font-weight: 800; margin: 0 0 6px; color: #1e293b; }
    .row { display: grid; grid-template-columns: 130px 1fr; gap: 8px; margin: 2px 0; }
    .k { color: #475569; font-weight: 600; }
    .v { color: #0f172a; font-weight: 500; word-break: break-word; }
    .txt { white-space: pre-wrap; border-top: 1px dashed #cbd5e1; padding-top: 6px; margin-top: 6px; }
    .foot { margin-top: 10px; font-size: 10px; color: #64748b; text-align: right; }
  </style>
</head>
<body>
  <div class="head">
    <div>
      <div class="title">PERSONEL DETAY RAPORU</div>
      <div class="sub">Valoria Hotel - İnsan Kaynakları çıktısı</div>
    </div>
    <div class="sub">${new Date().toLocaleString('tr-TR')}</div>
  </div>

  <div class="card">
    <div class="sec">Kimlik ve İletişim</div>
    <div class="row"><div class="k">Ad Soyad</div><div class="v">${esc(data.fullName)}</div></div>
    <div class="row"><div class="k">E-posta</div><div class="v">${esc(data.email)}</div></div>
    <div class="row"><div class="k">Telefon</div><div class="v">${esc(data.phone)}</div></div>
    <div class="row"><div class="k">WhatsApp</div><div class="v">${esc(data.whatsapp)}</div></div>
    <div class="row"><div class="k">Adres</div><div class="v">${esc(data.address)}</div></div>
  </div>

  <div class="card">
    <div class="sec">Kurum Bilgisi</div>
    <div class="row"><div class="k">Calistigi Otel/Isletme</div><div class="v">${esc(data.organizationName)}</div></div>
    <div class="row"><div class="k">Rol</div><div class="v">${esc(data.role)}</div></div>
    <div class="row"><div class="k">Departman</div><div class="v">${esc(data.department)}</div></div>
    <div class="row"><div class="k">Gorev/Pozisyon</div><div class="v">${esc(data.position)}</div></div>
    <div class="row"><div class="k">Konum (Ofis)</div><div class="v">${esc(data.officeLocation)}</div></div>
    <div class="row"><div class="k">Personel No</div><div class="v">${esc(data.personnelNo)}</div></div>
    <div class="row"><div class="k">SGK No</div><div class="v">${esc(data.sgkNo)}</div></div>
    <div class="row"><div class="k">Sozlesme Tipi</div><div class="v">${contractTypeLabel}</div></div>
    <div class="row"><div class="k">İşe Giriş</div><div class="v">${esc(data.hireDate)}</div></div>
    <div class="row"><div class="k">Isten Cikis</div><div class="v">${esc(data.terminationDate)}</div></div>
    <div class="row"><div class="k">Ehliyet/Arac</div><div class="v">${drivesVehicleText}</div></div>
    <div class="row"><div class="k">KVKK Onay Tarihi</div><div class="v">${esc(data.kvkkConsentAt)}</div></div>
  </div>

  <div class="card">
    <div class="sec">Yakın Bilgileri</div>
    <div class="row"><div class="k">1. Yakın</div><div class="v">${esc(data.emergency1Name)} - ${esc(data.emergency1Phone)}</div></div>
    <div class="row"><div class="k">2. Yakın</div><div class="v">${esc(data.emergency2Name)} - ${esc(data.emergency2Phone)}</div></div>
  </div>

  <div class="card">
    <div class="sec">Basarilar ve Sertifikalar</div>
    <div class="k">Basarilar</div>
    <div class="txt">${esc(data.achievements)}</div>
    <div class="k">Sertifikalar</div>
    <div class="txt">${esc(data.certificationsSummary)}</div>
  </div>

  <div class="card">
    <div class="sec">Geçmiş İş Deneyimi</div>
    <div class="txt">${esc(data.previousWorkExperience)}</div>
  </div>

  <div class="card">
    <div class="sec">Yönetim Notu</div>
    <div class="txt">${esc(data.notes)}</div>
  </div>

  <div class="foot">Bu belge sistemden otomatik üretilmiştir.</div>
</body>
</html>`;
}

export async function exportStaffDetailPdf(data: StaffPdfData): Promise<string> {
  const html = buildStaffDetailHtml(data);
  const { uri } = await printToLocalPdfFile({
    html,
    width: 595,
    height: 842,
    margins: { top: 18, right: 16, bottom: 18, left: 16 },
  });
  return uri;
}

export async function shareStaffDetailPdf(data: StaffPdfData): Promise<void> {
  const uri = await exportStaffDetailPdf(data);
  if (Platform.OS === 'web') {
    return;
  }
  const can = await Sharing.isAvailableAsync();
  if (can) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Personel detay PDF' });
  }
}

