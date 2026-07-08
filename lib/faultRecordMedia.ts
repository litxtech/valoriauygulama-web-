import {
  prepareFacilityJournalUploadUri,
  facilityJournalMediaPickerCameraOptions,
  facilityJournalMediaPickerGalleryOptions,
} from '@/lib/facilityJournalMedia';
import { uploadUriToPublicBucket, promiseWithTimeout, FEED_MEDIA_UPLOAD_TIMEOUT_MS } from '@/lib/storagePublicUpload';
import { extractChatVideoThumbnailUri, ensureChatVideoLocalUri } from '@/lib/chatVideoThumbnail';

export const FAULT_RECORDS_MEDIA_BUCKET = 'fault-records';
export const MAX_FAULT_RECORD_MEDIA = 8;

/** Kamera / galeri seçici seçenekleri — tesis günlüğü ile aynı 720p ayarları. */
export const faultRecordMediaCameraOptions = facilityJournalMediaPickerCameraOptions;
export const faultRecordMediaGalleryOptions = facilityJournalMediaPickerGalleryOptions;

export type FaultRecordUploadStep = (step: string) => void;

async function extractAndUploadThumbnail(localVideoUri: string, organizationId: string): Promise<string | null> {
  try {
    const local = await ensureChatVideoLocalUri(localVideoUri);
    const thumbLocal = await extractChatVideoThumbnailUri(local);
    if (!thumbLocal) return null;
    const { publicUrl } = await uploadUriToPublicBucket({
      bucketId: FAULT_RECORDS_MEDIA_BUCKET,
      uri: thumbLocal,
      kind: 'image',
      subfolder: `records/${organizationId}/thumbnails`,
    });
    return publicUrl;
  } catch {
    return null;
  }
}

/** Tek bir foto/video dosyasını hazırlar, sıkıştırır ve fault-records kovasına yükler. */
export async function uploadFaultRecordMedia(params: {
  uri: string;
  kind: 'image' | 'video';
  organizationId: string;
  onProgress?: FaultRecordUploadStep;
}): Promise<{ publicUrl: string; path: string; thumbnailUrl: string | null; mediaType: 'image' | 'video' }> {
  const localUri = await prepareFacilityJournalUploadUri(params.uri, params.kind, params.onProgress);

  const timeout = FEED_MEDIA_UPLOAD_TIMEOUT_MS + (params.kind === 'video' ? 40 * 60 * 1000 : 5 * 60 * 1000);

  const uploaded = await promiseWithTimeout(
    uploadUriToPublicBucket({
      bucketId: FAULT_RECORDS_MEDIA_BUCKET,
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
    thumbnailUrl = await extractAndUploadThumbnail(localUri, params.organizationId);
  }

  return { ...uploaded, thumbnailUrl, mediaType: params.kind };
}
