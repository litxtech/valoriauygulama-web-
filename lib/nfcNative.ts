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

/**
 * Doğrudan TurboModule — paket `getEnforcing` ile yüklenirken JS hatası verse bile
 * native bağlıysa okuma yapılabilsin.
 */
export function getEIdReader(): EIdReaderNative | null {
  if (Platform.OS === 'web') return null;

  try {
    const tm = TurboModuleRegistry.get('EIdReader') as EIdReaderNative | null;
    if (tm && typeof tm.startReading === 'function') return tm;
  } catch {
    /* ignore */
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@2060.io/react-native-eid-reader/lib/commonjs/index.js') as
      | { default?: EIdReaderNative }
      | EIdReaderNative;
    const reader = (mod as { default?: EIdReaderNative }).default ?? (mod as EIdReaderNative);
    if (reader && typeof reader.startReading === 'function') return reader;
  } catch {
    /* Expo Go / eski client */
  }

  return null;
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
