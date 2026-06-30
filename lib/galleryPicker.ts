import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  ensureMediaLibraryPermission,
  type EnsureMediaLibraryPermissionOptions,
} from '@/lib/mediaLibraryPermission';

export type PickGalleryImagesOptions = {
  quality?: number;
  /** Kalan slot (ör. max 3 foto, zaten 1 var → selectionLimit: 2) */
  selectionLimit?: number;
  permission?: EnsureMediaLibraryPermissionOptions;
};

/**
 * Galeri: tek seferde birden fazla fotoğraf seç (izin bir kez, seçim çoklu).
 */
export async function pickGalleryImages(
  options?: PickGalleryImagesOptions
): Promise<string[]> {
  const granted = await ensureMediaLibraryPermission(options?.permission);
  if (!granted) return [];

  const limit = Math.max(1, options?.selectionLimit ?? 10);
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    allowsEditing: false,
    quality: options?.quality ?? 0.8,
    selectionLimit: limit,
    ...(Platform.OS === 'ios'
      ? {
          preferredAssetRepresentationMode:
            ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        }
      : {}),
  });

  if (result.canceled || !result.assets?.length) return [];
  return result.assets.map((a) => a.uri).filter(Boolean) as string[];
}
