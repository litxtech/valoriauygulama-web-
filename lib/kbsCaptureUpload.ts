import { Image, Platform } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { applyKbsCaptureWatermark } from '@/lib/kbsCaptureWatermark';
import { KBS_OCR_PRO_MAX_LONG_EDGE, KBS_OCR_PRO_MIN_LONG_EDGE } from '@/lib/kbsOcrImageEnhance';

/**
 * Ağa çıkan kopya — OCR her zaman yerel (tam kalite) dosyadan çalışır; yüklenen
 * kopya küçük tutulur ki zayıf internette 45 sn zaman aşımına sığsın.
 */
const KBS_UPLOAD_MAX_LONG_EDGE = 2000;
const KBS_UPLOAD_JPEG_QUALITY = 0.8;

/** Prewarm zaman aşımı sonrası kayıt akışı aynı görseli yeniden istediğinde CPU işini tekrarlama. */
const PREPARED_CACHE_MAX = 40;
const preparedByInput = new Map<string, string>();
const uploadVariantByPrepared = new Map<string, string>();

function cachePut(map: Map<string, string>, key: string, value: string): void {
  if (map.size >= PREPARED_CACHE_MAX) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, value);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

function imageDimensions(uri: string): Promise<{ width: number; height: number }> {
  return withTimeout(
    new Promise<{ width: number; height: number }>((resolve, reject) => {
      Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject);
    }),
    8_000,
    'kbs_image_size'
  );
}

/** Kimlik kaydı — OCR netliği için çözünürlük normalize (küçükleri büyüt, devleri küçült). */
export async function prepareKbsCaptureImageUri(uri: string): Promise<string> {
  const cached = preparedByInput.get(uri);
  if (cached) return cached;
  try {
    const { width, height } = await imageDimensions(uri);
    const long = Math.max(width, height);
    const isAndroid = Platform.OS === 'android';
    const minLong = KBS_OCR_PRO_MIN_LONG_EDGE;
    const maxLong = isAndroid ? KBS_OCR_PRO_MAX_LONG_EDGE : 2800;

    const actions: { resize: { width?: number; height?: number } }[] = [];
    if (long < minLong) {
      actions.push(width >= height ? { resize: { width: minLong } } : { resize: { height: minLong } });
    } else if (long > maxLong) {
      actions.push(width >= height ? { resize: { width: maxLong } } : { resize: { height: maxLong } });
    }

    let prepared = uri;
    if (actions.length) {
      const out = await withTimeout(
        manipulateAsync(uri, actions, {
          compress: isAndroid ? 0.96 : 0.92,
          format: SaveFormat.JPEG,
        }),
        25_000,
        'kbs_image_resize'
      );
      prepared = out.uri;
    }

    const result = await withTimeout(applyKbsCaptureWatermark(prepared), 15_000, 'kbs_watermark');
    cachePut(preparedByInput, uri, result);
    return result;
  } catch {
    return uri;
  }
}

/**
 * Yükleme kopyası: uzun kenar ≤ 2000 px, JPEG 0.8. Kayıtta gösterim / KBS arşivi için
 * yeterli; zayıf internette yükleme süresini birkaç kat kısaltır. Başarısız olursa
 * tam kaliteli hazır dosya döner (davranış değişmez).
 */
export async function prepareKbsCaptureUploadUri(preparedUri: string): Promise<string> {
  const cached = uploadVariantByPrepared.get(preparedUri);
  if (cached) return cached;
  try {
    const { width, height } = await imageDimensions(preparedUri);
    const long = Math.max(width, height);
    const actions: { resize: { width?: number; height?: number } }[] =
      long > KBS_UPLOAD_MAX_LONG_EDGE
        ? [
            width >= height
              ? { resize: { width: KBS_UPLOAD_MAX_LONG_EDGE } }
              : { resize: { height: KBS_UPLOAD_MAX_LONG_EDGE } },
          ]
        : [];
    const out = await withTimeout(
      manipulateAsync(preparedUri, actions, {
        compress: KBS_UPLOAD_JPEG_QUALITY,
        format: SaveFormat.JPEG,
      }),
      20_000,
      'kbs_upload_variant'
    );
    cachePut(uploadVariantByPrepared, preparedUri, out.uri);
    return out.uri;
  } catch {
    return preparedUri;
  }
}
