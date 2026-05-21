/** Baskı / ekran — logolu poster ve logosuz QR için QR modül boyutu (px) */
export type QrExportSizePreset = {
  id: string;
  label: string;
  hint: string;
  qrSize: number;
  /** Logosuz QR export (aynı qrSize) */
  plainQrSize: number;
};

/** Küçükten büyüğe — A4 genişliğine yakın (300 dpi ~2480px, mobilde güvenli üst sınır) */
export const QR_EXPORT_SIZE_PRESETS: QrExportSizePreset[] = [
  { id: 'xs', label: 'Mini', hint: '384 px · etiket', qrSize: 384, plainQrSize: 384 },
  { id: 'sm', label: 'Küçük', hint: '512 px · ekran', qrSize: 512, plainQrSize: 512 },
  { id: 'md', label: 'Orta', hint: '800 px · paylaşım', qrSize: 800, plainQrSize: 800 },
  { id: 'lg', label: 'Büyük', hint: '1200 px · poster', qrSize: 1200, plainQrSize: 1200 },
  { id: 'xl', label: 'XL', hint: '1600 px · baskı', qrSize: 1600, plainQrSize: 1600 },
  { id: 'a6', label: 'A6', hint: '~105×148 mm', qrSize: 900, plainQrSize: 900 },
  { id: 'a5', label: 'A5', hint: '~148×210 mm', qrSize: 1200, plainQrSize: 1200 },
  { id: 'a4', label: 'A4', hint: '~210×297 mm', qrSize: 2000, plainQrSize: 2000 },
];

export const DEFAULT_QR_EXPORT_SIZE_ID = 'md';

export function getQrExportSizePreset(id: string): QrExportSizePreset {
  return QR_EXPORT_SIZE_PRESETS.find((p) => p.id === id) ?? QR_EXPORT_SIZE_PRESETS[2]!;
}

/** @deprecated QR_EXPORT_SIZE_PRESETS kullanın */
export const QR_EXPORT_SIZES = QR_EXPORT_SIZE_PRESETS.map((p) => p.qrSize) as unknown as readonly number[];
export const DEFAULT_QR_EXPORT_SIZE = getQrExportSizePreset(DEFAULT_QR_EXPORT_SIZE_ID).qrSize;
