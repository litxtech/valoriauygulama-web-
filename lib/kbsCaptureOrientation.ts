/** Kamera `skipProcessing:true` ile gelen EXIF Orientation → prepare’da döndür. */

const byUri = new Map<string, number>();

const ORIENT_CACHE_MAX = 80;

function cachePut(uri: string, orientation: number): void {
  if (byUri.size >= ORIENT_CACHE_MAX) {
    const oldest = byUri.keys().next().value;
    if (oldest !== undefined) byUri.delete(oldest);
  }
  byUri.set(uri, orientation);
}

/** EXIF Orientation (1–8). Bilinmiyorsa no-op. */
export function rememberKbsCaptureOrientation(uri: string, orientation: unknown): void {
  const n = typeof orientation === 'number' ? orientation : Number(orientation);
  if (!Number.isFinite(n) || n < 2 || n > 8) return;
  cachePut(uri, Math.trunc(n));
}

/** Tüket: bir kez oku, sil. */
export function takeKbsCaptureOrientation(uri: string): number | undefined {
  const v = byUri.get(uri);
  if (v === undefined) return undefined;
  byUri.delete(uri);
  return v;
}

/** ImageManipulator `rotate` (saat yönü derece). */
export function exifOrientationToRotateDegrees(orientation: number): number | null {
  switch (orientation) {
    case 3:
      return 180;
    case 6:
      return 90;
    case 8:
      return 270;
    default:
      return null;
  }
}
