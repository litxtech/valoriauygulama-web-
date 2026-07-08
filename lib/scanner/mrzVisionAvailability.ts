import { NativeModules, Platform } from 'react-native';

/**
 * Canlı MRZ (react-native-vision-camera) yüklü mü.
 * VisionCamera v4 native adı `CameraView` / `CameraDevices`.
 * `VisionCameraProxy` JS global’dir — NativeModules’te aranmaz.
 * Expo Camera da `CameraView` kullanır; JS `Camera.getCameraPermissionStatus` ile ayırt edilir.
 */
export function isMrzVisionScannerAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  const nm = NativeModules as Record<string, unknown>;
  // VisionCamera v4: CameraView (permissions/API) + CameraDevices (device list)
  if (!nm.CameraView && !nm.CameraDevices) return false;
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
