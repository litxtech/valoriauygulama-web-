/**
 * Önemli kamera kaydı medya yükleme — sıkıştırma yok (hız + Metro compressor HMR çökmesi önleme).
 * Dosya local hale getirilir ve Storage’a stream ile gider.
 */
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { getInfoAsync } from 'expo-file-system/legacy';
import {
  facilityJournalMediaPickerCameraOptions,
  facilityJournalMediaPickerGalleryOptions,
} from '@/lib/facilityJournalMedia';
import {
  uploadUriToPublicBucket,
  promiseWithTimeout,
  FEED_MEDIA_UPLOAD_TIMEOUT_MS,
} from '@/lib/storagePublicUpload';
import { extractChatVideoThumbnailUri, ensureChatVideoLocalUri } from '@/lib/chatVideoThumbnail';
import { copyUriToCacheForUpload, isLocalFileUriForUpload } from '@/lib/uploadMedia';

export const SECURITY_CAMERA_RECORDINGS_BUCKET = 'security-camera-recordings';
export const MAX_SECURITY_CAMERA_RECORDING_MEDIA = 4;

export const securityCameraRecordingCameraOptions: ImagePicker.ImagePickerOptions = {
  ...facilityJournalMediaPickerCameraOptions,
  videoMaxDuration: 600,
};

/** Galeri: Passthrough — seçimde iOS transcode yok. */
export const securityCameraRecordingGalleryOptions: ImagePicker.ImagePickerOptions = {
  ...facilityJournalMediaPickerGalleryOptions,
  videoMaxDuration: 600,
  ...(Platform.OS === 'ios'
    ? {
        videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      }
    : {}),
};

export type SecurityCameraRecordingUploadStep = (step: string) => void;

function normalizeFileUri(uri: string): string {
  const u = (uri ?? '').trim();
  if (!u) return u;
  if (u.startsWith('file://')) return u;
  if (Platform.OS === 'android' && u.startsWith('/') && !u.startsWith('content://')) {
    return `file://${u}`;
  }
  return u;
}

async function getLocalFileSizeBytes(uri: string): Promise<number | null> {
  try {
    const info = await getInfoAsync(normalizeFileUri(uri));
    if (info.exists && 'size' in info && typeof info.size === 'number' && info.size > 0) {
      return info.size;
    }
  } catch {
    /* optional */
  }
  return null;
}

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

async function prepareSecurityUploadUri(
  uri: string,
  mediaType: 'image' | 'video',
  onProgress?: SecurityCameraRecordingUploadStep
): Promise<string> {
  let local = (uri ?? '').trim();
  if (!local) return local;

  if (!isLocalFileUriForUpload(local)) {
    onProgress?.(mediaType === 'video' ? 'Video hazırlanıyor…' : 'Dosya hazırlanıyor…');
    local = await copyUriToCacheForUpload(local, mediaType === 'video' ? 'video' : 'image');
  }
  local = normalizeFileUri(local);

  if (mediaType === 'image') {
    onProgress?.('Fotoğraf hazırlanıyor…');
    try {
      const out = await ImageManipulator.manipulateAsync(
        local,
        [{ resize: { width: 1600 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      return normalizeFileUri(out?.uri ?? local);
    } catch {
      return local;
    }
  }

  return local;
}

async function uploadThumbnailFromLocal(
  thumbLocalUri: string,
  organizationId: string
): Promise<string | null> {
  try {
    const { publicUrl } = await uploadUriToPublicBucket({
      bucketId: SECURITY_CAMERA_RECORDINGS_BUCKET,
      uri: thumbLocalUri,
      kind: 'image',
      subfolder: `recordings/${organizationId}/thumbnails`,
    });
    return publicUrl;
  } catch {
    return null;
  }
}

export async function uploadSecurityCameraRecordingMedia(params: {
  uri: string;
  kind: 'image' | 'video';
  organizationId: string;
  /** Seçim anında üretilmiş poster — yeniden extract atlanır. */
  posterUri?: string | null;
  onProgress?: SecurityCameraRecordingUploadStep;
}): Promise<{
  publicUrl: string;
  path: string;
  thumbnailUrl: string | null;
  mediaType: 'image' | 'video';
}> {
  const localUri = await prepareSecurityUploadUri(params.uri, params.kind, params.onProgress);
  const sizeBytes = await getLocalFileSizeBytes(localUri);
  params.onProgress?.(
    sizeBytes != null ? `Yükleniyor (~${formatMb(sizeBytes)} MB)…` : 'Sunucuya gönderiliyor…'
  );

  const timeout =
    FEED_MEDIA_UPLOAD_TIMEOUT_MS + (params.kind === 'video' ? 40 * 60 * 1000 : 5 * 60 * 1000);

  const thumbPrepPromise =
    params.kind === 'video'
      ? (async () => {
          if (params.posterUri && isLocalFileUriForUpload(params.posterUri)) {
            return params.posterUri;
          }
          try {
            const local = await ensureChatVideoLocalUri(localUri);
            return await extractChatVideoThumbnailUri(local);
          } catch {
            return null;
          }
        })()
      : Promise.resolve(null);

  const [uploaded, thumbLocal] = await Promise.all([
    promiseWithTimeout(
      uploadUriToPublicBucket({
        bucketId: SECURITY_CAMERA_RECORDINGS_BUCKET,
        uri: localUri,
        kind: params.kind,
        subfolder: `recordings/${params.organizationId}`,
        preferStreamUpload: true,
      }),
      timeout,
      params.kind === 'video'
        ? 'Video yükleme zaman aşımına uğradı. Wi‑Fi ile tekrar deneyin.'
        : 'Yükleme zaman aşımına uğradı. Bağlantınızı kontrol edip tekrar deneyin.'
    ),
    thumbPrepPromise,
  ]);

  let thumbnailUrl: string | null = null;
  if (params.kind === 'video' && thumbLocal) {
    params.onProgress?.('Önizleme yükleniyor…');
    thumbnailUrl = await uploadThumbnailFromLocal(thumbLocal, params.organizationId);
  }

  return { ...uploaded, thumbnailUrl, mediaType: params.kind };
}
