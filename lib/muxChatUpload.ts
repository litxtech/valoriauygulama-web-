/**
 * Mesaj videosu: Mux direct upload (PUT) — büyük dosyalar belleğe alınmadan.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { getInfoAsync, uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';
import { getMimeAndExt } from '@/lib/uploadMedia';
import { CHAT_VIDEO_MAX_BYTES, getMuxHlsPlaybackUrl } from '@/lib/muxChat';
import { feedPostMediaPickerGalleryOptions } from '@/lib/feedPostMediaPicker';
import {
  chatVideoCompressTimeoutMs,
  compressChatVideoForUpload,
  planChatVideoCompress,
} from '@/lib/chatVideoCompress';
import { ensureChatVideoLocalUri } from '@/lib/chatVideoThumbnail';
import { withChatVideoDeliveryTimeout } from '@/lib/chatVideoDelivery';

export type MuxCreateUploadResult = {
  upload_id: string;
  upload_url: string;
  method: string;
  message_id: string;
};

function normalizeLocalUri(uri: string): string {
  const u = uri.trim();
  if (u.startsWith('file://')) return u;
  if (Platform.OS === 'android' && u.startsWith('/')) return `file://${u}`;
  return u;
}

const COMPRESS_TIMEOUT_FALLBACK_MS = 150_000;
const UPLOAD_MIN_TIMEOUT_MS = 180_000;
const UPLOAD_MAX_TIMEOUT_MS = 1_200_000;

function uploadTimeoutMs(fileSizeBytes: number, floorMs: number = UPLOAD_MIN_TIMEOUT_MS): number {
  const estimated = Math.ceil(fileSizeBytes / 40_000) * 1000;
  return Math.min(UPLOAD_MAX_TIMEOUT_MS, Math.max(floorMs, estimated));
}

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

export async function prepareVideoUri(
  localUri: string,
  fileSizeBytes: number,
  longEdge: number,
  hooks?: { onCompressTick?: (ratio: number) => void }
): Promise<{ localUri: string; mime: string; skippedCompress: boolean }> {
  const plan = planChatVideoCompress(fileSizeBytes, longEdge);
  if (plan.skip) {
    hooks?.onCompressTick?.(1);
    const { mime } = getMimeAndExt(localUri, 'video');
    return { localUri, mime, skippedCompress: true };
  }

  hooks?.onCompressTick?.(0.05);
  const compressTimeout = chatVideoCompressTimeoutMs(fileSizeBytes) || COMPRESS_TIMEOUT_FALLBACK_MS;
  const beforeCompress = localUri;
  try {
    const out = await withTimeout(
      compressChatVideoForUpload(localUri, fileSizeBytes, (r) => hooks?.onCompressTick?.(r)),
      compressTimeout,
      'Video hazırlanırken zaman aşımı — tekrar deneyin'
    );
    hooks?.onCompressTick?.(1);
    const { mime } = getMimeAndExt(out, 'video');
    return { localUri: out, mime, skippedCompress: false };
  } catch {
    hooks?.onCompressTick?.(1);
    const { mime } = getMimeAndExt(beforeCompress, 'video');
    return { localUri: beforeCompress, mime, skippedCompress: true };
  }
}

export async function readVideoFileMeta(localUri: string): Promise<{ size: number; mime: string; longEdge: number }> {
  const info = await getInfoAsync(normalizeLocalUri(localUri));
  const size = info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0;
  const { mime } = getMimeAndExt(localUri, 'video');
  let longEdge = 0;
  if (requireOptionalNativeModule('BayutVideoCompressor')) {
    try {
      const { getMetadata } = await import('expo-image-and-video-compressor');
      const meta = await getMetadata(normalizeLocalUri(localUri));
      longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
    } catch {
      /* */
    }
  }
  return { size, mime, longEdge };
}

async function invokeMuxSyncUpload(
  body: Record<string, unknown>,
  bearer?: string
): Promise<{ ready: boolean; media_url?: string | null; httpStatus: number }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: supabaseAnonKey,
  };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const res = await fetch(`${supabaseUrl}/functions/v1/mux-sync-upload`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { ready?: boolean; media_url?: string | null; error?: string };
  if (!res.ok) {
    return { ready: false, media_url: null, httpStatus: res.status };
  }
  return { ready: Boolean(data.ready), media_url: data.media_url ?? null, httpStatus: res.status };
}

