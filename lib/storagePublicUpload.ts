/**
 * Public storage: önce Edge Function (service role, RLS bypass), olmazsa doğrudan client upload.
 *
 * `upload-app-storage` edge ~3MB base64 sınırı koyar; video ve daha büyük dosyalar doğrudan Storage'a gider.
 *
 * Video (yerel file://): Tüm dosyayı belleğe `ArrayBuffer` ile okumak yerine `expo-file-system` uploadAsync
 * ile Storage REST'e doğrudan stream benzeri yükleme — büyük dosyalarda çok daha hızlı, zaman aşımına daha az takılır.
 */
import { Platform } from 'react-native';
import { encode as encodeBase64 } from 'base64-arraybuffer';
import * as ImageManipulator from 'expo-image-manipulator';
import { getInfoAsync, uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';
import { uriToArrayBuffer, getMimeAndExt, isLocalFileUriForUpload, copyUriToCacheForUpload } from '@/lib/uploadMedia';
import { prepareCrossPlatformUploadImageUri, ensureCrossPlatformJpegUriForUpload, uriMayBeHeic } from '@/lib/crossPlatformImage';
import { sanitizeSupabaseErrorMessage } from '@/lib/supabaseTransientErrors';
import { withPromiseTimeout } from '@/lib/edgeInvokeTimeout';

/** Görsel yükleme (edge/base64 veya doğrudan Storage) — yavaş/takılı ağda sonsuz spinner'ı keser. */
const IMAGE_UPLOAD_TIMEOUT_MS = 45_000;

const EXPENSE_RECEIPT_BUCKET = 'expense-receipts';
const EXPENSE_RECEIPT_MAX_WIDTH = 1600;

/** `supabase/functions/upload-app-storage` ile uyumlu (yakl. 3MB ham dosya) */
const EDGE_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;

/** Edge deploy/522 sorunlarında doğrudan Storage yeterli (RLS: authenticated insert). */
const BUCKETS_PREFER_DIRECT_UPLOAD = new Set(['facility-journal', 'fault-records', 'expense-receipts', 'breakfast-partner-camera']);

/** `feed-media` bucket `file_size_limit` (155_feed_media_bucket_file_size_limit.sql) ile aynı */
const FEED_MEDIA_MAX_BYTES = 157286400;

/** Büyük video + yavaş ağda `upload`/`fetch` takılınca sonsuz yükleme göstergesini keser */
export const FEED_MEDIA_UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

export function promiseWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutMessage: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export async function requireAuthUid(message = 'Oturum gerekli.'): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const id = session?.user?.id;
  if (!id) throw new Error(message);
  return id;
}

export type PublicUploadKind = 'image' | 'video';

/** MIME parametrelerini at; Storage bucket tam eşleşme isteyebilir */
function stripMimeParams(mime: string): string {
  return (mime.split(';')[0] ?? '').trim();
}

/**
 * feed-media bucket allowed_mime_types (159 migration) ile uyum.
 * Mobil cihazlar bazen video/3gpp, application/octet-stream veya codecs parametreli video/mp4 gönderir.
 */
function contentTypeForFeedUpload(kind: PublicUploadKind, ext: string, mime: string): string {
  const base = stripMimeParams(mime).toLowerCase();
  const e = ext.toLowerCase();

  if (kind === 'image') {
    if (base.startsWith('image/')) return base;
    return 'image/jpeg';
  }

  const allowed = new Set([
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/3gpp',
    'video/mpeg',
    'video/x-matroska',
    'application/mp4',
  ]);
  if (allowed.has(base)) return base;

  if (base === 'video/3gp') return 'video/3gpp';
  if (base === 'application/octet-stream' || base === 'binary/octet-stream') {
    if (e === 'mov') return 'video/quicktime';
    return 'video/mp4';
  }
  if (e === 'mov' || e === 'qt') return 'video/quicktime';
  if (e === 'webm') return 'video/webm';
  if (e === 'mkv') return 'video/x-matroska';
  return 'video/mp4';
}

function storageContentType(bucketId: string, kind: PublicUploadKind, ext: string, mime: string): string {
  if (bucketId === 'feed-media' || bucketId === 'facility-journal' || bucketId === 'fault-records') {
    return contentTypeForFeedUpload(kind, ext, mime);
  }
  return stripMimeParams(mime);
}

