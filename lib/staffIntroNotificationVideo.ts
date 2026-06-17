import * as ImagePicker from 'expo-image-picker';
import {
  facilityJournalMediaPickerGalleryOptions,
  prepareFacilityJournalUploadUri,
} from '@/lib/facilityJournalMedia';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import {
  FEED_MEDIA_UPLOAD_TIMEOUT_MS,
  promiseWithTimeout,
  uploadUriToPublicBucket,
} from '@/lib/storagePublicUpload';

export const STAFF_INTRO_VIDEO_BUCKET = 'feed-media';

export function isStaffIntroUploadedVideo(url: string | null | undefined): boolean {
  const u = url?.trim() || '';
  return u.includes('/storage/v1/object/') && u.includes('staff-intro/');
}

export async function pickAndUploadStaffIntroVideo(params: {
  organizationId: string;
  onProgress?: (step: string) => void;
}): Promise<{ publicUrl?: string; cancelled?: boolean; error?: string }> {
  const granted = await ensureMediaLibraryPermission({
    title: 'Galeri',
    message: 'Tanıtım videosu seçmek için galeri erişimi gerekir.',
    settingsMessage: 'Ayarlardan galeri iznini açın.',
  });
  if (!granted) return { cancelled: true };

  const result = await ImagePicker.launchImageLibraryAsync({
    ...facilityJournalMediaPickerGalleryOptions,
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    allowsMultipleSelection: false,
    videoMaxDuration: 600,
  });
  if (result.canceled || !result.assets[0]?.uri) return { cancelled: true };

  try {
    params.onProgress?.('Video hazırlanıyor…');
    const localUri = await prepareFacilityJournalUploadUri(
      result.assets[0].uri,
      'video',
      params.onProgress
    );

    params.onProgress?.('Sunucuya yükleniyor…');
    const timeout = FEED_MEDIA_UPLOAD_TIMEOUT_MS + 40 * 60 * 1000;
    const uploaded = await promiseWithTimeout(
      uploadUriToPublicBucket({
        bucketId: STAFF_INTRO_VIDEO_BUCKET,
        uri: localUri,
        kind: 'video',
        subfolder: `staff-intro/${params.organizationId}`,
        preferStreamUpload: true,
      }),
      timeout,
      'Video yükleme zaman aşımına uğradı.'
    );

    return { publicUrl: uploaded.publicUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Video yüklenemedi.' };
  }
}
