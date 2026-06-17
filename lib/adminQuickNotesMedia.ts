import { Platform } from 'react-native';
import {
  prepareFacilityJournalUploadUri,
  facilityJournalMediaPickerBase,
  facilityJournalMediaPickerCameraOptions,
  facilityJournalMediaPickerGalleryOptions,
  FACILITY_JOURNAL_UPLOAD_CONCURRENCY,
} from '@/lib/facilityJournalMedia';

export const ADMIN_NOTES_MEDIA_BUCKET = 'admin-notes';

/** Yönetici notlarında medya sayısı sınırı yok (pratik üst sınır çok yüksek). */
export const ADMIN_NOTES_MEDIA_SOFT_CAP = 999;

export const adminNotesMediaPickerBase = facilityJournalMediaPickerBase;
export const adminNotesMediaPickerCameraOptions = facilityJournalMediaPickerCameraOptions;
export const adminNotesMediaPickerGalleryOptions = {
  ...facilityJournalMediaPickerGalleryOptions,
  allowsMultipleSelection: true,
};

export async function prepareAdminNoteUploadUri(
  uri: string,
  mediaType: 'image' | 'video',
  onProgress?: (step: string) => void
): Promise<string> {
  return prepareFacilityJournalUploadUri(uri, mediaType, onProgress);
}

export async function uploadAdminNoteMedia(params: {
  uri: string;
  kind: 'image' | 'video';
  organizationId: string;
  skipPrepare?: boolean;
  onProgress?: (step: string) => void;
}): Promise<{ publicUrl: string; path: string; thumbnailUrl: string | null }> {
  const { uploadUriToPublicBucket, promiseWithTimeout, FEED_MEDIA_UPLOAD_TIMEOUT_MS } = await import(
    '@/lib/storagePublicUpload'
  );
  const { extractAndUploadFacilityJournalVideoThumbnail } = await import('@/lib/facilityJournalVideoThumbnail');

  const localUri = params.skipPrepare
    ? params.uri
    : await prepareAdminNoteUploadUri(params.uri, params.kind, params.onProgress);

  const timeout =
    FEED_MEDIA_UPLOAD_TIMEOUT_MS + (params.kind === 'video' ? 40 * 60 * 1000 : 5 * 60 * 1000);

  const uploaded = await promiseWithTimeout(
    uploadUriToPublicBucket({
      bucketId: ADMIN_NOTES_MEDIA_BUCKET,
      uri: localUri,
      kind: params.kind,
      subfolder: `notes/${params.organizationId}`,
      preferStreamUpload: true,
    }),
    timeout,
    params.kind === 'video'
      ? 'Video yükleme zaman aşımına uğradı.'
      : 'Yükleme zaman aşımına uğradı.'
  );

  let thumbnailUrl: string | null = null;
  if (params.kind === 'video' && Platform.OS !== 'web') {
    params.onProgress?.('Video önizlemesi…');
    thumbnailUrl = await extractAndUploadFacilityJournalVideoThumbnail(localUri, params.organizationId);
  }

  return { ...uploaded, thumbnailUrl };
}

export async function uploadAdminNoteMediaBatch(params: {
  items: Array<{ uri: string; kind: 'image' | 'video'; skipPrepare?: boolean }>;
  organizationId: string;
  onProgress?: (done: number, total: number, step: string) => void;
}): Promise<Array<{ publicUrl: string; path: string; thumbnailUrl: string | null }>> {
  const total = params.items.length;
  if (total === 0) return [];

  const concurrency = Math.max(1, Math.min(FACILITY_JOURNAL_UPLOAD_CONCURRENCY, total));
  const results: Array<{ publicUrl: string; path: string; thumbnailUrl: string | null } | null> =
    new Array(total).fill(null);
  let next = 0;
  let done = 0;

  const worker = async () => {
    while (next < total) {
      const i = next++;
      const item = params.items[i];
      params.onProgress?.(done, total, `${i + 1}/${total} yükleniyor…`);
      results[i] = await uploadAdminNoteMedia({
        uri: item.uri,
        kind: item.kind,
        organizationId: params.organizationId,
        skipPrepare: item.skipPrepare,
        onProgress: (step) => params.onProgress?.(done, total, step),
      });
      done++;
      params.onProgress?.(done, total, `${done}/${total} tamam`);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results.filter(Boolean) as Array<{ publicUrl: string; path: string; thumbnailUrl: string | null }>;
}