async function loadMessageMediaFromSupabase(
  messageId: string
): Promise<{ media_url: string | null; media_thumbnail: string | null } | null> {
  const { data, error } = await supabase
    .from('messages')
    .select('media_url, media_thumbnail')
    .eq('id', messageId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { media_url?: string | null; media_thumbnail?: string | null };
  return {
    media_url: row.media_url ?? null,
    media_thumbnail: row.media_thumbnail ?? null,
  };
}

/** UI / realtime kaçırınca: mux-sync edge ile tek mesajı güncelle (gönderen & alıcı). */
export async function requestChatMuxMessageSync(params: {
  messageId: string;
  appToken?: string;
}): Promise<{ ready: boolean; media_url?: string | null }> {
  const body: Record<string, unknown> = { message_id: params.messageId };
  if (params.appToken) body.app_token = params.appToken;

  const runInvoke = async (bearer?: string) => invokeMuxSyncUpload(body, bearer);

  const { data: { session } } = await supabase.auth.getSession();
  let bearer = params.appToken ? undefined : session?.access_token;
  let out = await runInvoke(bearer);

  if ((out.httpStatus === 401 || out.httpStatus === 403) && !params.appToken) {
    await supabase.auth.refreshSession();
    const { data: { session: s2 } } = await supabase.auth.getSession();
    bearer = s2?.access_token;
    out = await runInvoke(bearer);
  }

  if (out.ready && out.media_url && getMuxHlsPlaybackUrl(out.media_url)) {
    return { ready: true, media_url: out.media_url };
  }

  const row = await loadMessageMediaFromSupabase(params.messageId);
  const dbUrl = row?.media_url ?? null;
  if (dbUrl && getMuxHlsPlaybackUrl(dbUrl)) {
    return { ready: true, media_url: dbUrl };
  }

  return { ready: Boolean(out.ready), media_url: out.media_url ?? null };
}

const SYNC_POLL_MS = 900;
/** Arka plan Mux senkronu — en fazla ~72 sn, sonsuz döngü yok. */
const SYNC_MAX_ATTEMPTS = 80;

/** PUT bittikten sonra Mux encode + DB güncellemesini hızlı yakala (webhook + 1.5s polling). */
export async function waitForChatVideoReady(params: {
  messageId: string;
  appToken?: string;
}): Promise<string | null> {
  for (let i = 0; i < SYNC_MAX_ATTEMPTS; i++) {
    const result = await requestChatMuxMessageSync({
      messageId: params.messageId,
      appToken: params.appToken,
    });
    if (result.ready && result.media_url && getMuxHlsPlaybackUrl(result.media_url)) {
      return result.media_url;
    }
    await new Promise((r) => setTimeout(r, SYNC_POLL_MS));
  }
  return null;
}

async function invokeMuxCreateUpload(body: Record<string, unknown>, bearer?: string): Promise<MuxCreateUploadResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: supabaseAnonKey,
  };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const res = await fetch(`${supabaseUrl}/functions/v1/mux-create-upload`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as MuxCreateUploadResult & { error?: string };
  if (!res.ok) throw new Error(data?.error || `Video Valoria'ya yüklenemedi (${res.status})`);
  if (!data?.upload_url || !data?.upload_id) throw new Error(data?.error || 'Video yüklenemedi. Tekrar deneyin.');
  return data;
}

export type PutVideoToMuxOptions = {
  /** İlerleme tahmini için varsayılan indirme hızı (bayt/sn). */
  assumedBytesPerSec?: number;
  minUploadTimeoutMs?: number;
};

function estimateUploadProgressMs(fileSizeBytes: number, assumedBytesPerSec: number): number {
  const byThroughput = Math.ceil(fileSizeBytes / assumedBytesPerSec) * 1000;
  return Math.max(10_000, Math.min(UPLOAD_MAX_TIMEOUT_MS * 0.9, byThroughput + 4000));
}

export async function putVideoToMux(
  uploadUrl: string,
  localUri: string,
  contentType: string,
  onProgress?: (ratio: number) => void,
  options?: PutVideoToMuxOptions
): Promise<void> {
  const fileUri = normalizeLocalUri(localUri);
  const info = await getInfoAsync(fileUri);
  if (!info.exists || !('size' in info) || typeof info.size !== 'number' || info.size <= 0) {
    throw new Error('Video dosyası bulunamadı veya boş.');
  }
  if (info.size > CHAT_VIDEO_MAX_BYTES) {
    throw new Error('Video çok büyük (üst sınır 600 MB).');
  }

  const assumedBps = options?.assumedBytesPerSec ?? 120_000;
  const estimatedMs = estimateUploadProgressMs(info.size, assumedBps);
  const startMs = Date.now();
  onProgress?.(0.04);
  const progressTimer = setInterval(() => {
    const t = Math.min(1, (Date.now() - startMs) / estimatedMs);
    const eased = 1 - (1 - t) ** 2.2;
    onProgress?.(Math.min(0.98, 0.04 + eased * 0.94));
  }, 450);

  const timeoutMs = uploadTimeoutMs(info.size, options?.minUploadTimeoutMs ?? UPLOAD_MIN_TIMEOUT_MS);
  let result: Awaited<ReturnType<typeof uploadAsync>>;
  try {
    result = await withTimeout(
      uploadAsync(uploadUrl, fileUri, {
        httpMethod: 'PUT',
        headers: { 'Content-Type': contentType },
        uploadType: FileSystemUploadType.BINARY_CONTENT,
      }),
      timeoutMs,
      'Video yükleme zaman aşımı — bağlantınızı kontrol edip tekrar deneyin'
    );
    onProgress?.(1);
  } finally {
    clearInterval(progressTimer);
  }

  if (result.status < 200 || result.status >= 300) {
    let msg = `Video yüklemesi başarısız (HTTP ${result?.status ?? 0})`;
    try {
      const body = result?.body;
      if (body) {
        const j = JSON.parse(body) as { error?: { message?: string } };
        if (j?.error?.message) msg = j.error.message;
      }
    } catch {
      if (result?.body?.trim()) msg = `${msg}: ${result.body.trim().slice(0, 200)}`;
    }
    throw new Error(msg);
  }
}

