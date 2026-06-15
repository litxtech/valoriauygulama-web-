import type { MrzCameraFrameKind } from '@/lib/scanner/mrzFrameTheme';
import type { ParsedDocument } from '@/lib/scanner/types';

export type IdCardFrontVisionUiState = {
  frameKind: MrzCameraFrameKind;
  hint: string;
  showSpinner: boolean;
  successGlow: boolean;
};

export type IdCardFrontLockedPayload = {
  parsed: ParsedDocument;
  imageUri: string;
};

export type IdCardFrontVisionScannerRef = {
  /** Manuel deklanşör — kabul kriteri gevşek; fotoğraf her zaman kuyruğa gider. */
  captureNow: () => void;
};
