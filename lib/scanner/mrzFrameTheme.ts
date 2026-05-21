import type { MrzSaveBlockReason } from './mrzScanGate';

/** Kamera üstü rehber ve çerçeve — kullanıcı spec’ine uygun durum renkleri */
export type MrzCameraFrameKind =
  | 'idle'
  | 'hunting'
  | 'signal'
  | 'reading'
  | 'ready_save'
  | 'no_mrz'
  | 'suspect_ocr'
  | 'checksum_bad'
  | 'success';

export const MRZ_FRAME_BORDER: Record<MrzCameraFrameKind, string> = {
  idle: '#9CA3AF',
  hunting: '#9CA3AF',
  signal: '#F59E0B',
  reading: '#2563EB',
  ready_save: '#CA8A04',
  no_mrz: '#DC2626',
  suspect_ocr: '#EA580C',
  checksum_bad: '#DC2626',
  success: '#16A34A',
};

export const MRZ_FRAME_PILL_BG: Record<MrzCameraFrameKind, string> = {
  idle: 'rgba(156,163,175,0.92)',
  hunting: 'rgba(107,114,128,0.9)',
  signal: 'rgba(245,158,11,0.92)',
  reading: 'rgba(37,99,235,0.92)',
  ready_save: 'rgba(202,138,4,0.92)',
  no_mrz: 'rgba(220,38,38,0.92)',
  suspect_ocr: 'rgba(234,88,12,0.92)',
  checksum_bad: 'rgba(220,38,38,0.92)',
  success: 'rgba(22,163,74,0.92)',
};

export function frameKindFromGate(reason: MrzSaveBlockReason): MrzCameraFrameKind {
  switch (reason) {
    case 'no_mrz':
      return 'no_mrz';
    case 'parse_failed':
    case 'low_confidence_ocr':
      return 'suspect_ocr';
    case 'checksum_invalid':
      return 'checksum_bad';
    default:
      return 'no_mrz';
  }
}