/** uploadAsync için RN yerel dosya yolu (content:// burada kullanılmaz; önce cache file:// yapılmalı). */
function normalizeLocalUriForNativeUpload(uri: string): string {
  const u = (uri ?? '').trim();
  if (u.startsWith('file://')) return u;
  if (Platform.OS === 'android' && u.startsWith('/')) return `file://${u}`;
  return u;
}

function nativeUploadTimeoutMs(fileSizeBytes: number): number {
  const assumedBps = 100_000;
  const byThroughput = Math.ceil(fileSizeBytes / assumedBps) * 1000;
  return Math.max(120_000, Math.min(FEED_MEDIA_UPLOAD_TIMEOUT_MS + 20 * 60 * 1000, byThroughput + 8000));
}

function buildStorageObjectUploadUrl(bucketId: string, objectPathInBucket: string): string {
  const base = supabaseUrl.replace(/\/+$/, '');
  const segments = [bucketId, ...objectPathInBucket.split('/').filter(Boolean)].map((s) => encodeURIComponent(s));
  return `${base}/storage/v1/object/${segments.join('/')}`;
}

async function uploadLocalFileToSupabaseStorageNative(params: {
  bucketId: string;
  /** Örn. guest_xxx/uuid.mp4 veya uid/posts/uuid.mp4 */
  objectPath: string;
  localUri: string;
  contentType: string;
  accessToken: string;
}): Promise<void> {
  const local = normalizeLocalUriForNativeUpload(params.localUri);
  const info = await getInfoAsync(local);
  if (!info.exists || !('size' in info) || typeof info.size !== 'number' || info.size <= 0) {
    throw new Error('Video dosyası bulunamadı veya boş. Galeriden yeniden seçin.');
  }
  if (params.bucketId === 'feed-media' && info.size > FEED_MEDIA_MAX_BYTES) {
    throw new Error(
      'Dosya çok büyük (feed için üst sınır ~150 MB). Daha kısa bir video seçin; iOS’ta tekrar seçince sıkıştırılmış dosya kullanılır.'
    );
  }

  const url = buildStorageObjectUploadUrl(params.bucketId, params.objectPath);
  const result = await promiseWithTimeout(
    uploadAsync(url, local, {
      httpMethod: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        apikey: supabaseAnonKey,
        'Content-Type': params.contentType,
        'x-upsert': 'false',
      },
      uploadType: FileSystemUploadType.BINARY_CONTENT,
    }),
    nativeUploadTimeoutMs(info.size),
    'Dosya yükleme zaman aşımı — bağlantınızı kontrol edip tekrar deneyin.'
  );

  if (result.status < 200 || result.status >= 300) {
    const bodyPeek = (result.body ?? '').trim();
    if (
      result.status === 522 ||
      result.status === 523 ||
      result.status === 524 ||
      result.status === 503 ||
      bodyPeek.toLowerCase().includes('error code 522')
    ) {
      throw new Error('Supabase geçici olarak erişilemiyor (522)');
    }
    let msg = `Storage yüklemesi başarısız (HTTP ${result.status})`;
    try {
      const j = JSON.parse(bodyPeek) as { message?: string; error?: string; statusCode?: string };
      if (typeof j?.message === 'string' && j.message) msg = j.message;
      else if (typeof j?.error === 'string' && j.error) msg = j.error;
    } catch {
      if (bodyPeek) msg = `${msg}: ${bodyPeek.slice(0, 240)}`;
    }
    throw new Error(msg);
  }
}

async function compressExpenseReceiptUri(localUri: string): Promise<string> {
  try {
    const out = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: EXPENSE_RECEIPT_MAX_WIDTH } }],
      { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG }
    );
    return out?.uri ?? localUri;
  } catch {
    return localUri;
  }
}

/**
 * Personel harcama fişi — yalnızca Storage REST (Edge Function yok).
 * Cloudflare 522 Edge loglarında görünmez; istek doğrudan storage/v1/object gider.
 */
