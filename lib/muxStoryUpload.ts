/**
 * Story videosu: Mux direct upload (720p sıkıştırma + PUT).
 */
import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';
import { Platform } from 'react-native';
import { getMimeAndExt } from '@/lib/uploadMedia';
import { MUX_PENDING_PREFIX } from '@/lib/muxChat';
import { ensureChatVideoLocalUri, extractChatVideoThumbnailUri } from '@/lib/chatVideoThumbnail';
import { putVideoToMux, readVideoFileMeta } from '@/lib/muxChatUpload';
import {
  compressStoryVideoForUpload,
  planStoryVideoCompress,
  storyVideoCompressTimeoutMs,
} from '@/lib/storyVideoCompress';

export type MuxStoryCreateUploadResult = {
  upload_id: string;
  upload_url: string;
  story_id: string;
};

async function invokeMuxCreateStoryUpload(
  body: Record<string, unknown>,
  bearer: string
): Promise<MuxStoryCreateUploadResult> {
  const res = await fetch(`${supabaseUrl}/functions/v1/mux-create-story-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as MuxStoryCreateUploadResult & { error?: string };
  if (!res.ok) {
    throw new Error(data?.error || 'story_video_upload_failed');
  }
  if (!data?.upload_url || !data?.upload_id) {
    throw new Error('story_video_upload_failed');
  }
  return data;
}

async function invokeMuxSyncStory(storyId: string, bearer: string): Promise<{
  ready: boolean;
  media_url?: string | null;
  thumbnail_url?: string | null;
}> {
  const res = await fetch(`${supabaseUrl}/functions/v1/mux-sync-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({ story_id: storyId }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ready?: boolean;
    media_url?: string | null;
    thumbnail_url?: string | null;
    error?: string;
  };
  if (!res.ok) return { ready: false };
  return {
    ready: Boolean(data.ready),
    media_url: data.media_url ?? null,
    thumbnail_url: data.thumbnail_url ?? null,
  };
}

const SYNC_POLL_MS = 500;
const SYNC_MAX_ATTEMPTS = 120;

/** İzleyici: Mux hazır olunca story satırını güncelle (poster → HLS). */
export async function pollStoryPlaybackReady(
  storyId: string,
  opts?: { maxAttempts?: number; intervalMs?: number }
): Promise<{ media_url: string | null; thumbnail_url: string | null; ready: boolean }> {
  const maxAttempts = opts?.maxAttempts ?? 80;
  const intervalMs = opts?.intervalMs ?? SYNC_POLL_MS;
  for (let i = 0; i < maxAttempts; i++) {
    const result = await waitForStoryVideoReady(storyId);
    if (result.media_url) {
      return { ...result, ready: true };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { media_url: null, thumbnail_url: null, ready: false };
}
const STORY_COMPRESS_TIMEOUT_FALLBACK_MS = 90_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

async function prepareStoryVideoUri(
  localUri: string,
  fileSizeBytes: number,
  longEdge: number,
  hooks?: { onCompressTick?: (ratio: number) => void }
): Promise<{ localUri: string; mime: string }> {
  const plan = planStoryVideoCompress(fileSizeBytes, longEdge);
  if (plan.skip) {
    hooks?.onCompressTick?.(1);
    const { mime } = getMimeAndExt(localUri, 'video');
    return { localUri, mime };
  }

  hooks?.onCompressTick?.(0.05);
  const beforeCompress = localUri;
  const compressTimeout = storyVideoCompressTimeoutMs(fileSizeBytes) || STORY_COMPRESS_TIMEOUT_FALLBACK_MS;
  try {
    const out = await withTimeout(
      compressStoryVideoForUpload(localUri, fileSizeBytes, (r) => hooks?.onCompressTick?.(r)),
      compressTimeout,
      'Video hazırlanırken zaman aşımı — tekrar deneyin'
    );
    hooks?.onCompressTick?.(1);
    const { mime } = getMimeAndExt(out, 'video');
    return { localUri: out, mime };
  } catch {
    hooks?.onCompressTick?.(1);
    const { mime } = getMimeAndExt(beforeCompress, 'video');
    return { localUri: beforeCompress, mime };
  }
}

export async function waitForStoryVideoReady(storyId: string): Promise<{
  media_url: string | null;
  thumbnail_url: string | null;
}> {
  const { data: { session } } = await supabase.auth.getSession();
  const bearer = session?.access_token;
  if (!bearer) return { media_url: null, thumbnail_url: null };

  const result = await invokeMuxSyncStory(storyId, bearer);
  if (result.ready && result.media_url) {
    return { media_url: result.media_url, thumbnail_url: result.thumbnail_url ?? null };
  }
  return { media_url: null, thumbnail_url: null };
}

/** Story kaydı oluşturulduktan sonra videoyu Mux’a yükle. */
export async function uploadStoryVideoForStaff(params: {
  storyId: string;
  videoUri: string;
  /** Paylaş öncesi zaten file:// ise tekrar kopyalama yapılmaz. */
  preparedLocalUri?: string;
  onCompressing?: () => void;
  onCompressProgress?: (ratio: number) => void;
  onUploadProgress?: (ratio: number) => void;
}): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Oturum gerekli.');

  const local =
    params.preparedLocalUri ??
    (Platform.OS === 'android' && params.videoUri.startsWith('content://')
      ? await ensureChatVideoLocalUri(params.videoUri)
      : params.videoUri);
  const meta = await readVideoFileMeta(local);

  params.onCompressing?.();
  const [created, prepared] = await Promise.all([
    invokeMuxCreateStoryUpload(
      {
        story_id: params.storyId,
        file_size: meta.size,
        mime_type: meta.mime,
      },
      token
    ),
    prepareStoryVideoUri(local, meta.size, meta.longEdge, {
      onCompressTick: (r) => params.onCompressProgress?.(r),
    }),
  ]);

  await putVideoToMux(created.upload_url, prepared.localUri, prepared.mime, params.onUploadProgress, {
    assumedBytesPerSec: 220_000,
    minUploadTimeoutMs: 45_000,
  });
  params.onUploadProgress?.(1);
  void pollStoryPlaybackReady(params.storyId, { maxAttempts: 90, intervalMs: 500 });
}

/** Story insert öncesi yerel poster (JPEG). */
export async function buildStoryVideoThumbnail(videoUri: string): Promise<string | null> {
  const local = await ensureChatVideoLocalUri(videoUri);
  return extractChatVideoThumbnailUri(local);
}

export const STORY_MUX_PENDING_PLACEHOLDER = `${MUX_PENDING_PREFIX}story`;
