import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { log } from '@/lib/logger';

/** PDF / yazıcı — tek sayfa için daha küçük; liste raporunda biraz daha büyük */
const PDF_ID_MAX_WIDTH_SINGLE = 620;
const PDF_ID_MAX_WIDTH_BULK = 760;
const PDF_ID_JPEG_QUALITY = 0.82;

async function downloadImageLocal(url: string, cacheKey: string): Promise<string | null> {
  try {
    const ext = url.split('?')[0]?.split('.').pop()?.toLowerCase();
    const suffix = ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : 'jpg';
    const safeKey = cacheKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    const local = `${FileSystem.cacheDirectory ?? ''}kbs-pdf-${safeKey}.${suffix}`;
    const dl = await FileSystem.downloadAsync(url, local);
    return dl.status === 200 ? dl.uri : null;
  } catch (e) {
    log.warn('kbsCaptureReportImages', 'download', { cacheKey, e });
    return null;
  }
}

async function compressForPdf(localUri: string, maxWidth: number): Promise<string> {
  try {
    const out = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: maxWidth } }],
      { compress: PDF_ID_JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    );
    return out?.uri ?? localUri;
  } catch (e) {
    log.warn('kbsCaptureReportImages', 'compress', e);
    return localUri;
  }
}

async function localUriToJpegDataUri(localUri: string): Promise<string | null> {
  try {
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:image/jpeg;base64,${base64}`;
  } catch (e) {
    log.warn('kbsCaptureReportImages', 'base64', e);
    return null;
  }
}

/** Uzak kimlik görselini PDF HTML için data URI'ye çevirir. */
export async function kbsCaptureImageToDataUri(
  imageUrl: string,
  cacheKey: string,
  opts?: { maxWidth?: number }
): Promise<string | null> {
  const url = imageUrl.trim();
  if (!url) return null;
  const maxWidth = opts?.maxWidth ?? PDF_ID_MAX_WIDTH_BULK;
  const downloaded = await downloadImageLocal(url, cacheKey);
  if (!downloaded) return null;
  const compressed = await compressForPdf(downloaded, maxWidth);
  return localUriToJpegDataUri(compressed);
}

export async function buildKbsCaptureImageDataUriMap(
  rows: { id: string; front_image_url: string | null }[],
  includeImages: boolean,
  opts?: { singlePage?: boolean }
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!includeImages) return map;

  const maxWidth = opts?.singlePage || rows.length === 1 ? PDF_ID_MAX_WIDTH_SINGLE : PDF_ID_MAX_WIDTH_BULK;
  const targets = rows.filter((r) => r.front_image_url?.trim());
  await Promise.all(
    targets.map(async (row) => {
      const dataUri = await kbsCaptureImageToDataUri(row.front_image_url!.trim(), row.id, { maxWidth });
      if (dataUri) map.set(row.id, dataUri);
    })
  );
  return map;
}