export async function uploadExpenseReceiptDirect(localUri: string): Promise<{ publicUrl: string; path: string }> {
  let uploadUri = localUri;
  if (!isLocalFileUriForUpload(uploadUri)) {
    uploadUri = await copyUriToCacheForUpload(uploadUri, 'image');
  }
  uploadUri = await compressExpenseReceiptUri(uploadUri);

  const uploadMime = 'image/jpeg';
  const uid = await requireAuthUid();
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const fileName = `${uid}/receipt/${unique}.jpg`;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Oturum gerekli.');

  await uploadLocalFileToSupabaseStorageNative({
    bucketId: EXPENSE_RECEIPT_BUCKET,
    objectPath: fileName,
    localUri: uploadUri,
    contentType: uploadMime,
    accessToken: token,
  });

  const { data } = supabase.storage.from(EXPENSE_RECEIPT_BUCKET).getPublicUrl(fileName);
  return { publicUrl: data.publicUrl, path: fileName };
}

type EdgeBody = {
  bucket: string;
  base64: string;
  content_type: string;
  extension: string;
  subfolder?: string;
  guest_id?: string;
};

async function invokeUploadAppStorage(body: EdgeBody): Promise<{ publicUrl: string; path: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Oturum gerekli');

  const { data, error } = await withPromiseTimeout(
    supabase.functions.invoke('upload-app-storage', {
      body,
      headers: { Authorization: `Bearer ${session.access_token}` },
    }),
    IMAGE_UPLOAD_TIMEOUT_MS,
    'Görsel yükleme zaman aşımı — bağlantınızı kontrol edip tekrar deneyin'
  );

  if (error) throw new Error(error.message ?? 'Edge yükleme hatası');
  const d = data as { public_url?: string; path?: string; error?: string } | null;
  if (d?.error) throw new Error(d.error);
  if (!d?.public_url) throw new Error('Sunucu yanıtı geçersiz');
  return { publicUrl: d.public_url, path: d.path ?? '' };
}

