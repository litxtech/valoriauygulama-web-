import { Image, Platform } from 'react-native';
import type { CameraView } from 'expo-camera';

const IS_ANDROID = Platform.OS === 'android';

/** Android: yüksek JPEG; iOS: dengeli. */
export const KBS_CAPTURE_JPEG_QUALITY = Platform.select({
  ios: 0.92,
  android: 1,
  default: 0.92,
}) ?? 0.92;

/** Odak otursun diye çekimden önce bekleme (ms). */
export const KBS_CAPTURE_AF_SETTLE_MS = IS_ANDROID ? 520 : 120;

type CameraWithPictureApi = {
  takePictureAsync?: (opts: Record<string, unknown>) => Promise<{ uri?: string } | undefined>;
  getAvailablePictureSizesAsync?: () => Promise<string[]>;
};

function parsePictureSizeLabel(label: string): { w: number; h: number; area: number } | null {
  const m = label.match(/^(\d+)x(\d+)$/i);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 640 || h < 480) return null;
  return { w, h, area: w * h };
}

/** Android: mümkün olan en yüksek net çözünürlük (12 MP üst sınır). */
export function pickKbsCapturePictureSize(sizes: string[]): string | undefined {
  const parsed = sizes.map(parsePictureSizeLabel).filter(Boolean) as { w: number; h: number; area: number }[];
  if (parsed.length === 0) return undefined;

  const MIN = IS_ANDROID ? 2_000_000 : 1_600_000;
  const MAX = IS_ANDROID ? 12_000_000 : 9_000_000;

  const inRange = parsed.filter((p) => p.area >= MIN && p.area <= MAX);
  const pool = inRange.length > 0 ? inRange : parsed;
  const best = pool.reduce((a, b) => (b.area > a.area ? b : a));
  return `${best.w}x${best.h}`;
}

export async function loadKbsCapturePictureSize(camera: CameraWithPictureApi | null): Promise<string | undefined> {
  if (!IS_ANDROID || !camera?.getAvailablePictureSizesAsync) return undefined;
  try {
    const sizes = await camera.getAvailablePictureSizesAsync();
    return pickKbsCapturePictureSize(sizes);
  } catch {
    return undefined;
  }
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function imageLongEdge(uri: string): Promise<number> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (w, h) => resolve(Math.max(w, h)), reject);
  });
}

/** Kimlik çekimi — netlik öncelikli (özellikle Android). */
export async function takeKbsIdPicture(camera: CameraView | null): Promise<{ uri: string }> {
  const cam = camera as unknown as CameraWithPictureApi | null;
  if (!cam?.takePictureAsync) throw new Error('Kamera hazır değil');

  await sleepMs(KBS_CAPTURE_AF_SETTLE_MS);

  const shot = await cam.takePictureAsync({
    quality: KBS_CAPTURE_JPEG_QUALITY,
    /** Android: Expo işleme hattı — döndürme/ölçek düzeltmesi; false bazen bulanık önizleme kalır. */
    skipProcessing: false,
    shutterSound: false,
    exif: IS_ANDROID,
    /** Android bazı cihazlarda ek netlik */
    ...(IS_ANDROID ? { imageType: 'jpg' as const } : {}),
  });

  if (!shot?.uri) throw new Error('Fotoğraf alınamadı');

  if (IS_ANDROID) {
    try {
      const long = await imageLongEdge(shot.uri);
      if (long < 1200) {
        await sleepMs(200);
        const retry = await cam.takePictureAsync({
          quality: KBS_CAPTURE_JPEG_QUALITY,
          skipProcessing: false,
          shutterSound: false,
          exif: true,
        });
        if (retry?.uri) return { uri: retry.uri };
      }
    } catch {
      /* tek çekim yeterli */
    }
  }

  return { uri: shot.uri };
}
