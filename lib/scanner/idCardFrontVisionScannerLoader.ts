import type { ComponentType, Ref } from 'react';
import { isMrzVisionScannerAvailable } from '@/lib/scanner/mrzVisionAvailability';
import type {
  IdCardFrontLockedPayload,
  IdCardFrontVisionScannerRef,
  IdCardFrontVisionUiState,
} from '@/components/kbs/idCardFrontVisionTypes';

export type IdCardFrontVisionScannerProps = {
  enabled: boolean;
  torchEnabled: boolean;
  resetToken?: number;
  onUiStateChange: (ui: IdCardFrontVisionUiState) => void;
  onLocked: (payload: IdCardFrontLockedPayload) => void;
  onOcrPreview?: (preview: string) => void;
};

export type IdCardFrontVisionScannerComponent = ComponentType<
  IdCardFrontVisionScannerProps & { ref?: Ref<IdCardFrontVisionScannerRef> }
>;

export type { IdCardFrontVisionScannerRef };

let cached: IdCardFrontVisionScannerComponent | null = null;
let loadPromise: Promise<IdCardFrontVisionScannerComponent | null> | null = null;

export function preloadIdCardFrontVisionScanner(): Promise<IdCardFrontVisionScannerComponent | null> {
  if (!isMrzVisionScannerAvailable()) return Promise.resolve(null);
  if (cached) return Promise.resolve(cached);
  if (!loadPromise) {
    loadPromise = import('@/components/kbs/IdCardFrontVisionScanner')
      .then((mod) => {
        cached = mod.IdCardFrontVisionScanner;
        return cached;
      })
      .catch(() => null);
  }
  return loadPromise;
}

export function getIdCardFrontVisionScannerCached(): IdCardFrontVisionScannerComponent | null {
  return cached;
}
