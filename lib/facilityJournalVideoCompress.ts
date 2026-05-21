/**
 * Tesis günlüğü videoları — feed’den ayrı: 720p, hızlı sıkıştırma, MB üst sınırı yok.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

const JOURNAL_VIDEO_MAX_LONG_EDGE = 1280;
const JOURNAL_VIDEO_TARGET_BITRATE = 2_500_000;

function toFileUrl(uri: string): string {
  const u = uri.trim();
  if (!u) return u;
  if (u.startsWith('file://')) return u;
  if (Platform.OS === 'android' && u.startsWith('/')) return `file://${u}`;
  return u;
}

export type FacilityJournalVideoCompressProgress = (progress01: number) => void;

export async function compressFacilityJournalVideoForUpload(
  localUri: string,
  onProgress?: FacilityJournalVideoCompressProgress
): Promise<string> {
  if (Platform.OS === 'web') return localUri;

  const input = toFileUrl(localUri);
  if (!input) return localUri;

  if (!requireOptionalNativeModule('BayutVideoCompressor')) {
    console.warn('[facilityJournalVideoCompress] BayutVideoCompressor yok; sıkıştırma atlandı.');
    return localUri;
  }

  let compress: typeof import('expo-image-and-video-compressor').compress;
  let getMetadata: typeof import('expo-image-and-video-compressor').getMetadata;
  try {
    const mod = await import('expo-image-and-video-compressor');
    compress = mod.compress;
    getMetadata = mod.getMetadata;
    if (typeof compress !== 'function') return localUri;
  } catch (e) {
    console.warn('[facilityJournalVideoCompress] modül yüklenemedi', (e as Error)?.message);
    return localUri;
  }

  if (typeof getMetadata === 'function') {
    try {
      const meta = await getMetadata(input);
      const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
      if (longEdge > 0 && longEdge <= JOURNAL_VIDEO_MAX_LONG_EDGE) {
        return localUri;
      }
    } catch {
      /* sıkıştırmayı dene */
    }
  }

  try {
    const out = await compress(
      input,
      {
        maxSize: JOURNAL_VIDEO_MAX_LONG_EDGE,
        codec: 'h264',
        speed: 'fast',
        bitrate: JOURNAL_VIDEO_TARGET_BITRATE,
        progressDivider: 8,
      },
      onProgress
    );
    return (out && out.trim()) || localUri;
  } catch (e) {
    console.warn('[facilityJournalVideoCompress] sıkıştırma atlandı', (e as Error)?.message);
    return localUri;
  }
}
