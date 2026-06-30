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
import { STAFF_INTRO_VIDEO_BUCKET } from '@/lib/staffIntroNotificationVideo';

export async function pickAndUploadKitchenMenuPromoVideo(params: {
  organizationId: string;
  onProgress?: (step: string) => void;
}): Promise<{ publicUrl?: string; posterUrl?: string; cancelled?: boolean; error?: string }> {
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
    videoMaxDuration: 180,
  });
  if (result.canceled || !result.assets[0]?.uri) return { cancelled: true };

  try {
    params.onProgress?.('Video hazırlanıyor…');
    const asset = result.assets[0];
    const localUri = await prepareFacilityJournalUploadUri(asset.uri, 'video', params.onProgress);

    params.onProgress?.('Sunucuya yükleniyor…');
    const timeout = FEED_MEDIA_UPLOAD_TIMEOUT_MS + 20 * 60 * 1000;
    const uploaded = await promiseWithTimeout(
      uploadUriToPublicBucket({
        bucketId: STAFF_INTRO_VIDEO_BUCKET,
        uri: localUri,
        kind: 'video',
        subfolder: `kitchen-menu-promo/${params.organizationId}`,
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

export async function pickKitchenMenuPromoPoster(params: {
  organizationId: string;
}): Promise<{ publicUrl?: string; cancelled?: boolean; error?: string }> {
  const granted = await ensureMediaLibraryPermission({
    title: 'Galeri',
    message: 'Kapak görseli seçmek için galeri erişimi gerekir.',
    settingsMessage: 'Ayarlardan galeri iznini açın.',
  });
  if (!granted) return { cancelled: true };

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: false,
    quality: 0.85,
  });
  if (result.canceled || !result.assets[0]?.uri) return { cancelled: true };

  try {
    const uploaded = await uploadUriToPublicBucket({
      bucketId: STAFF_INTRO_VIDEO_BUCKET,
      uri: result.assets[0].uri,
      kind: 'image',
      subfolder: `kitchen-menu-promo/${params.organizationId}/posters`,
    });
    return { publicUrl: uploaded.publicUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Görsel yüklenemedi.' };
  }
}