async function uploadChatVideoForStaffInner(params: {
  conversationId: string;
  messageId: string;
  videoUri: string;
  preparedLocalUri?: string;
  onCompressing?: () => void;
  onCompressProgress?: (ratio: number) => void;
  onUploadProgress?: (ratio: number) => void;
}): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Oturum gerekli.');

  const local = params.preparedLocalUri ?? (await ensureChatVideoLocalUri(params.videoUri));
  const meta = await readVideoFileMeta(local);

  params.onCompressing?.();
  const [created, prepared] = await Promise.all([
    invokeMuxCreateUpload(
      {
        conversation_id: params.conversationId,
        message_id: params.messageId,
        file_size: meta.size,
        mime_type: meta.mime,
      },
      token
    ),
    prepareVideoUri(local, meta.size, meta.longEdge, {
      onCompressTick: (r) => params.onCompressProgress?.(r),
    }),
  ]);

  await putVideoToMux(created.upload_url, prepared.localUri, prepared.mime, params.onUploadProgress, {
    minUploadTimeoutMs: 90_000,
  });
  await supabase
    .from('messages')
    .update({ media_url: `mux://processing/${created.upload_id}` })
    .eq('id', params.messageId);
  /** PUT bitti; encode + UI HLS — uploadChatVideoForStaff’ı bloklamadan (faz “done”) arka planda. */
  void (async () => {
    const hlsUrl = await waitForChatVideoReady({ messageId: params.messageId });
    if (!hlsUrl) return;
    const { patchChatVideoMessageMedia } = await import('@/lib/chatVideoUploadSession');
    patchChatVideoMessageMedia(params.conversationId, params.messageId, hlsUrl);
  })();
}

/** Personel: mesaj oluşturulduktan sonra Mux’a yükle (2 dk üst sınır). */
export async function uploadChatVideoForStaff(params: {
  conversationId: string;
  messageId: string;
  videoUri: string;
  preparedLocalUri?: string;
  onCompressing?: () => void;
  onCompressProgress?: (ratio: number) => void;
  onUploadProgress?: (ratio: number) => void;
}): Promise<void> {
  return withChatVideoDeliveryTimeout(uploadChatVideoForStaffInner(params));
}

async function uploadChatVideoForGuestInner(params: {
  appToken: string;
  conversationId: string;
  messageId: string;
  videoUri: string;
  preparedLocalUri?: string;
  onCompressing?: () => void;
  onCompressProgress?: (ratio: number) => void;
  onUploadProgress?: (ratio: number) => void;
}): Promise<void> {
  const local = params.preparedLocalUri ?? (await ensureChatVideoLocalUri(params.videoUri));
  const meta = await readVideoFileMeta(local);

  params.onCompressing?.();
  const [created, prepared] = await Promise.all([
    invokeMuxCreateUpload({
      app_token: params.appToken,
      conversation_id: params.conversationId,
      message_id: params.messageId,
      file_size: meta.size,
      mime_type: meta.mime,
    }),
    prepareVideoUri(local, meta.size, meta.longEdge, {
      onCompressTick: (r) => params.onCompressProgress?.(r),
    }),
  ]);

  await putVideoToMux(created.upload_url, prepared.localUri, prepared.mime, params.onUploadProgress, {
    minUploadTimeoutMs: 90_000,
  });
  await supabase
    .from('messages')
    .update({ media_url: `mux://processing/${created.upload_id}` })
    .eq('id', params.messageId);
  void (async () => {
    const hlsUrl = await waitForChatVideoReady({
      messageId: params.messageId,
      appToken: params.appToken,
    });
    if (!hlsUrl) return;
    const { patchChatVideoMessageMedia } = await import('@/lib/chatVideoUploadSession');
    patchChatVideoMessageMedia(params.conversationId, params.messageId, hlsUrl);
  })();
}

/** Misafir: app_token ile Mux’a yükle (2 dk üst sınır). */
export async function uploadChatVideoForGuest(params: {
  appToken: string;
  conversationId: string;
  messageId: string;
  videoUri: string;
  preparedLocalUri?: string;
  onCompressing?: () => void;
  onCompressProgress?: (ratio: number) => void;
  onUploadProgress?: (ratio: number) => void;
}): Promise<void> {
  return withChatVideoDeliveryTimeout(uploadChatVideoForGuestInner(params));
}

export const chatVideoPickerOptions = feedPostMediaPickerGalleryOptions;
