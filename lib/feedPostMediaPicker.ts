import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { compressFeedVideoForUpload, type FeedVideoCompressProgress } from '@/lib/feedVideoCompress';
import { copyAndroidContentUriToCacheForPreview } from '@/lib/uploadMedia';

const basePickerOptions: ImagePicker.ImagePickerOptions = {
  mediaTypes: ImagePicker.MediaTypeOptions.All,
  allowsEditing: false,
  quality: 0.8,
  base64: false,
  ...(Platform.OS === 'android'
    ? {
        videoMaxDuration: 300,
      }
    : {}),
};

/**
 * Galeride video önizlemesini geciktiren iOS transcode/export adımını kapatır.
 * Bu sayede seçilen videonun URI'si daha hızlı döner ve önizleme hemen açılır.
 */
export const feedPostMediaPickerGalleryOptions: ImagePicker.ImagePickerOptions = {
  ...basePickerOptions,
  ...(Platform.OS === 'ios'
    ? {
        videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      }
    : {}),
};

/**
 * Kamera yakalamada iOS video dosyası boyutunu makul tutmak için sıkıştırma açık kalır.
 */
export const feedPostMediaPickerCameraOptions: ImagePicker.ImagePickerOptions = {
  ...basePickerOptions,
  ...(Platform.OS === 'ios'
    ? {
        videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      }
    : {}),
};

/** Geriye dönük uyumluluk: mevcut importlar kamera profiline devam eder. */
export const feedPostMediaPickerOptions = feedPostMediaPickerCameraOptions;

/**
 * Galeri `content://` URI'leri yüklemede/önizlemede takılabilir; MapShareSheet ile aynı çözüm.
 * Android'de içerik URI'sini cache'te `file://` yapar.
 */
export async function resolveFeedPickedMediaUri(asset: {
  uri?: string | null;
  type?: ImagePicker.ImagePickerAsset['type'];
}): Promise<{ uri: string; type: 'image' | 'video' }> {
  const isVideo = asset.type === 'video';
  let uri = (asset.uri ?? '').trim();
  if (!uri) return { uri: '', type: isVideo ? 'video' : 'image' };
  if (Platform.OS === 'android' && uri.startsWith('content://')) {
    try {
      uri = await copyAndroidContentUriToCacheForPreview(uri, isVideo ? 'video' : 'image');
    } catch {
      /* uploadMedia içinde tekrar denenebilir */
    }
  }
  return { uri, type: isVideo ? 'video' : 'image' };
}

/**
 * Galeri: önce URI’yi hemen state’e yaz (önizleme anında açılsın); Android content:// kopyasını arka planda yap.
 * Paylaş’a basınca `ensureLocalFeedUploadUri` ile yükleme öncesi tamamlanır.
 */
export function applyFeedGallerySelection(
  asset: ImagePicker.ImagePickerAsset,
  setUri: (u: string) => void,
  setKind: (k: 'image' | 'video') => void
): void {
  const raw = asset.uri?.trim();
  if (!raw) return;
  const isVideo = asset.type === 'video';
  setKind(isVideo ? 'video' : 'image');
  setUri(raw);
  if (Platform.OS === 'android' && raw.startsWith('content://')) {
    void copyAndroidContentUriToCacheForPreview(raw, isVideo ? 'video' : 'image').then((next) => {
      if (next && next !== raw) setUri(next);
    });
  }
}

/** Yükleme öncesi: Android content:// → file://; videoda 4K vb. → ~1080p H.264 sıkıştırma (native). */
export async function ensureLocalFeedUploadUri(
  uri: string,
  mediaType: 'image' | 'video',
  options?: { onVideoCompressProgress?: FeedVideoCompressProgress }
): Promise<string> {
  const u = (uri ?? '').trim();
  if (!u) return u;
  let local = u;
  if (Platform.OS === 'android' && u.startsWith('content://')) {
    local = await copyAndroidContentUriToCacheForPreview(u, mediaType === 'video' ? 'video' : 'image');
  }
  if (mediaType === 'video') {
    return compressFeedVideoForUpload(local, options?.onVideoCompressProgress);
  }
  return local;
}
