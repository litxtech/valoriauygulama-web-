import type { MrzCameraFrameKind } from '@/lib/scanner/mrzFrameTheme';
import type { ParsedDocument } from '@/lib/scanner/types';

export type MrzVisionUiState = {
  frameKind: MrzCameraFrameKind;
  hint: string;
  showSpinner: boolean;
  successGlow: boolean;
};

export type MrzLockedPayload = { mrz: string; parsed: ParsedDocument };
