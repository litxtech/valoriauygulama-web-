import { Image, Platform } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

function imageLongEdge(uri: string): Promise<number> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (w, h) => resolve(Math.max(w, h)), reject);
  });
}

/** Kimlik kaydı: Android'de aşırı küçültme/sıkıştırma OCR'ı bulanıklaştırır. */
export async function prepareKbsCaptureImageUri(uri: string): Promise<string> {
  try {
    const long = await imageLongEdge(uri);
    const isAndroid = Platform.OS === 'android';

    if (isAndroid && long <= 2200) {
      return uri;
    }

    const targetWidth = isAndroid ? 2200 : 1600;
    const out = await manipulateAsync(
      uri,
      long > targetWidth ? [{ resize: { width: targetWidth } }] : [],
      { compress: isAndroid ? 0.94 : 0.85, format: SaveFormat.JPEG }
    );
    return out.uri;
  } catch {
    return uri;
  }
}
