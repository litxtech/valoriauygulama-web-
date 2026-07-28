import { Image, Platform } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/** Tek çekimdeki kimlik sayısı (sabit düzenler). */
export type KbsSheetCardCount = 1 | 2 | 3 | 4 | 5 | 6 | 10;

export type KbsSheetLayoutHint =
  | 'single'
  | 'sheet_2_vertical'
  | 'sheet_2_horizontal'
  | 'sheet_3_vertical'
  | 'sheet_3_horizontal'
  | 'sheet_4_grid'
  | 'sheet_grid'
  | 'strip_horizontal'
  | 'strip_vertical';

export type KbsSheetDetectResult = {
  layout: KbsSheetLayoutHint;
  /** Önerilen kart sayısı (1 = bölme yok). */
  suggestedCount: number;
  width: number;
  height: number;
  aspect: number;
  /** A4 / fotokopi sayfası gibi görünüyor. */
  looksLikeSheetPage: boolean;
  confidence: number;
};

const INSET = 0.012;
const MIN_CROP_W = 100;
const MIN_CROP_H = 80;

/** A4 portre ≈ 0.707; yatay ≈ 1.414 — fotokopi sayfası. */
const A4_PORTRAIT_MIN = 0.62;
const A4_PORTRAIT_MAX = 0.82;
const A4_LANDSCAPE_MIN = 1.22;
const A4_LANDSCAPE_MAX = 1.55;

function insetRect(r: KbsSheetTileRect): KbsSheetTileRect {
  const padX = r.w * INSET;
  const padY = r.h * INSET;
  return {
    x: r.x + padX,
    y: r.y + padY,
    w: Math.max(0.05, r.w - padX * 2),
    h: Math.max(0.05, r.h - padY * 2),
  };
}

/** Normalize edilmiş kırpma alanı (0–1). */
export type KbsSheetTileRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Üst 2 + alt 3 (portre masa çekimi). */
function layout5Portrait(): KbsSheetTileRect[] {
  return [
    { x: 0, y: 0, w: 0.5, h: 0.5 },
    { x: 0.5, y: 0, w: 0.5, h: 0.5 },
    { x: 0, y: 0.5, w: 1 / 3, h: 0.5 },
    { x: 1 / 3, y: 0.5, w: 1 / 3, h: 0.5 },
    { x: 2 / 3, y: 0.5, w: 1 / 3, h: 0.5 },
  ].map(insetRect);
}

/** 5 kimlik yatay sıra (geniş çekim). */
function layout5Landscape(): KbsSheetTileRect[] {
  const w = 1 / 5;
  return Array.from({ length: 5 }, (_, i) => insetRect({ x: i * w, y: 0, w, h: 1 }));
}

function uniformGrid(rows: number, cols: number): KbsSheetTileRect[] {
  const tiles: KbsSheetTileRect[] = [];
  const cellW = 1 / cols;
  const cellH = 1 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push(insetRect({ x: c * cellW, y: r * cellH, w: cellW, h: cellH }));
    }
  }
  return tiles;
}

function horizontalRow(count: number): KbsSheetTileRect[] {
  const w = 1 / count;
  return Array.from({ length: count }, (_, i) =>
    insetRect({ x: i * w, y: 0.04, w, h: 0.92 })
  );
}

function verticalStack(count: number): KbsSheetTileRect[] {
  const n = Math.max(2, Math.min(6, count));
  const h = 1 / n;
  return Array.from({ length: n }, (_, i) => insetRect({ x: 0.06, y: i * h, w: 0.88, h }));
}

/** A4’te 2 pasaport (üst/alt veya yan yana). */
function layout2(landscape: boolean): KbsSheetTileRect[] {
  return landscape ? horizontalRow(2) : verticalStack(2);
}

/** A4’te 3 pasaport — portre: üç sıra; yatay: üç sütun. */
function layout3(landscape: boolean): KbsSheetTileRect[] {
  return landscape ? horizontalRow(3) : verticalStack(3);
}

/** A4’te 4 pasaport — 2×2 ızgara (en sık fotokopi düzeni). */
function layout4(): KbsSheetTileRect[] {
  return uniformGrid(2, 2);
}

