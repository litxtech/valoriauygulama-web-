import { Image, Platform } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/** Tek çekimdeki kimlik sayısı (sabit düzenler). */
export type KbsSheetCardCount = 1 | 5 | 6 | 10;

const INSET = 0.012;
const MIN_CROP_W = 100;
const MIN_CROP_H = 80;

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

export function getKbsSheetTileRects(count: KbsSheetCardCount, landscape: boolean): KbsSheetTileRect[] {
  if (count === 1) return [{ x: 0.06, y: 0.08, w: 0.88, h: 0.84 }];
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

function verticalStack(count: number): KbsSheetTileRect[] {
  const n = Math.max(2, Math.min(6, count));
  const h = 1 / n;
  return Array.from({ length: n }, (_, i) => insetRect({ x: 0.06, y: i * h, w: 0.88, h }));
}

function estimateHorizontalCardCount(aspect: number): number {
  return Math.min(8, Math.max(2, Math.round(aspect / CARD_WIDTH_OVER_HEIGHT)));
}

function estimateVerticalCardCount(aspect: number): number {
  return Math.min(6, Math.max(2, Math.round(1 / aspect / CARD_WIDTH_OVER_HEIGHT)));
}

async function imageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

async function splitWithTiles(
  uri: string,
  width: number,
  height: number,
  tiles: KbsSheetTileRect[]
): Promise<string[]> {
  const out: string[] = [];
  for (const t of tiles) {
    const originX = Math.max(0, Math.round(t.x * width));
    const originY = Math.max(0, Math.round(t.y * height));
    const cropW = Math.min(Math.round(t.w * width), width - originX);
    const cropH = Math.min(Math.round(t.h * height), height - originY);
    if (cropW < MIN_CROP_W || cropH < MIN_CROP_H) continue;

    const cropped = await manipulateAsync(
      uri,
      [{ crop: { originX, originY, width: cropW, height: cropH } }],
      { compress: Platform.OS === 'android' ? 0.95 : 0.9, format: SaveFormat.JPEG }
    );
    out.push(cropped.uri);
  }
  return out.length > 0 ? out : [uri];
}

/**
 * Tek fotoğraftaki kimlikleri otomatik ayırır.
 * Tek kart çekiminde bölünmez; yalnızca kare çok geniş (yan yana) veya çok uzun (alt alta) ise bölünür.
 */
export async function autoSplitKbsSheetImage(uri: string): Promise<string[]> {
  const { width, height } = await imageSize(uri);
  const aspect = width / Math.max(height, 1);
  const portrait = height > width * 1.05;

  /** Telefon portre tek kimlik — Vision / expo çekim (≈0.5–0.8) yanlışlıkla 2 parçaya bölünmesin. */
  if (portrait && aspect >= 0.42 && aspect <= 0.92) {
    return [uri];
  }

  if (aspect >= SINGLE_CARD_ASPECT_MIN && aspect <= SINGLE_CARD_ASPECT_MAX) {
    return [uri];
  }

  let tiles: KbsSheetTileRect[];
  if (aspect >= MULTI_ROW_ASPECT_MIN) {
    tiles = horizontalRow(estimateHorizontalCardCount(aspect));
  } else if (aspect <= MULTI_COL_ASPECT_MAX) {
    tiles = verticalStack(estimateVerticalCardCount(aspect));
  } else {
    return [uri];
  }

  const parts = await splitWithTiles(uri, width, height, tiles);
  if (parts.length <= 1) return [uri];
  return parts;
}

/** Sabit sayı ile kırpma (eski API). */
export async function splitKbsSheetImage(uri: string, count: KbsSheetCardCount): Promise<string[]> {
  if (count === 1) return [uri];
  const { width, height } = await imageSize(uri);
  const landscape = width >= height;
  const tiles = getKbsSheetTileRects(count, landscape);
  return splitWithTiles(uri, width, height, tiles);
}
