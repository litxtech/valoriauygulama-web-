/**
 * Web menü tanıtım videosu — sıkıştırıcı modülü kullanmadan hızlı yükleme.
 * (expo-image-and-video-compressor lazy chunk Metro'da bazen "unknown module" veriyor.)
 */
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getInfoAsync } from 'expo-file-system/legacy';
import { copyUriToCacheForUpload, isLocalFileUriForUpload } from '@/lib/uploadMedia';

export const KITCHEN_MENU_PROMO_MAX_DURATION_SEC = 180;

export type KitchenMenuPromoUploadProgress = (step: string) => void;

export const kitchenMenuPromoVideoPickerOptions: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['videos'],
  allowsEditing: false,
  allowsMultipleSelection: false,
  quality: 0.55,
  base64: false,
  videoMaxDuration: KITCHEN_MENU_PROMO_MAX_DURATION_SEC,
  ...(Platform.OS === 'ios'
    ? {
        videoExportPreset: ImagePicker.VideoExportPreset.LowQuality,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Low,
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

/** file:// hazırlığı; sıkıştırma yok — doğrudan Storage stream upload. */
export async function prepareKitchenMenuPromoVideoUri(
  uri: string,
  hints?: { fileSize?: number | null },
  onProgress?: KitchenMenuPromoUploadProgress
): Promise<string> {
  let local = (uri ?? '').trim();
  if (!local) return local;

  if (!isLocalFileUriForUpload(local)) {
    onProgress?.('Video hazırlanıyor…');
    local = await copyUriToCacheForUpload(local, 'video');
  }
  local = normalizeFileUri(local);

  const sizeBytes =
    hints?.fileSize && hints.fileSize > 0 ? hints.fileSize : await getLocalFileSizeBytes(local);
  if (sizeBytes != null) {
    onProgress?.(`Yükleniyor (~${(sizeBytes / (1024 * 1024)).toFixed(1)} MB)…`);
  } else {
    onProgress?.('Sunucuya yükleniyor…');
  }
  return local;
}
