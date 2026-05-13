/**
 * Feed videoları: 4K dahil yüksek çözünürlük kabul; yükleme öncesi donanım kodlayıcı ile ~1080p (uzun kenar 1920) H.264.
 * Web veya native modül yoksa (dev client yenilenmediyse) URI aynen döner.
 *
 * `expo-image-and-video-compressor` paketi import edilir etmez `requireNativeModule` çağırır;
 * bu yüzden önce `requireOptionalNativeModule` ile varlık kontrolü şart.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

/** Full HD (16:9 1920×1080) için uzun kenar sınırı — kütüphane maxSize’ı buna göre ölçekler */
const FEED_VIDEO_MAX_LONG_EDGE = 1920;

/** Kalite öncelikli bitrate (8 Mbps); dosya boyutu ikincil */
const FEED_VIDEO_TARGET_BITRATE = 8_000_000;

function toFileUrl(uri: string): string {
  const u = uri.trim();
  if (!u) return u;
  if (u.startsWith('file://')) return u;
  if (Platform.OS === 'android' && u.startsWith('/')) return `file://${u}`;
  return u;
}

export type FeedVideoCompressProgress = (progress01: number) => void;

export async function compressFeedVideoForUpload(
  localUri: string,
  onProgress?: FeedVideoCompressProgress
): Promise<string> {
  if (Platform.OS === 'web') return localUri;

  const input = toFileUrl(localUri);
  if (!input) return localUri;

  if (!requireOptionalNativeModule('BayutVideoCompressor')) {
    console.warn(
      '[feedVideoCompress] BayutVideoCompressor native modülü yok; video sıkıştırma atlandı. ' +
        'Paket eklendiyse dev client’ı yeniden derleyin: npx expo run:android veya eas build --profile development.'
    );
    return localUri;
  }

  let compress: typeof import('expo-image-and-video-compressor').compress;
  let getMetadata: typeof import('expo-image-and-video-compressor').getMetadata;
  try {
    const mod = await import('expo-image-and-video-compressor');
    compress = mod.compress;
    getMetadata = mod.getMetadata;
    if (typeof compress !== 'function' || typeof getMetadata !== 'function') {
      console.warn('[feedVideoCompress] compress/getMetadata tanımsız, sıkıştırma atlandı');
      return localUri;
    }
  } catch (e) {
    console.warn('[feedVideoCompress] modül yüklenemedi', (e as Error)?.message);
    return localUri;
  }

  try {
    const meta = await getMetadata(input);
    const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
    if (longEdge > 0 && longEdge <= FEED_VIDEO_MAX_LONG_EDGE) {
      return localUri;
    }
  } catch (e) {
    console.warn('[feedVideoCompress] metadata okunamadı, sıkıştırma deneniyor', (e as Error)?.message);
  }

  try {
    const out = await compress(
      input,
      {
        maxSize: FEED_VIDEO_MAX_LONG_EDGE,
        codec: 'h264',
        speed: 'fast',
        bitrate: FEED_VIDEO_TARGET_BITRATE,
        progressDivider: 4,
      },
      onProgress
    );
    return (out && out.trim()) || localUri;
  } catch (e) {
    console.warn('[feedVideoCompress] sıkıştırma atlandı', (e as Error)?.message);
    return localUri;
  }
}
