/** @deprecated lib/qrHubPresets ve lib/qrExportSizes kullanın */
export { DEFAULT_QR_EXPORT_SIZE_ID, QR_EXPORT_SIZE_PRESETS } from '@/lib/qrExportSizes';

import type { QRDesign } from '@/components/DesignableQR';

export const DEFAULT_QR_DESIGN: QRDesign = {
  useLogo: false,
  backgroundColor: '#FFFFFF',
  foregroundColor: '#1a365d',
  shape: 'rounded',
  quietZone: 12,
  ecl: 'M',
  gradient: { from: '#1a365d', to: '#14b8a6' },
};
