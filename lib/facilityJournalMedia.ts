import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { getInfoAsync } from 'expo-file-system/legacy';
import { compressFacilityJournalVideoForUpload } from '@/lib/facilityJournalVideoCompress';
import { copyUriToCacheForUpload, isLocalFileUriForUpload } from '@/lib/uploadMedia';

export const FACILITY_JOURNAL_MEDIA_BUCKET = 'facility-journal';
export const MAX_FACILITY_JOURNAL_MEDIA = 12;

export type FacilityJournalMediaLabel = 'general' | 'before' | 'after';

export type FacilityJournalUploadProgress = (step: string) => void;

const JOURNAL_IMAGE_MAX_WIDTH = 1280;
/** Aynı anda en fazla kaç medya yüklensin (sıralı değil). */
export const FACILITY_JOURNAL_UPLOAD_CONCURRENCY = 3;

export const facilityJournalMediaPickerBase: ImagePicker.ImagePickerOptions = {
  mediaTypes: ImagePicker.MediaTypeOptions.All,
  allowsEditing: false,
  quality: 0.72,
  base64: false,
};

/** Kamera: hızlı 720p’ye yakın kayıt. */
export const facilityJournalMediaPickerCameraOptions: ImagePicker.ImagePickerOptions = {
  ...facilityJournalMediaPickerBase,
  ...(Platform.OS === 'ios'
    ? {
        videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      }
    : {}),
};

/** Galeri: orta kalite export — Passthrough dev videoları yavaşlatır. */
export const facilityJournalMediaPickerGalleryOptions: ImagePicker.ImagePickerOptions = {
  ...facilityJournalMediaPickerBase,
  allowsMultipleSelection: true,
  ...(Platform.OS === 'ios'
    ? {
        videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      }
    : {}),
};

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

/** URI → file://; video her boyutta 720p H.264 sıkıştırılır (MB reddi yok). */
export async function prepareFacilityJournalUploadUri(
  uri: string,
  mediaType: 'image' | 'video',
  onProgress?: FacilityJournalUploadProgress
): Promise<string> {
  const u = (uri ?? '').trim();
  if (!u) return u;

  let local = u;
  if (!isLocalFileUriForUpload(local)) {
    onProgress?.(
      mediaType === 'video'
        ? 'Video hazırlanıyor…'
        : 'Dosya hazırlanıyor…'
    );
    local = await copyUriToCacheForUpload(local, mediaType === 'video' ? 'video' : 'image');
  }
  local = normalizeFileUri(local);

  if (mediaType === 'image') {
    onProgress?.('Fotoğraf hazırlanıyor…');
    try {
      const out = await ImageManipulator.manipulateAsync(
        local,
        [{ resize: { width: JOURNAL_IMAGE_MAX_WIDTH } }],
        { compress: 0.78, format: ImageManipulator.SaveFormat.JPEG }
      );
      return normalizeFileUri(out?.uri ?? local);
    } catch {
      return local;
    }
  }

  onProgress?.('720p sıkıştırılıyor…');
  local = await compressFacilityJournalVideoForUpload(local, (progress01) => {
    if (progress01 >= 0 && progress01 <= 1) {
      onProgress?.(`720p sıkıştırılıyor… %${Math.round(progress01 * 100)}`);
    }
  });
  local = normalizeFileUri(local);

  const sizeAfter = await getLocalFileSizeBytes(local);
  if (sizeAfter != null) {
    onProgress?.(`Yükleniyor (~${formatMb(sizeAfter)} MB)…`);
  } else {
    onProgress?.('Sunucuya gönderiliyor…');
  }

  return local;
}

