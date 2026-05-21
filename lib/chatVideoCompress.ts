/**
 * Sohbet videosu: kalite ne olursa olsun 720p H.264 (hızlı preset) — sonra yükleme.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

/** Uzun kenar üst sınırı (720p). */
export const CHAT_TARGET_LONG_EDGE = 720;

const BITRATE_DEFAULT = 1_900_000;
const BITRATE_LARGE = 1_500_000;
const BITRATE_HUGE = 1_200_000;

export type ChatVideoCompressPlan = {
  skip: boolean;
  maxSize: number;
  bitrate: number;
  reason: string;
};

function toFileUrl(uri: string): string {
  const u = uri.trim();
  if (!u) return u;
  if (u.startsWith('file://')) return u;
  if (Platform.OS === 'android' && u.startsWith('/')) return `file://${u}`;
  return u;
}

/** Sohbet: her zaman 720p encode (native yoksa atlanır). */
export function planChatVideoCompress(fileSizeBytes: number, _longEdge: number): ChatVideoCompressPlan {
  if (!requireOptionalNativeModule('BayutVideoCompressor')) {
    return { skip: true, maxSize: CHAT_TARGET_LONG_EDGE, bitrate: BITRATE_DEFAULT, reason: 'no_native' };
  }

  let bitrate = BITRATE_DEFAULT;
  if (fileSizeBytes > 500 * 1024 * 1024) {
    bitrate = BITRATE_HUGE;
  } else if (fileSizeBytes > 120 * 1024 * 1024) {
    bitrate = BITRATE_LARGE;
  }

  return {
    skip: false,
    maxSize: CHAT_TARGET_LONG_EDGE,
    bitrate,
    reason: 'chat_720p_always',
  };
}

const CHAT_MAX_COMPRESS_MS = 75_000;

export function chatVideoCompressTimeoutMs(fileSizeBytes: number): number {
  let ms = 150_000;
  if (fileSizeBytes > 900 * 1024 * 1024) ms = 720_000;
  else if (fileSizeBytes > 400 * 1024 * 1024) ms = 480_000;
  else if (fileSizeBytes > 150 * 1024 * 1024) ms = 300_000;
  return Math.min(CHAT_MAX_COMPRESS_MS, ms);
}

export async function compressChatVideoForUpload(
  localUri: string,
  fileSizeBytes?: number,
  onProgress?: (ratio: number) => void
): Promise<string> {
  if (Platform.OS === 'web') return localUri;
  const input = toFileUrl(localUri);
  if (!input) return localUri;

  if (!requireOptionalNativeModule('BayutVideoCompressor')) {
    onProgress?.(1);
    return localUri;
  }

  let compress: typeof import('expo-image-and-video-compressor').compress;
  let getMetadata: typeof import('expo-image-and-video-compressor').getMetadata;
  try {
    const mod = await import('expo-image-and-video-compressor');
    compress = mod.compress;
    getMetadata = mod.getMetadata;
  } catch {
    onProgress?.(1);
    return localUri;
  }

  let longEdge = 0;
  try {
    const meta = await getMetadata(input);
    longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
  } catch {
    /* metadata yok — yine 720p dene */
  }

  const size = fileSizeBytes ?? 0;
  const plan = planChatVideoCompress(size, longEdge);
  if (plan.skip) {
    onProgress?.(1);
    return localUri;
  }

  try {
    onProgress?.(0.03);
    const out = await compress(
      input,
      {
        maxSize: plan.maxSize,
        codec: 'h264',
        speed: 'fast',
        bitrate: plan.bitrate,
        progressDivider: 10,
      },
      (p) => onProgress?.(0.03 + Math.min(0.94, Math.max(0, p) * 0.94))
    );
    onProgress?.(1);
    return out?.trim() ? toFileUrl(out) : localUri;
  } catch {
    onProgress?.(1);
    return localUri;
  }
}