export async function uploadUriToPublicBucket(params: {
  bucketId: string;
  uri: string;
  kind?: PublicUploadKind;
  /** auth uid altında alt klasör, örn. "stock", "staff/abc" */
  subfolder?: string;
  /** Otel eşyası kullanım kaydı vb.: mümkünse belleğe almadan doğrudan Storage REST */
  preferStreamUpload?: boolean;
}): Promise<{ publicUrl: string; path: string }> {
  const kind = params.kind ?? 'image';
  let uploadUri = params.uri;

  // iOS HEIC/HEIF ve uzantısız görüntüleri her platformda görüntülenebilir JPEG'e çevir.
  if (kind === 'image') {
    uploadUri = await prepareCrossPlatformUploadImageUri(uploadUri);
    if (uriMayBeHeic(uploadUri)) {
      uploadUri = await ensureCrossPlatformJpegUriForUpload(uploadUri, {
        maxWidth: 2048,
        compress: 0.82,
      });
    }
  }

  if (
    (params.bucketId === 'facility-journal' || params.bucketId === 'fault-records') &&
    (kind === 'video' || !isLocalFileUriForUpload(uploadUri))
  ) {
    if (!isLocalFileUriForUpload(uploadUri)) {
      uploadUri = await copyUriToCacheForUpload(uploadUri, kind === 'video' ? 'video' : 'image');
    }
  } else if (kind === 'video' && !isLocalFileUriForUpload(uploadUri)) {
    uploadUri = await copyUriToCacheForUpload(uploadUri, 'video');
  }
  if (
    (params.preferStreamUpload || params.bucketId === 'expense-receipts') &&
    kind === 'image' &&
    !isLocalFileUriForUpload(uploadUri)
  ) {
    uploadUri = await copyUriToCacheForUpload(uploadUri, 'image');
  }

  const { ext: rawExt, mime: rawMime } = getMimeAndExt(uploadUri, kind === 'video' ? 'video' : 'image');
  let ext = rawExt;
  let mime = rawMime;
  // Güvenlik ağı: dönüşüm sonrası bile HEIC uzantısı kalırsa JPEG olarak kaydet.
  if (kind === 'image' && (ext === 'heic' || ext === 'heif' || mime.includes('heic') || mime.includes('heif'))) {
    ext = 'jpg';
    mime = 'image/jpeg';
  }
  const uploadMime = storageContentType(params.bucketId, kind, ext, mime);

  const sub = (params.subfolder ?? '').replace(/^\/+|\/+$/g, '');
  const uid = await requireAuthUid();
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const fileName = sub ? `${uid}/${sub}/${unique}.${ext}` : `${uid}/${unique}.${ext}`;

  const useStream =
    isLocalFileUriForUpload(uploadUri) &&
    (kind === 'video' ||
      params.preferStreamUpload === true ||
      BUCKETS_PREFER_DIRECT_UPLOAD.has(params.bucketId));

  if (useStream) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Oturum gerekli.');
    await uploadLocalFileToSupabaseStorageNative({
      bucketId: params.bucketId,
      objectPath: fileName,
      localUri: uploadUri,
      contentType: uploadMime,
      accessToken: token,
    });
    const { data } = supabase.storage.from(params.bucketId).getPublicUrl(fileName);
    return { publicUrl: data.publicUrl, path: fileName };
  }

  if (kind === 'video') {
    throw new Error(
      'Video dosyası hazırlanamadı. Galeriden yeniden seçin veya uygulamayı yeniden başlatıp deneyin.'
    );
  }

  const arrayBuffer = await uriToArrayBuffer(uploadUri, { mediaKind: 'image' });
  if (params.bucketId === 'feed-media' && arrayBuffer.byteLength > FEED_MEDIA_MAX_BYTES) {
    throw new Error(
      'Dosya çok büyük (feed için üst sınır ~150 MB). Daha kısa bir video seçin; iOS’ta tekrar seçince sıkıştırılmış dosya kullanılır.'
    );
  }
  /** Video / fiş / kullanım kaydı: Edge/base64 yavaş veya 522; doğrudan Storage. */
  const tryEdge =
    !BUCKETS_PREFER_DIRECT_UPLOAD.has(params.bucketId) && arrayBuffer.byteLength <= EDGE_UPLOAD_MAX_BYTES;

  let edgeErr: unknown = null;
  if (tryEdge) {
    try {
      const base64 = encodeBase64(arrayBuffer);
      return await invokeUploadAppStorage({
        bucket: params.bucketId,
        base64,
        content_type: uploadMime,
        extension: ext,
        ...(sub ? { subfolder: sub } : {}),
      });
    } catch (e) {
      edgeErr = e;
    }
  }

  const { error } = await withPromiseTimeout(
    supabase.storage.from(params.bucketId).upload(fileName, arrayBuffer, {
      contentType: uploadMime,
      upsert: false,
    }),
    IMAGE_UPLOAD_TIMEOUT_MS,
    'Görsel yükleme zaman aşımı — bağlantınızı kontrol edip tekrar deneyin'
  );
  if (error) {
    const storageMsg = sanitizeSupabaseErrorMessage(error.message);
    if (BUCKETS_PREFER_DIRECT_UPLOAD.has(params.bucketId)) {
      throw new Error(storageMsg);
    }
    const a = edgeErr ? sanitizeSupabaseErrorMessage((edgeErr as Error)?.message ?? '') : '';
    throw new Error(a ? `${a} | Storage: ${storageMsg}` : storageMsg);
  }
  const { data } = supabase.storage.from(params.bucketId).getPublicUrl(fileName);
  return { publicUrl: data.publicUrl, path: fileName };
}

