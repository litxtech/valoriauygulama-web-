import { NativeModules, Platform } from 'react-native';

/** VisionCamera native modülü yüklü mü (dev client / EAS build). Paketi require etmez — route ağacı kırılmaz. */
export function isMrzVisionScannerAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  const nm = NativeModules as Record<string, unknown>;
  if (!nm.CameraView && !nm.VisionCameraProxy) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Camera } = require('react-native-vision-camera') as {
      Camera?: { getCameraPermissionStatus?: unknown };
    };
    return typeof Camera?.getCameraPermissionStatus === 'function';
  } catch {
    return false;
  }
}
