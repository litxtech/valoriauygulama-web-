/**
 * Story videosu: tek geçiş 720p H.264 (hızlı preset), zaten küçükse atla.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

/** Story dikey — 540p yeterli, encode + yükleme daha hızlı. */
export const STORY_TARGET_LONG_EDGE = 540;

const BITRATE_DEFAULT = 950_000;
const BITRATE_LARGE = 800_000;
const SKIP_MAX_BYTES = 28 * 1024 * 1024;

export type StoryVideoCompressPlan = {
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

export function planStoryVideoCompress(fileSizeBytes: number, longEdge: number): StoryVideoCompressPlan {
  if (!requireOptionalNativeModule('BayutVideoCompressor')) {
    return { skip: true, maxSize: STORY_TARGET_LONG_EDGE, bitrate: BITRATE_DEFAULT, reason: 'no_native' };
  }
  if (
    longEdge > 0 &&
    longEdge <= STORY_TARGET_LONG_EDGE &&
    fileSizeBytes > 0 &&
    fileSizeBytes <= SKIP_MAX_BYTES
  ) {
    return { skip: true, maxSize: STORY_TARGET_LONG_EDGE, bitrate: BITRATE_DEFAULT, reason: 'already_720p' };
  }
  const bitrate = fileSizeBytes > 120 * 1024 * 1024 ? BITRATE_LARGE : BITRATE_DEFAULT;
  return { skip: false, maxSize: STORY_TARGET_LONG_EDGE, bitrate, reason: 'story_720p' };
}

export function storyVideoCompressTimeoutMs(fileSizeBytes: number): number {
  if (fileSizeBytes > 120 * 1024 * 1024) return 150_000;
  if (fileSizeBytes > 50 * 1024 * 1024) return 90_000;
  return 60_000;
}

export async function compressStoryVideoForUpload(
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
    /* */
  }

  const size = fileSizeBytes ?? 0;
  const plan = planStoryVideoCompress(size, longEdge);
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
        progressDivider: 12,
      },
      (p) => onProgress?.(Math.min(1, 0.04 + Math.max(0, p) * 0.96))
    );
    onProgress?.(1);
    return out?.trim() ? toFileUrl(out) : localUri;
  } catch {
    onProgress?.(1);
    return localUri;
  }
}
