import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';

type PrinterSettings = {
  enabled?: boolean;
  email?: string;
};

const DEFAULT_PRINTER_EMAIL = '536w8897jy@hpeprint.com';
/** Edge function gövde limiti; aşılırsa SMTP yerine anlamlı hata */
const MAX_PRINTER_PDF_BYTES = 4.5 * 1024 * 1024;

function normalizePdfUri(uri: string): string {
  const u = uri.trim();
  if (!u) return u;
  if (Platform.OS === 'web') return u;
  if (u.startsWith('file://') || u.startsWith('content://')) return u;
  if (u.startsWith('/')) return `file://${u}`;
  return u;
}

async function readPdfAsBase64(pdfUri: string): Promise<string> {
  const uri = normalizePdfUri(pdfUri);
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new Error('PDF dosyası bulunamadı. Önce PDF oluşturulduğundan emin olun.');
  }
  const size = 'size' in info && typeof info.size === 'number' ? info.size : 0;
  if (size <= 0) {
    throw new Error('PDF dosyası boş. Yazdır veya PDF ile tekrar deneyin.');
  }
  if (size > MAX_PRINTER_PDF_BYTES) {
    throw new Error(
      'PDF yazıcı e-postası için çok büyük (fiş fotoğrafları gömülü olabilir). "Yazıcı mail" hafif belge üretir; yine de olmazsa PDF paylaşıp manuel gönderin.'
    );
  }
  const raw = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const cleaned = raw.replace(/\s/g, '');
  if (!cleaned) {
    throw new Error('PDF okunamadı. Uygulamayı yenileyip tekrar deneyin.');
  }
  return cleaned;
}

async function loadPrinterEmail(): Promise<string> {
  let { data, error } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'printer')
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error?.code === '42P01' || error?.code === 'PGRST205' || error?.status === 404) {
    const fallback = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'printer')
      .order('updated_at', { ascending: false })
      .limit(1);
    data = fallback.data as typeof data;
    error = fallback.error as typeof error;
  }

  if (error) return DEFAULT_PRINTER_EMAIL;
  const value = (data?.[0]?.value ?? {}) as PrinterSettings;
  return (value.email ?? DEFAULT_PRINTER_EMAIL).trim() || DEFAULT_PRINTER_EMAIL;
}

function extractInvokeErrorMessage(error: unknown, data: unknown): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const err = (data as { error?: { message?: string } }).error;
    if (err?.message?.trim()) return err.message.trim();
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: string }).message ?? 'Yazıcı e-postası gönderilemedi');
  }
  return 'Yazıcı e-postası gönderilemedi';
}

export async function sendPdfToPrinterEmail(opts: {
  pdfUri: string;
  subject: string;
  fileName: string;
}): Promise<void> {
  const to = await loadPrinterEmail();
  const contentBase64 = await readPdfAsBase64(opts.pdfUri);
  const subject = opts.subject.trim().slice(0, 180) || 'Valoria Belge';
  const fileName = opts.fileName.trim().slice(0, 120) || 'belge.pdf';

  const { data, error } = await supabase.functions.invoke('send-printer-document', {
    body: {
      to,
      subject,
      fileName,
      contentBase64,
    },
  });

  if (error || data?.ok !== true) {
    const msg = extractInvokeErrorMessage(error, data);
    if (/invalid login|authentication failed|535|534/i.test(msg)) {
      throw new Error(
        `${msg}\n\nSMTP kullanıcı/şifre reddedildi. Diğer modüller çalışıyorsa PDF çok büyük veya bozuk olabilir; fiş için "Yazıcı mail" hafif PDF üretir — tekrar deneyin. Sorun sürerse Supabase SMTP_PASS secret'ını kontrol edin.`
      );
    }
    throw new Error(msg);
  }
}
