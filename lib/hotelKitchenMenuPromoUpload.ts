import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { HOTEL_KITCHEN_MENU_BUCKET } from '@/lib/hotelKitchenMenu';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { copyUriToCacheForUpload, isLocalFileUriForUpload } from '@/lib/uploadMedia';
import {
  FEED_MEDIA_UPLOAD_TIMEOUT_MS,
  promiseWithTimeout,
  uploadUriToPublicBucket,
} from '@/lib/storagePublicUpload';
import {
  kitchenMenuPromoVideoPickerOptions,
  prepareKitchenMenuPromoVideoUri,
} from '@/lib/kitchenMenuPromoVideoUpload';

const PROMO_POSTER_MAX_WIDTH = 1280;

export const kitchenMenuPromoPosterPickerOptions: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsMultipleSelection: false,
  allowsEditing: false,
  quality: 0.85,
  base64: false,
  ...(Platform.OS === 'ios'
    ? {
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      }
    : {}),
};

function promoSubfolder(organizationId: string, kind: 'videos' | 'posters'): string {
  return `org/${organizationId}/promo/${kind}`;
}

/** Android content:// ve HEIC → her zaman JPEG (menü fotoğrafı ile aynı yaklaşım). */
async function preparePromoPosterUri(uri: string): Promise<string> {
  let local = (uri ?? '').trim();
  if (!local) return local;

  if (!isLocalFileUriForUpload(local)) {
    local = await copyUriToCacheForUpload(local, 'image');
  }

  try {
    const out = await ImageManipulator.manipulateAsync(
      local,
      [{ resize: { width: PROMO_POSTER_MAX_WIDTH } }],
      { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
    );
    if (out?.uri) return out.uri;
  } catch {
    /* fallback */
  }

  return local;
}

export async function pickAndUploadKitchenMenuPromoVideo(params: {
  organizationId: string;
  onProgress?: (step: string) => void;
}): Promise<{ publicUrl?: string; cancelled?: boolean; error?: string }> {
  const granted = await ensureMediaLibraryPermission({
    title: 'Galeri',
    message: 'Tanıtım videosu seçmek için galeri erişimi gerekir.',
    settingsMessage: 'Ayarlardan galeri iznini açın.',
  });
  if (!granted) return { cancelled: true };

  params.onProgress?.('Galeriden seçiliyor…');
  const result = await ImagePicker.launchImageLibraryAsync(kitchenMenuPromoVideoPickerOptions);
  if (result.canceled || !result.assets[0]?.uri) return { cancelled: true };

  try {
    const asset = result.assets[0];
    const localUri = await prepareKitchenMenuPromoVideoUri(asset.uri, { fileSize: asset.fileSize }, params.onProgress);

    params.onProgress?.('Sunucuya yükleniyor…');
    const timeout = FEED_MEDIA_UPLOAD_TIMEOUT_MS + 15 * 60 * 1000;
    const uploaded = await promiseWithTimeout(
      uploadUriToPublicBucket({
        bucketId: HOTEL_KITCHEN_MENU_BUCKET,
        uri: localUri,
        kind: 'video',
        subfolder: promoSubfolder(params.organizationId, 'videos'),
        preferStreamUpload: true,
      }),
      timeout,
      'Video yükleme zaman aşımına uğradı. Wi‑Fi ile tekrar deneyin.'
    );

    return { publicUrl: uploaded.publicUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Video yüklenemedi.' };
  }
}

export async function pickKitchenMenuPromoPoster(params: {
  organizationId: string;
  onProgress?: (step: string) => void;
}): Promise<{ publicUrl?: string; cancelled?: boolean; error?: string }> {
  const granted = await ensureMediaLibraryPermission({
    title: 'Galeri',
    message: 'Kapak görseli seçmek için galeri erişimi gerekir.',
    settingsMessage: 'Ayarlardan galeri iznini açın.',
  });
  if (!granted) return { cancelled: true };

  params.onProgress?.('Görsel hazırlanıyor…');
  const result = await ImagePicker.launchImageLibraryAsync(kitchenMenuPromoPosterPickerOptions);
  if (result.canceled || !result.assets[0]?.uri) return { cancelled: true };

  try {
    const jpegUri = await preparePromoPosterUri(result.assets[0].uri);
    params.onProgress?.('Sunucuya yükleniyor…');
    const uploaded = await uploadUriToPublicBucket({
      bucketId: HOTEL_KITCHEN_MENU_BUCKET,
      uri: jpegUri,
      kind: 'image',
      subfolder: promoSubfolder(params.organizationId, 'posters'),
      preferStreamUpload: true,
    });
    return { publicUrl: uploaded.publicUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Görsel yüklenemedi.' };
  }
}
