import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { copyUriToCacheForUpload } from '@/lib/uploadMedia';
import { mapPool } from '@/lib/kbsAsyncPool';
import {
  autoSplitKbsSheetImage,
  detectKbsSheetFromUri,
  detectKbsSheetLayout,
  type KbsSheetDetectResult,
} from '@/lib/kbsCaptureSheetSplit';
import type { KbsCaptureSide } from '@/lib/kbsCaptureOcr';

export type KbsImportSourceAsset = {
  uri: string;
  width?: number;
  height?: number;
};

export type KbsImportPreparedTile = {
  /** Kırpılmış veya tek görsel URI. */
  uri: string;
  parentSheetUri: string;
  tileIndex: number;
  tileCount: number;
};

export type KbsImportSheetReview = {
  sheetUri: string;
  detect: KbsSheetDetectResult;
  /** Varsayılan önerilen sayı; kullanıcı değiştirebilir. */
  suggestedCount: number;
};

export type KbsImportProgress = {
  phase: 'picking' | 'preparing' | 'splitting' | 'review' | 'queuing' | 'done' | 'cancelled';
  /** İşlenen kaynak foto index (0-based). */
  current: number;
  total: number;
  queuedTiles: number;
  message: string;
};

/** Galeri hazırlık paralelliği — Android bellek için düşük. */
const IMPORT_CONCURRENCY = Platform.OS === 'android' ? 2 : 3;

async function uriForQueue(uri: string): Promise<string> {
  const u = uri.trim();
  if (!u) return u;
  // Her zaman kalıcı file:// — blob:/ph:///content:// ve çıplak path’ler dahil.
  if (u.startsWith('file://')) return u;
  return copyUriToCacheForUpload(u, 'image');
}

/**
 * Galeri: limit yok (selectionLimit: 0). Sıra korunur.
 */
export async function pickKbsGalleryUnlimited(): Promise<KbsImportSourceAsset[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.9,
    allowsMultipleSelection: true,
    /** 0 = sınırsız (iOS 14+ / Expo). */
    selectionLimit: 0,
    orderedSelection: true,
    allowsEditing: false,
    exif: false,
    ...(Platform.OS === 'ios'
      ? {
          preferredAssetRepresentationMode:
            ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        }
      : {}),
  });

  if (res.canceled || !res.assets?.length) return [];
  return res.assets
    .filter((a) => !!a.uri)
    .map((a) => ({
      uri: a.uri!,
      width: a.width,
      height: a.height,
    }));
}

export type ProcessGallerySerialOptions = {
  captureSide: KbsCaptureSide;
  signal?: { cancelled: boolean };
  onProgress?: (p: KbsImportProgress) => void;
  /**
   * A4 / çoklu sayfa için kullanıcı onayı.
   * null dönerse bu sayfa atlanır; count 1 = bölme yok.
   */
  onSheetReview?: (review: KbsImportSheetReview) => Promise<number | null>;
  /** true ise A4’te otomatik 2’ye böl, onay sorma. */
  autoAcceptSheetSplit?: boolean;
  /**
   * Her tile hazır olunca çağrılır — kuyruk + prewarm erken başlar.
   * Sıra kaynak index’ine göre korunmaz; UI birleştirir.
   */
  onTileReady?: (tile: KbsImportPreparedTile) => void;
  /** Override — varsayılan Android 2 / iOS 3. */
  concurrency?: number;
};

/** A4 onay modalı aynı anda tek — diğer fotolar copy/detect devam eder. */
let sheetReviewChain: Promise<void> = Promise.resolve();

function withSheetReviewLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = sheetReviewChain.then(fn, fn);
  sheetReviewChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function detectFromAssetDims(asset: KbsImportSourceAsset): KbsSheetDetectResult | null {
  const w = asset.width;
  const h = asset.height;
  if (!w || !h || w < 32 || h < 32) return null;
  return detectKbsSheetLayout(w, h);
}

