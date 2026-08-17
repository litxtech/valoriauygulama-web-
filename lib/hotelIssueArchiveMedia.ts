import {
  prepareFacilityJournalUploadUri,
  facilityJournalMediaPickerCameraOptions,
  facilityJournalMediaPickerGalleryOptions,
  FACILITY_JOURNAL_UPLOAD_CONCURRENCY,
} from '@/lib/facilityJournalMedia';
import { uploadUriToPublicBucket, promiseWithTimeout, FEED_MEDIA_UPLOAD_TIMEOUT_MS } from '@/lib/storagePublicUpload';
import { extractChatVideoThumbnailUri, ensureChatVideoLocalUri } from '@/lib/chatVideoThumbnail';

export const HOTEL_ISSUE_ARCHIVE_MEDIA_BUCKET = 'hotel-issue-archive';
export const MAX_HOTEL_ISSUE_ARCHIVE_MEDIA = 10;
export const HOTEL_ISSUE_ARCHIVE_UPLOAD_CONCURRENCY = FACILITY_JOURNAL_UPLOAD_CONCURRENCY;

export const hotelIssueArchiveMediaCameraOptions = facilityJournalMediaPickerCameraOptions;
export const hotelIssueArchiveMediaGalleryOptions = facilityJournalMediaPickerGalleryOptions;

export type HotelIssueArchiveUploadStep = (step: string) => void;
export type HotelIssueArchiveBatchProgress = (done: number, total: number, step: string) => void;

async function extractAndUploadThumbnail(localVideoUri: string, organizationId: string): Promise<string | null> {
  try {
    const local = await ensureChatVideoLocalUri(localVideoUri);
    const thumbLocal = await extractChatVideoThumbnailUri(local);
    if (!thumbLocal) return null;
    const { publicUrl } = await uploadUriToPublicBucket({
      bucketId: HOTEL_ISSUE_ARCHIVE_MEDIA_BUCKET,
      uri: thumbLocal,
      kind: 'image',
      subfolder: `records/${organizationId}/thumbnails`,
    });
    return publicUrl;
  } catch {
    return null;
  }
}

export async function uploadHotelIssueArchiveMedia(params: {
  uri: string;
  kind: 'image' | 'video';
  organizationId: string;
  onProgress?: HotelIssueArchiveUploadStep;
}): Promise<{ publicUrl: string; path: string; thumbnailUrl: string | null; mediaType: 'image' | 'video' }> {
  const localUri = await prepareFacilityJournalUploadUri(params.uri, params.kind, params.onProgress);
  const timeout = FEED_MEDIA_UPLOAD_TIMEOUT_MS + (params.kind === 'video' ? 40 * 60 * 1000 : 5 * 60 * 1000);

  const uploaded = await promiseWithTimeout(
    uploadUriToPublicBucket({
      bucketId: HOTEL_ISSUE_ARCHIVE_MEDIA_BUCKET,
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

/** Medyaları paralel (sınırlı eşzamanlılık) yükler — hızlı kayıt için. */
export async function uploadHotelIssueArchiveMediaBatch(params: {
  items: Array<{ uri: string; kind: 'image' | 'video' }>;
  organizationId: string;
  concurrency?: number;
  onProgress?: HotelIssueArchiveBatchProgress;
}): Promise<Array<{ publicUrl: string; path: string; thumbnailUrl: string | null; mediaType: 'image' | 'video' }>> {
  const total = params.items.length;
  if (total === 0) return [];

  const concurrency = Math.max(1, Math.min(params.concurrency ?? HOTEL_ISSUE_ARCHIVE_UPLOAD_CONCURRENCY, total));
  const results: Array<{ publicUrl: string; path: string; thumbnailUrl: string | null; mediaType: 'image' | 'video' } | null> =
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
        results[i] = await uploadHotelIssueArchiveMedia({
          uri: params.items[i].uri,
          kind: params.items[i].kind,
          organizationId: params.organizationId,
          onProgress: (step) => {
            stepByIndex[i] = step;
            report();
          },
        });
      } catch (e) {
        throw e;
      } finally {
        finished += 1;
        report();
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results.filter((r): r is NonNullable<typeof r> => r != null);
}
