import { Platform } from 'react-native';
import type { CameraView } from 'expo-camera';
import { rememberKbsCaptureOrientation } from '@/lib/kbsCaptureOrientation';

const IS_ANDROID = Platform.OS === 'android';
const IS_IOS = Platform.OS === 'ios';

/** Kimlik çekimi: uzak / normal / yakın (Android + iOS). */
export type KbsCaptureDistance = 'far' | 'normal' | 'near';

/**
 * Dijital zoom (0–1). iOS’ta optik telefoto varsa yakın modda 0 (lens yeterli);
 * yoksa geniş açıda dijital yakınlaştırma.
 */
export function kbsCaptureZoomForDistance(
  distance: KbsCaptureDistance,
  opts?: { hasTelephotoLens?: boolean }
): number {
  switch (distance) {
    case 'far':
      return 0;
    case 'near':
      if (IS_IOS && opts?.hasTelephotoLens) return 0;
      return IS_IOS ? 0.32 : 0.38;
    default:
      return 0;
  }
}

export function kbsCaptureHasLensKind(
  lenses: string[],
  kind: 'ultraWide' | 'telephoto'
): boolean {
  return lenses.some((name) => {
    const s = lensScore(name);
    return kind === 'ultraWide' ? s.ultra : s.tele;
  });
}

function lensScore(name: string): { ultra: boolean; tele: boolean; wide: boolean } {
  const n = name.toLowerCase();
  const ultra =
    /ultra\s*wide|ultrawide|0\.5|ultra\s*geni[sş]|ultra\s*weit|grand\s*angle/.test(n) ||
    (n.includes('ultra') && (n.includes('wide') || n.includes('geni') || n.includes('weit')));
  const tele = /telephoto|telefoto|t[eé]l[eé]objectif|\btele\b|2x|3x/.test(n);
  const wide =
    !ultra &&
    !tele &&
    (/wide|geni[sş]|weitwinkel|grand\s*angulaire|\bback camera\b|\barka kamera\b/.test(n) ||
      n.includes('camera') ||
      n.includes('kamera'));
  return { ultra, tele, wide };
}

/** iOS `selectedLens` — mevcut lens listesinden uzak / normal / yakın. */
export function pickKbsCaptureLens(
  lenses: string[],
  distance: KbsCaptureDistance
): string | undefined {
  if (!IS_IOS || lenses.length === 0) return undefined;

  const scored = lenses.map((raw) => ({ raw, ...lensScore(raw) }));
  const ultra = scored.find((l) => l.ultra)?.raw;
  const tele = scored.find((l) => l.tele)?.raw;
  const wide =
    scored.find((l) => l.wide && !l.ultra && !l.tele)?.raw ??
    scored.find((l) => !l.ultra && !l.tele)?.raw ??
    lenses[0];

  switch (distance) {
    case 'far':
      return ultra ?? wide;
    case 'near':
      return tele ?? wide;
    default:
      return wide;
  }
}

/**
 * Shutter öncelikli: skipProcessing + kısa encode.
 * Yön düzeltmesi prepare (OCR öncesi) aşamasında uygulanır.
 */
export const KBS_CAPTURE_JPEG_QUALITY = Platform.select({
  ios: 0.88,
  android: 0.86,
  default: 0.88,
}) ?? 0.88;

/** AF beklemesi shutter’ı geciktiriyordu — kaldırıldı. */
export const KBS_CAPTURE_AF_SETTLE_MS = 0;

type CameraPictureResult = {
  uri?: string;
  exif?: Record<string, unknown> | null;
};

type CameraWithPictureApi = {
  takePictureAsync?: (opts: Record<string, unknown>) => Promise<CameraPictureResult | undefined>;
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

/** ~4–6 MP: shutter daha hızlı, OCR için yeterli. */
export function pickKbsCapturePictureSize(sizes: string[]): string | undefined {
  const parsed = sizes.map(parsePictureSizeLabel).filter(Boolean) as { w: number; h: number; area: number }[];
  if (parsed.length === 0) return undefined;

  const MIN = 2_000_000;
  const MAX = 6_500_000;
  const SWEET = 4_500_000;

  const inRange = parsed.filter((p) => p.area >= MIN && p.area <= MAX);
  const pool = inRange.length > 0 ? inRange : parsed;
  const best = pool.reduce((a, b) =>
    Math.abs(b.area - SWEET) < Math.abs(a.area - SWEET) ? b : a
  );
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
  if (ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

/** Kimlik çekimi — anında deklanşör; yön/OCR prepare’da. */
export async function takeKbsIdPicture(camera: CameraView | null): Promise<{ uri: string }> {
  const cam = camera as unknown as CameraWithPictureApi | null;
  if (!cam?.takePictureAsync) throw new Error('Kamera hazır değil');

  if (KBS_CAPTURE_AF_SETTLE_MS > 0) {
    await sleepMs(KBS_CAPTURE_AF_SETTLE_MS);
  }

  const shot = await cam.takePictureAsync({
    quality: KBS_CAPTURE_JPEG_QUALITY,
    /** Native re-encode yok → shutter snappy. */
    skipProcessing: true,
    shutterSound: false,
    exif: true,
    ...(IS_ANDROID ? { imageType: 'jpg' as const } : {}),
  });

  if (!shot?.uri) throw new Error('Fotoğraf alınamadı');
  rememberKbsCaptureOrientation(shot.uri, shot.exif?.Orientation ?? shot.exif?.orientation);
  return { uri: shot.uri };
}