export function getKbsSheetTileRects(count: KbsSheetCardCount, landscape: boolean): KbsSheetTileRect[] {
  if (count === 1) return [{ x: 0.06, y: 0.08, w: 0.88, h: 0.84 }];
  if (count === 2) return layout2(landscape);
  if (count === 3) return layout3(landscape);
  if (count === 4) return layout4();
  if (count === 5) return landscape ? layout5Landscape() : layout5Portrait();
  if (count === 6) return landscape ? uniformGrid(2, 3) : uniformGrid(3, 2);
  return landscape ? uniformGrid(2, 5) : uniformGrid(5, 2);
}

/** Yatay dizilmiş kimlik genişliği / yüksekliği (yaklaşık). */
const CARD_WIDTH_OVER_HEIGHT = 1.58;

/** Tek kimlik çekimi — bu aralıkta asla bölme (telefon portre / yatay tek kart). */
const SINGLE_CARD_ASPECT_MIN = 0.45;
const SINGLE_CARD_ASPECT_MAX = 2.35;

/** Yan yana çoklu kimlik için minimum kare genişliği. */
const MULTI_ROW_ASPECT_MIN = 2.2;

/** Alt alta çoklu kimlik için maksimum kare yüksekliği (w/h). */
const MULTI_COL_ASPECT_MAX = 0.54;

function estimateHorizontalCardCount(aspect: number): number {
  return Math.min(8, Math.max(2, Math.round(aspect / CARD_WIDTH_OVER_HEIGHT)));
}

function estimateVerticalCardCount(aspect: number): number {
  return Math.min(6, Math.max(2, Math.round(1 / aspect / CARD_WIDTH_OVER_HEIGHT)));
}

export async function getKbsImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

function isA4LikeAspect(aspect: number): boolean {
  return (
    (aspect >= A4_PORTRAIT_MIN && aspect <= A4_PORTRAIT_MAX) ||
    (aspect >= A4_LANDSCAPE_MIN && aspect <= A4_LANDSCAPE_MAX)
  );
}

/**
 * Sayfa düzeni tahmini — A4’te 2–3 fotokopi dahil.
 * Telefon tek-kart portresi bölünmez.
 */
export function detectKbsSheetLayout(
  width: number,
  height: number
): KbsSheetDetectResult {
  const aspect = width / Math.max(height, 1);
  const portrait = height > width * 1.05;
  const landscape = width >= height;
  const looksLikeSheetPage = isA4LikeAspect(aspect);

  // Telefon portre tek kimlik (≈0.5–0.8) — A4 fotokopi değilse bölme.
  if (portrait && aspect >= 0.42 && aspect <= 0.92 && !looksLikeSheetPage) {
    return {
      layout: 'single',
      suggestedCount: 1,
      width,
      height,
      aspect,
      looksLikeSheetPage: false,
      confidence: 0.92,
    };
  }

  // A4 / fotokopi sayfası → varsayılan 2 (en sık); kullanıcı onayda 1/2/3 seçer.
  if (looksLikeSheetPage) {
    if (portrait) {
      return {
        layout: 'sheet_2_vertical',
        suggestedCount: 2,
        width,
        height,
        aspect,
        looksLikeSheetPage: true,
        confidence: 0.72,
      };
    }
    return {
      layout: 'sheet_2_horizontal',
      suggestedCount: 2,
      width,
      height,
      aspect,
      looksLikeSheetPage: true,
      confidence: 0.7,
    };
  }

  if (aspect >= MULTI_ROW_ASPECT_MIN) {
    const n = estimateHorizontalCardCount(aspect);
    return {
      layout: 'strip_horizontal',
      suggestedCount: n,
      width,
      height,
      aspect,
      looksLikeSheetPage: false,
      confidence: 0.8,
    };
  }

  if (aspect <= MULTI_COL_ASPECT_MAX) {
    const n = estimateVerticalCardCount(aspect);
    return {
      layout: 'strip_vertical',
      suggestedCount: n,
      width,
      height,
      aspect,
      looksLikeSheetPage: false,
      confidence: 0.8,
    };
  }

  if (aspect >= SINGLE_CARD_ASPECT_MIN && aspect <= SINGLE_CARD_ASPECT_MAX) {
    return {
      layout: 'single',
      suggestedCount: 1,
      width,
      height,
      aspect,
      looksLikeSheetPage: false,
      confidence: 0.85,
    };
  }

  return {
    layout: landscape ? 'sheet_grid' : 'single',
    suggestedCount: 1,
    width,
    height,
    aspect,
    looksLikeSheetPage: false,
    confidence: 0.5,
  };
}