async function prepareOneGalleryAsset(
  asset: KbsImportSourceAsset,
  index: number,
  total: number,
  opts: ProcessGallerySerialOptions,
  getQueuedCount: () => number,
  bumpQueued: (n: number) => void
): Promise<KbsImportPreparedTile[]> {
  if (opts.signal?.cancelled) return [];

  opts.onProgress?.({
    phase: 'preparing',
    current: index + 1,
    total,
    queuedTiles: getQueuedCount(),
    message: `Foto ${index + 1}/${total} kopyalanıyor…`,
  });

  let fileUri: string;
  try {
    fileUri = await uriForQueue(asset.uri);
  } catch {
    return [];
  }

  if (opts.signal?.cancelled) return [];

  opts.onProgress?.({
    phase: 'splitting',
    current: index + 1,
    total,
    queuedTiles: getQueuedCount(),
    message: `Foto ${index + 1}/${total} taranıyor…`,
  });

  // Picker boyutları varsa Image.getSize atlanır.
  let detect: KbsSheetDetectResult;
  const quick = detectFromAssetDims(asset);
  try {
    detect = quick ?? (await detectKbsSheetFromUri(fileUri));
  } catch {
    const tile: KbsImportPreparedTile = {
      uri: fileUri,
      parentSheetUri: fileUri,
      tileIndex: 0,
      tileCount: 1,
    };
    bumpQueued(1);
    opts.onTileReady?.(tile);
    return [tile];
  }

  let count = detect.suggestedCount;
  const needsReview = detect.looksLikeSheetPage || detect.layout.startsWith('sheet_');

  if (needsReview && !opts.autoAcceptSheetSplit && opts.onSheetReview) {
    opts.onProgress?.({
      phase: 'review',
      current: index + 1,
      total,
      queuedTiles: getQueuedCount(),
      message: `Foto ${index + 1}/${total}: kaç pasaport?`,
    });
    const chosen = await withSheetReviewLock(() =>
      opts.onSheetReview!({
        sheetUri: fileUri,
        detect,
        suggestedCount: Math.max(2, Math.min(4, detect.suggestedCount || 2)),
      })
    );
    if (chosen === null) return [];
    count = chosen;
  } else if (detect.looksLikeSheetPage && opts.autoAcceptSheetSplit) {
    count = Math.max(2, Math.min(4, detect.suggestedCount || 2));
  } else if (!needsReview && detect.suggestedCount <= 1) {
    count = 1;
  }

  if (opts.signal?.cancelled) return [];

  let parts: string[];
  try {
    parts =
      count <= 1
        ? [fileUri]
        : await autoSplitKbsSheetImage(fileUri, {
            countOverride: count,
            forceSplit: count >= 2,
          });
  } catch {
    parts = [fileUri];
  }

  const tileCount = parts.length;
  const tiles: KbsImportPreparedTile[] = [];
  for (let t = 0; t < tileCount; t++) {
    const tile: KbsImportPreparedTile = {
      uri: parts[t]!,
      parentSheetUri: fileUri,
      tileIndex: t,
      tileCount,
    };
    tiles.push(tile);
    opts.onTileReady?.(tile);
  }
  bumpQueued(tileCount);

  opts.onProgress?.({
    phase: 'queuing',
    current: index + 1,
    total,
    queuedTiles: getQueuedCount(),
    message: `Foto ${index + 1}/${total} → ${tileCount} kimlik (toplam ${getQueuedCount()})`,
  });

  return tiles;
}

/**
 * Galeri varlıklarını sınırlı paralellikte hazırlar.
 * Tile’lar hazır oldukça `onTileReady` ile akar (prewarm erken başlar).
 * A4 onay modalı kilitli; diğer fotolar beklerken copy/detect devam eder.
 */
export async function processKbsGallerySerial(
  assets: KbsImportSourceAsset[],
  opts: ProcessGallerySerialOptions
): Promise<KbsImportPreparedTile[]> {
  const total = assets.length;
  if (total === 0) return [];

  let queuedTiles = 0;
  const getQueuedCount = () => queuedTiles;
  const bumpQueued = (n: number) => {
    queuedTiles += n;
  };

  opts.onProgress?.({
    phase: 'preparing',
    current: 0,
    total,
    queuedTiles: 0,
    message: `${total} foto hazırlanıyor…`,
  });

  const concurrency = Math.max(1, opts.concurrency ?? IMPORT_CONCURRENCY);
  const batches = await mapPool(assets, concurrency, async (asset, index) => {
    if (opts.signal?.cancelled) return [] as KbsImportPreparedTile[];
    return prepareOneGalleryAsset(asset, index, total, opts, getQueuedCount, bumpQueued);
  });

  if (opts.signal?.cancelled) {
    const partial = batches.flat();
    opts.onProgress?.({
      phase: 'cancelled',
      current: total,
      total,
      queuedTiles: partial.length,
      message: 'İptal edildi',
    });
    return partial;
  }

  const out = batches.flat();
  opts.onProgress?.({
    phase: 'done',
    current: total,
    total,
    queuedTiles: out.length,
    message: `${out.length} kimlik kuyruğa hazır`,
  });

  return out;
}

export { uriForQueue as resolveKbsImportUri };
