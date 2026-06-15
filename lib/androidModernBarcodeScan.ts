import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { CameraView, type BarcodeType } from 'expo-camera';

export type BarcodeScanPayload = { type: string; data: string };

export function isAndroidModernBarcodeScannerAvailable(): boolean {
  return Platform.OS === 'android' && CameraView.isModernBarcodeScannerAvailable;
}

/**
 * Android 13+ / Google Code Scanner: expo-camera önizleme yerine sistem tarayıcısını açar.
 * Misafir QR ve stok barkod ekranlarında okuma güvenilirliğini artırır.
 */
export function useAndroidModernBarcodeScanner(
  enabled: boolean,
  barcodeTypes: BarcodeType[],
  onScan: (result: BarcodeScanPayload) => void
): boolean {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const useModern = enabled && isAndroidModernBarcodeScannerAvailable();

  useEffect(() => {
    if (!useModern) return;

    const sub = CameraView.onModernBarcodeScanned((event) => {
      onScanRef.current({ type: event.type, data: event.data });
    });

    CameraView.launchScanner({ barcodeTypes }).catch(() => {
      /* Cihaz desteklemiyorsa klasik CameraView devreye girer */
    });

    return () => sub.remove();
  }, [useModern, barcodeTypes.join(',')]);

  return useModern;
}

export async function relaunchAndroidModernBarcodeScanner(barcodeTypes: BarcodeType[]): Promise<void> {
  if (!isAndroidModernBarcodeScannerAvailable()) return;
  await CameraView.launchScanner({ barcodeTypes });
}