export async function detectKbsSheetFromUri(uri: string): Promise<KbsSheetDetectResult> {
  const { width, height } = await getKbsImageSize(uri);
  return detectKbsSheetLayout(width, height);
}

async function splitWithTiles(
  uri: string,
  width: number,
  height: number,
  tiles: KbsSheetTileRect[]
): Promise<string[]> {
  const compress = Platform.OS === 'android' ? 0.95 : 0.9;
  const crops = await Promise.all(
    tiles.map(async (t) => {
      const originX = Math.max(0, Math.round(t.x * width));
      const originY = Math.max(0, Math.round(t.y * height));
      const cropW = Math.min(Math.round(t.w * width), width - originX);
      const cropH = Math.min(Math.round(t.h * height), height - originY);
      if (cropW < MIN_CROP_W || cropH < MIN_CROP_H) return null;
      const cropped = await manipulateAsync(
        uri,
        [{ crop: { originX, originY, width: cropW, height: cropH } }],
        { compress, format: SaveFormat.JPEG }
      );
      return cropped.uri;
    })
  );
  const out = crops.filter((u): u is string => !!u);
  return out.length > 0 ? out : [uri];
}

function tilesForDetect(detect: KbsSheetDetectResult, countOverride?: number): KbsSheetTileRect[] {
  const landscape = detect.width >= detect.height;
  const count = countOverride ?? detect.suggestedCount;

  if (count <= 1) return [{ x: 0, y: 0, w: 1, h: 1 }];

  if (count === 2 || count === 3 || count === 4 || count === 5 || count === 6 || count === 10) {
    return getKbsSheetTileRects(count as KbsSheetCardCount, landscape);
  }

  if (detect.layout === 'strip_horizontal' || detect.layout.endsWith('_horizontal')) {
    return horizontalRow(Math.min(8, Math.max(2, count)));
  }
  if (detect.layout === 'strip_vertical' || detect.layout.endsWith('_vertical')) {
    return verticalStack(Math.min(6, Math.max(2, count)));
  }
  return getKbsSheetTileRects(2, landscape);
}

/**
 * Tek fotoğraftaki kimlikleri otomatik ayırır.
 * A4 fotokopi (2–4) ve aşırı geniş/uzun şeritler bölünür; telefon tek kart bölünmez.
 */
export async function autoSplitKbsSheetImage(
  uri: string,
  opts?: { countOverride?: number; forceSplit?: boolean }
): Promise<string[]> {
  const detect = await detectKbsSheetFromUri(uri);
  const count = opts?.countOverride ?? detect.suggestedCount;

  if (!opts?.forceSplit && count <= 1 && !detect.looksLikeSheetPage) {
    return [uri];
  }

  // A4 sayfada otomatik: 2’ye böl (onay UI yoksa); kullanıcı countOverride ile 1–4 seçebilir.
  const effectiveCount =
    opts?.countOverride ??
    (detect.looksLikeSheetPage ? Math.max(2, detect.suggestedCount) : detect.suggestedCount);

  if (effectiveCount <= 1) return [uri];

  const tiles = tilesForDetect(detect, effectiveCount);
  if (tiles.length <= 1) return [uri];

  const parts = await splitWithTiles(uri, detect.width, detect.height, tiles);
  if (parts.length <= 1) return [uri];
  return parts;
}

/** Sabit sayı ile kırpma. */
export async function splitKbsSheetImage(uri: string, count: KbsSheetCardCount): Promise<string[]> {
  if (count === 1) return [uri];
  const { width, height } = await getKbsImageSize(uri);
  const landscape = width >= height;
  const tiles = getKbsSheetTileRects(count, landscape);
  return splitWithTiles(uri, width, height, tiles);
}

/** Önizleme için tile dikdörtgenleri (onay UI). */
export function previewTilesForSheet(
  detect: KbsSheetDetectResult,
  count: number
): KbsSheetTileRect[] {
  if (count <= 1) return [{ x: 0.02, y: 0.02, w: 0.96, h: 0.96 }];
  return tilesForDetect(detect, count);
}