/** URI olmadan (mesajlaşma buffer vb.) */
export async function uploadBufferToPublicBucket(params: {
  bucketId: string;
  buffer: ArrayBuffer;
  contentType: string;
  extension: string;
  subfolder: string;
}): Promise<{ publicUrl: string; path: string }> {
  const sub = params.subfolder.replace(/^\/+|\/+$/g, '');
  const normalizedContentType =
    params.bucketId === 'feed-media'
      ? contentTypeForFeedUpload(
          params.contentType.startsWith('video/') ? 'video' : 'image',
          params.extension,
          params.contentType
        )
      : stripMimeParams(params.contentType);
  const isVideoMime = normalizedContentType.startsWith('video/');
  const tryEdge =
    !isVideoMime && params.buffer.byteLength <= EDGE_UPLOAD_MAX_BYTES;

  let edgeErr: unknown = null;
  if (tryEdge) {
    try {
      const base64 = encodeBase64(params.buffer);
      return await invokeUploadAppStorage({
        bucket: params.bucketId,
        base64,
        content_type: normalizedContentType,
        extension: params.extension,
        subfolder: sub,
      });
    } catch (e) {
      edgeErr = e;
    }
  }

  const uid = await requireAuthUid();
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const fileName = `${uid}/${sub}/${unique}.${params.extension}`;
  const { error } = await supabase.storage.from(params.bucketId).upload(fileName, params.buffer, {
    contentType: normalizedContentType,
    upsert: false,
  });
  if (error) {
    const a = edgeErr ? ((edgeErr as Error)?.message ?? '') : '';
    throw new Error(a ? `${a} | Storage: ${error.message}` : error.message);
  }
  const { data } = supabase.storage.from(params.bucketId).getPublicUrl(fileName);
  return { publicUrl: data.publicUrl, path: fileName };
}

/**
 * Misafir feed-media: Edge ile guest_{id}/ yolu (RLS’ten bağımsız).
 */
export async function uploadGuestFeedMedia(params: {
  uri: string;
  guestId: string;
  kind?: PublicUploadKind;
}): Promise<{ publicUrl: string; path: string }> {
  const kind = params.kind ?? 'image';
  let guestUri = params.uri;
  // iOS HEIC/HEIF → Android uyumlu JPEG (misafir feed paylaşımları).
  if (kind === 'image') {
    guestUri = await prepareCrossPlatformUploadImageUri(guestUri);
    if (uriMayBeHeic(guestUri)) {
      guestUri = await ensureCrossPlatformJpegUriForUpload(guestUri, {
        maxWidth: 2048,
        compress: 0.82,
      });
    }
  }

  let { ext, mime } = getMimeAndExt(guestUri, kind === 'video' ? 'video' : 'image');
  if (kind === 'image' && (ext === 'heic' || ext === 'heif')) {
    ext = 'jpg';
    mime = 'image/jpeg';
  }
  const uploadMime = contentTypeForFeedUpload(kind, ext, mime);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const fileName = `guest_${params.guestId}/${unique}.${ext}`;
  if (kind === 'video' && !isLocalFileUriForUpload(guestUri)) {
    guestUri = await copyUriToCacheForUpload(guestUri, 'video');
  }
  if (isLocalFileUriForUpload(guestUri) && kind === 'video') {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Oturum gerekli.');
    await uploadLocalFileToSupabaseStorageNative({
      bucketId: 'feed-media',
      objectPath: fileName,
      localUri: guestUri,
      contentType: uploadMime,
      accessToken: token,
    });
    const { data } = supabase.storage.from('feed-media').getPublicUrl(fileName);
    return { publicUrl: data.publicUrl, path: fileName };
  }

  const arrayBuffer = await uriToArrayBuffer(guestUri, { mediaKind: kind === 'video' ? 'video' : 'image' });
  if (arrayBuffer.byteLength > FEED_MEDIA_MAX_BYTES) {
    throw new Error(
      'Dosya çok büyük (feed için üst sınır ~150 MB). Daha kısa bir video seçin; iOS’ta tekrar seçince sıkıştırılmış dosya kullanılır.'
    );
  }

  const tryEdge = arrayBuffer.byteLength <= EDGE_UPLOAD_MAX_BYTES;

  let edgeErr: unknown = null;
  if (tryEdge) {
    try {
      const base64 = encodeBase64(arrayBuffer);
      return await invokeUploadAppStorage({
        bucket: 'feed-media',
        base64,
        content_type: uploadMime,
        extension: ext,
        guest_id: params.guestId,
      });
    } catch (e) {
      edgeErr = e;
    }
  }

  const { error } = await supabase.storage.from('feed-media').upload(fileName, arrayBuffer, {
    contentType: uploadMime,
    upsert: false,
  });
  if (error) {
    const a = edgeErr ? ((edgeErr as Error)?.message ?? '') : '';
    throw new Error(a ? `${a} | Storage: ${error.message}` : error.message);
  }
  const { data } = supabase.storage.from('feed-media').getPublicUrl(fileName);
  return { publicUrl: data.publicUrl, path: fileName };
}
