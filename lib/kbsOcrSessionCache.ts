import {
  buildKbsOcrEnhancedVariants,
  prepareProfessionalKbsOcrUri,
  type KbsOcrEnhancedVariants,
} from '@/lib/kbsOcrImageEnhance';

const MAX_ENTRIES = 10;

const preparedCache = new Map<string, Promise<string>>();
const variantsCache = new Map<string, Promise<KbsOcrEnhancedVariants>>();

function touch<K, V>(map: Map<K, V>, key: K, value: V): V {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  if (map.size > MAX_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  return value;
}

/** Oturum içi — aynı URI için tekrar ölçekleme / kırpım yapılmaz. */
export function prepareProfessionalKbsOcrUriCached(uri: string): Promise<string> {
  const key = uri.trim();
  const hit = preparedCache.get(key);
  if (hit) {
    touch(preparedCache, key, hit);
    return hit;
  }
  const promise = prepareProfessionalKbsOcrUri(key);
  return touch(preparedCache, key, promise);
}

/** Tam + belge + MRZ kırpımları — paralel OCR için tek seferde hazırlanır. */
export function buildKbsOcrEnhancedVariantsCached(uri: string): Promise<KbsOcrEnhancedVariants> {
  const key = uri.trim();
  const hit = variantsCache.get(key);
  if (hit) {
    touch(variantsCache, key, hit);
    return hit;
  }
  const promise = (async () => {
    const full = await prepareProfessionalKbsOcrUriCached(key);
    return buildKbsOcrEnhancedVariants(full, true);
  })();
  return touch(variantsCache, key, promise);
}

export function clearKbsOcrSessionCache(): void {
  preparedCache.clear();
  variantsCache.clear();
}
