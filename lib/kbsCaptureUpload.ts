import { Image, Platform } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { applyKbsCaptureWatermark } from '@/lib/kbsCaptureWatermark';
import { KBS_OCR_PRO_MAX_LONG_EDGE, KBS_OCR_PRO_MIN_LONG_EDGE } from '@/lib/kbsOcrImageEnhance';

function imageLongEdge(uri: string): Promise<number> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (w, h) => resolve(Math.max(w, h)), reject);
  });
}

/** Kimlik kaydı — OCR netliği için çözünürlük normalize (küçükleri büyüt, devleri küçült). */
export async function prepareKbsCaptureImageUri(uri: string): Promise<string> {
  try {
    const long = await imageLongEdge(uri);
    const isAndroid = Platform.OS === 'android';
    const minLong = KBS_OCR_PRO_MIN_LONG_EDGE;
    const maxLong = isAndroid ? KBS_OCR_PRO_MAX_LONG_EDGE : 2800;

    const actions: { resize: { width?: number; height?: number } }[] = [];
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject);
    });

    if (long < minLong) {
      actions.push(width >= height ? { resize: { width: minLong } } : { resize: { height: minLong } });
    } else if (long > maxLong) {
      actions.push(width >= height ? { resize: { width: maxLong } } : { resize: { height: maxLong } });
    }

    let prepared = uri;
    if (actions.length) {
      const out = await manipulateAsync(uri, actions, {
        compress: isAndroid ? 0.96 : 0.92,
        format: SaveFormat.JPEG,
      });
      prepared = out.uri;
    }

    return await applyKbsCaptureWatermark(prepared);
  } catch {
    return uri;
  }
}
