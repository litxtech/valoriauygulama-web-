import type { ComponentType } from 'react';
import { isMrzVisionScannerAvailable } from '@/lib/scanner/mrzVisionAvailability';
import type { MrzLockedPayload, MrzVisionUiState } from '@/components/mrz/mrzVisionTypes';

export type MrzVisionScannerProps = {
  enabled: boolean;
  torchEnabled: boolean;
  resetToken?: number;
  keepCameraWarm?: boolean;
  unlockOnly?: boolean;
  onUiStateChange: (ui: MrzVisionUiState) => void;
  onLocked: (payload: MrzLockedPayload) => void;
  onOcrPreview?: (preview: string) => void;
};

export type MrzVisionScannerComponent = ComponentType<MrzVisionScannerProps>;

let cached: MrzVisionScannerComponent | null = null;
let loadPromise: Promise<MrzVisionScannerComponent | null> | null = null;

async function warmMrzCameraPermission(): Promise<void> {
  if (!isMrzVisionScannerAvailable()) return;
  try {
    const { Camera } = await import('react-native-vision-camera');
    const getStatus = Camera.getCameraPermissionStatus;
    if (typeof getStatus !== 'function') return;

    const statusOrPromise = getStatus.call(Camera);
    const apply = (status: string) => {
      if (status === 'not-determined' && typeof Camera.requestCameraPermission === 'function') {
        void Camera.requestCameraPermission();
      }
    };

    if (statusOrPromise != null && typeof (statusOrPromise as Promise<string>).then === 'function') {
      void (statusOrPromise as Promise<string>).then(apply).catch(() => {});
    } else if (typeof statusOrPromise === 'string') {
      apply(statusOrPromise);
    }
  } catch {
    // VisionCamera henüz bağlı değil (eski dev client / Expo Go)
  }
}

/** MRZ kamera modülünü erken yükle — ekran açılışını hızlandırır. */
export function preloadMrzVisionScanner(): Promise<MrzVisionScannerComponent | null> {
  if (!isMrzVisionScannerAvailable()) return Promise.resolve(null);
  if (cached) return Promise.resolve(cached);
  if (!loadPromise) {
    loadPromise = import('@/components/mrz/MrzVisionScanner')
      .then((mod) => {
        cached = mod.MrzVisionScanner;
        void warmMrzCameraPermission();
        return cached;
      })
      .catch(() => null);
  }
  return loadPromise;
}

export function getMrzVisionScannerCached(): MrzVisionScannerComponent | null {
  return cached;
}
