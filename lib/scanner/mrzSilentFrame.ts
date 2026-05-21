import type { RefObject } from 'react';
import type { CameraView } from 'expo-camera';
import * as FileSystem from 'expo-file-system';

/** Önizlemeden geçici kare (galeriye gitmez; iş bitince silinir). */
export async function captureSilentPreviewFrame(
  cameraRef: RefObject<CameraView | null>,
  quality: number
): Promise<string | null> {
  const cam = cameraRef.current as {
    takePictureAsync?: (opts: Record<string, unknown>) => Promise<{ uri?: string }>;
  } | null;
  if (!cam?.takePictureAsync) return null;

  const photo = await cam.takePictureAsync({
    quality,
    skipProcessing: true,
    ...(typeof quality === 'number' ? {} : {}),
  });
  return photo?.uri ?? null;
}

export async function deleteSilentFrame(uri: string | null): Promise<void> {
  if (!uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    /* ignore */
  }
}