/** Tesis günlüğü medyası: 720p + doğrudan Storage stream. */
export async function uploadFacilityJournalMedia(params: {
  uri: string;
  kind: 'image' | 'video';
  organizationId: string;
  /** true: sıkıştırma/kopyalama atlanır (submit öncesi hazırlanmış URI). */
  skipPrepare?: boolean;
  onProgress?: FacilityJournalUploadProgress;
}): Promise<{ publicUrl: string; path: string; thumbnailUrl: string | null }> {
  const { uploadUriToPublicBucket, promiseWithTimeout, FEED_MEDIA_UPLOAD_TIMEOUT_MS } = await import(
    '@/lib/storagePublicUpload'
  );
  const { extractAndUploadFacilityJournalVideoThumbnail } = await import(
    '@/lib/facilityJournalVideoThumbnail'
  );

  const localUri = params.skipPrepare
    ? normalizeFileUri(params.uri)
    : await prepareFacilityJournalUploadUri(params.uri, params.kind, params.onProgress);

  const sizeBytes = await getLocalFileSizeBytes(localUri);
  const sizeHint = sizeBytes != null ? ` (~${formatMb(sizeBytes)} MB)` : '';

  if (params.kind === 'image' && sizeHint) {
    params.onProgress?.(`Fotoğraf yükleniyor${sizeHint}…`);
  }

  const timeout =
    FEED_MEDIA_UPLOAD_TIMEOUT_MS + (params.kind === 'video' ? 40 * 60 * 1000 : 5 * 60 * 1000);

  const uploaded = await promiseWithTimeout(
    uploadUriToPublicBucket({
      bucketId: FACILITY_JOURNAL_MEDIA_BUCKET,
      uri: localUri,
      kind: params.kind,
      subfolder: `records/${params.organizationId}`,
      preferStreamUpload: true,
    }),
    timeout,
    params.kind === 'video'
      ? 'Video yükleme zaman aşımına uğradı. Wi‑Fi ile tekrar deneyin.'
      : 'Yükleme zaman aşımına uğradı. Bağlantınızı kontrol edip tekrar deneyin.'
  );

  let thumbnailUrl: string | null = null;
  if (params.kind === 'video') {
    params.onProgress?.('Video önizlemesi oluşturuluyor…');
    thumbnailUrl = await extractAndUploadFacilityJournalVideoThumbnail(localUri, params.organizationId);
  }

  return { ...uploaded, thumbnailUrl };
}

export type FacilityJournalBatchProgress = (done: number, total: number, step: string) => void;

/** Medyaları sırayla değil, sınırlı paralellikle yükler. */
export async function uploadFacilityJournalMediaBatch(params: {
  items: Array<{ uri: string; kind: 'image' | 'video'; skipPrepare?: boolean }>;
  organizationId: string;
  concurrency?: number;
  onProgress?: FacilityJournalBatchProgress;
}): Promise<Array<{ publicUrl: string; path: string; thumbnailUrl: string | null }>> {
  const total = params.items.length;
  if (total === 0) return [];

  const concurrency = Math.max(1, Math.min(params.concurrency ?? FACILITY_JOURNAL_UPLOAD_CONCURRENCY, total));
  const results: Array<{ publicUrl: string; path: string; thumbnailUrl: string | null } | null> =
    new Array(total).fill(null);
  const stepByIndex: string[] = new Array(total).fill('Bekliyor…');
  let nextIndex = 0;
  let finished = 0;

  const report = () => {
    const active = stepByIndex.filter((s) => s && !s.startsWith('Bekliyor')).join(' · ');
    params.onProgress?.(finished, total, active || 'Yükleniyor…');
  };

  const worker = async () => {
    while (true) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= total) return;

      stepByIndex[i] = 'Hazırlanıyor…';
      report();
      try {
        results[i] = await uploadFacilityJournalMedia({
          uri: params.items[i].uri,
          kind: params.items[i].kind,
          skipPrepare: params.items[i].skipPrepare,
          organizationId: params.organizationId,
          onProgress: (step) => {
            stepByIndex[i] = `${i + 1}/${total}: ${step}`;
            report();
          },
        });
      } finally {
        finished += 1;
        report();
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const missing = results.findIndex((r) => r == null);
  if (missing >= 0) throw new Error('Bazı medya dosyaları yüklenemedi.');
  return results as Array<{ publicUrl: string; path: string; thumbnailUrl: string | null }>;
}
