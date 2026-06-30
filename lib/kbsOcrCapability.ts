import { Platform } from 'react-native';
import { isMrzVisionScannerAvailable } from '@/lib/scanner/mrzVisionAvailability';

export type KbsOcrCapability = 'mlkit' | 'expo' | 'none';

function isExpoTextExtractorAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-text-extractor') as { isSupported?: boolean };
    return mod?.isSupported !== false;
  } catch {
    return false;
  }
}

/** Cihazda kullanılabilir kimlik OCR motoru — build: ML Kit, buildsiz: expo. */
export function getKbsOcrCapability(): KbsOcrCapability {
  if (isMrzVisionScannerAvailable()) return 'mlkit';
  if (isExpoTextExtractorAvailable()) return 'expo';
  return 'none';
}

export function kbsOcrCapabilityLabel(cap: KbsOcrCapability): string {
  if (cap === 'mlkit') return 'ML Kit (native build)';
  if (cap === 'expo') return 'expo-text-extractor';
  return 'OCR kullanılamıyor';
}
