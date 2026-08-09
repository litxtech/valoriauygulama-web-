import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';

function toFileUri(path: string): string {
  const p = path.trim();
  if (!p) return p;
  if (p.startsWith('file://')) return p;
  if (p.startsWith('/')) return `file://${p}`;
  return p;
}

async function writeBase64Pdf(dest: string, base64: string): Promise<string> {
  const cleaned = base64.replace(/\s/g, '');
  if (!cleaned) throw new Error('PDF verisi boş.');
  await FileSystem.writeAsStringAsync(dest, cleaned, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return toFileUri(dest);
}

/**
 * expo-print bazen `blob:` URI döner; Sharing / FileSystem / yazıcı mail
 * "Unable to resolve data for blob" verir. Kalıcı `file://` cache’e yazar.
 */
export async function persistExpoPrintPdfUri(
  uri: string,
  base64?: string | null,
  filePrefix = 'print'
): Promise<string> {
  const u = (uri || '').trim();
  const cache = FileSystem.cacheDirectory;
  if (!cache) {
    throw new Error('Önbellek dizini yok. Uygulamayı yeniden başlatıp tekrar deneyin.');
  }
  const dest = `${cache}${filePrefix}-${Date.now()}.pdf`;

  if (base64?.trim()) {
    return writeBase64Pdf(dest, base64);
  }

  if (u.startsWith('file://') || (u.startsWith('/') && !u.startsWith('blob:'))) {
    return toFileUri(u);
  }

  if (u.startsWith('data:application/pdf')) {
    const comma = u.indexOf(',');
    const raw = comma >= 0 ? u.slice(comma + 1) : '';
    return writeBase64Pdf(dest, raw);
  }

  if (u.startsWith('blob:')) {
    try {
      const res = await fetch(u);
      const ab = await res.arrayBuffer();
      if (!ab.byteLength) throw new Error('empty_blob');
      const bytes = new Uint8Array(ab);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const b64 =
        typeof globalThis.btoa === 'function'
          ? globalThis.btoa(binary)
          : Buffer.from(bytes).toString('base64');
      return writeBase64Pdf(dest, b64);
    } catch (e) {
      throw new Error(
        `PDF kaydedilemedi. Tekrar deneyin. ${e instanceof Error ? e.message : ''}`.trim()
      );
    }
  }

  if (Platform.OS !== 'web') {
    try {
      await FileSystem.copyAsync({ from: u, to: dest });
      return toFileUri(dest);
    } catch {
      /* fall through */
    }
  }

  return toFileUri(u);
}

export type LocalPdfPrintOptions = {
  html: string;
  width?: number;
  height?: number;
  margins?: { top: number; bottom: number; left: number; right: number };
  /** İstenirse yok sayılır; kalıcılık için her zaman base64 alınır. */
  base64?: boolean;
  filePrefix?: string;
};

/**
 * `Print.printToFileAsync` yerine kullanın — her zaman kalıcı `file://` URI döner.
 */
export async function printToLocalPdfFile(
  options: LocalPdfPrintOptions
): Promise<{ uri: string; base64?: string; numberOfPages?: number }> {
  const { filePrefix, base64: _ignored, html, width, height, margins } = options;
  const result = await Print.printToFileAsync({
    html,
    base64: true,
    width,
    height,
    margins,
  });
  const rawUri = (result?.uri ?? '').trim();
  const b64 = typeof result?.base64 === 'string' ? result.base64 : null;
  if (!rawUri && !b64) {
    throw new Error('PDF oluşturulamadı.');
  }
  const uri = await persistExpoPrintPdfUri(rawUri || 'blob:missing', b64, filePrefix ?? 'print');
  return {
    uri,
    base64: b64 ?? undefined,
    numberOfPages: result?.numberOfPages,
  };
}

export async function printHtmlToLocalPdfFile(
  html: string,
  opts?: Omit<LocalPdfPrintOptions, 'html'>
): Promise<string> {
  const { uri } = await printToLocalPdfFile({ html, ...opts });
  return uri;
}
