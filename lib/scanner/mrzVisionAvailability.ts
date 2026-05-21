/** VisionCamera + ML Kit native modülleri yüklü mü (dev client / EAS build). */
export function isMrzVisionScannerAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('react-native-vision-camera');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('react-native-vision-camera-mlkit');
    return true;
  } catch {
    return false;
  }
}
