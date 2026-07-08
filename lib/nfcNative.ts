/**
 * NFC native modül erişimi — TurboModule yalnızca dev/EAS build içinde vardır.
 */
import { Platform, TurboModuleRegistry } from 'react-native';

export type EIdReaderNative = {
  isNfcSupported: () => Promise<boolean>;
  isNfcEnabled: () => Promise<boolean>;
  imageDataUrlToJpegDataUrl: (dataUrl: string) => string;
  startReading: (params: unknown) => Promise<unknown>;
  stopReading: () => void;
};

/** Derlenmiş JS girişi — package.json "react-native": "src/index" Metro'da codegen modül hatası verir. */
export function loadEIdReaderModule(): { default: EIdReaderNative } | EIdReaderNative | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@2060.io/react-native-eid-reader/lib/commonjs/index.js');
  } catch {
    return null;
  }
}

export function getEIdReader(): EIdReaderNative | null {
  const mod = loadEIdReaderModule();
  if (!mod) return null;
  return ((mod as { default?: EIdReaderNative }).default ?? mod) as EIdReaderNative;
}

/** EIdReader TurboModule native binary'de kayıtlı mı? */
export function isNfcNativeLinked(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    return TurboModuleRegistry.get('EIdReader') != null;
  } catch {
    return false;
  }
}
