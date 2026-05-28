import { NativeModules, Platform } from 'react-native';

/**
 * Canlı MRZ (react-native-vision-camera) yüklü mü.
 * Expo Camera da `CameraView` native adını kullanır — onu Vision sanmayın.
 */
export function isMrzVisionScannerAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  const nm = NativeModules as Record<string, unknown>;
  if (!nm.VisionCameraProxy) return false;
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
