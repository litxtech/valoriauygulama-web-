import * as ImagePicker from 'expo-image-picker';
import { launchImageLibraryFast } from '@/lib/mediaLibraryPermission';

const COVER_PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ImagePicker.MediaTypeOptions.Images,
  allowsEditing: true,
  aspect: [3, 2],
  quality: 0.7,
};

/** Profil kapak fotoğrafı — butona basınca galeri hemen açılır. */
export async function pickProfileCoverUri(settingsMessage?: string): Promise<string | null> {
  const result = await launchImageLibraryFast(COVER_PICKER_OPTIONS, settingsMessage);
  if (!result || result.canceled || !result.assets[0]?.uri) return null;
  return result.assets[0].uri;
}
