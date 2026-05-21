import { analyzeOcrLinesForMrzLive } from '@/lib/scanner/mrzLiveEngine';
import { ocrLinesLookLikeMrz } from '@/lib/scanner/mrzPresence';

/** ML Kit OCR blokları (normalize edilmiş 0–1 koordinat). */
export type MrzOcrBlock = {
  text: string;
  /** Üst kenar (0 = üst, 1 = alt) */
  top?: number;
  height?: number;
};

type MlKitBounds = {
  top?: number;
  centerY?: number;
  height?: number;
};

type MlKitLine = { text?: string; bounds?: MlKitBounds };
type MlKitBlock = { text?: string; bounds?: MlKitBounds; lines?: MlKitLine[] };

/** VisionCamera ML Kit JSON → MRZ blok listesi. */
export function mrzBlocksFromMlKitJson(blocksJson: string, frameHeight: number): MrzOcrBlock[] {
  if (!blocksJson) return [];
  try {
    const blocks = JSON.parse(blocksJson) as MlKitBlock[];
    return flattenMlKitBlocks(blocks, frameHeight);
  } catch {
    return [];
  }
}

function flattenMlKitBlocks(blocks: MlKitBlock[], frameHeight: number): MrzOcrBlock[] {
  const raw: MrzOcrBlock[] = [];
  for (const b of blocks) {
    if (b.lines?.length) {
      for (const line of b.lines) {
        const t = line.text?.trim() ?? '';
        if (t.length < 6) continue;
        raw.push({
          text: t,
          top: line.bounds?.centerY ?? line.bounds?.top,
          height: line.bounds?.height,
        });
      }
    } else {
      const t = b.text?.trim() ?? '';
      if (t.length < 6) continue;
      raw.push({
        text: t,
        top: b.bounds?.centerY ?? b.bounds?.top,
        height: b.bounds?.height,
      });
    }
  }

  if (!raw.length) return [];

  const fh = frameHeight > 0 ? frameHeight : Math.max(...raw.map((r) => (r.top ?? 0) + (r.height ?? 0)), 1);
  return raw.map((r) => ({
    text: r.text,
    top: (r.top ?? 0) / fh,
    height: (r.height ?? 0) / fh,
  }));
}

/**
 * Pasaport/kimlik MRZ genelde alt bölgede; üst metin (P<TUR…) gürültüsünü azaltır.
 */
export function linesFromMlKitOcr(
  fullText: string,
  blocks?: MrzOcrBlock[] | null
): string[] {
  const rawLines = fullText
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!blocks?.length) return rawLines;

  const mrzBlocks = blocks.filter((b) => {
    const t = b.text?.trim() ?? '';
    if (t.length < 8) return false;
    const top = b.top ?? 0;
    return top >= 0.42;
  });

  if (mrzBlocks.length === 0) return rawLines;

  const fromBlocks = mrzBlocks
    .sort((a, b) => (b.top ?? 0) - (a.top ?? 0))
    .map((b) => b.text.trim())
    .filter(Boolean);

  return fromBlocks.length ? fromBlocks : rawLines;
}

export type MrzFrameReadiness = {
  phase: 'watch' | 'signal' | 'blur' | 'dark' | 'locking';
  hintKey:
    | 'kbsMrzFrameAutoHunting'
    | 'kbsMrzFrameLockActive'
    | 'kbsMrzFrameUnsharp'
    | 'kbsMrzTorchOn';
  lines: string[];
};

const STABILITY_NEEDED = 1;
const STABILITY_WINDOW_MS = 700;

export type MrzStabilityState = {
  lastSnapshot: string;
  count: number;
  lastAt: number;
};

export function createMrzStabilityState(): MrzStabilityState {
  return { lastSnapshot: '', count: 0, lastAt: 0 };
}

/**
 * Blur sezgisi: MRZ satırları ardışık karelerde aynı değilse henüz kilitleme.
 * Geçerli checksum ile parse varsa stabilite beklemeden kilitle.
 */
export function assessMrzFrameReadiness(
  fullText: string,
  blocks: MrzOcrBlock[] | null | undefined,
  stability: MrzStabilityState
): MrzFrameReadiness {
  const trimmed = fullText.trim();
  const lines = linesFromMlKitOcr(trimmed, blocks);

  if (!trimmed || trimmed.length < 12) {
    stability.lastSnapshot = '';
    stability.count = 0;
    stability.lastAt = 0;
    return { phase: 'watch', hintKey: 'kbsMrzFrameAutoHunting', lines };
  }

  const instant = analyzeOcrLinesForMrzLive(lines);
  if (instant.phase === 'locking' && instant.locked) {
    return { phase: 'locking', hintKey: 'kbsMrzFrameLockActive', lines };
  }

  if (!ocrLinesLookLikeMrz(lines)) {
    stability.lastSnapshot = '';
    stability.count = 0;
    stability.lastAt = 0;
    return { phase: 'watch', hintKey: 'kbsMrzFrameAutoHunting', lines };
  }

  const snap = lines.join('|').slice(0, 240);
  const now = Date.now();
  if (snap !== stability.lastSnapshot || now - stability.lastAt > STABILITY_WINDOW_MS) {
    stability.lastSnapshot = snap;
    stability.count = 1;
    stability.lastAt = now;
    return { phase: 'signal', hintKey: 'kbsMrzFrameLockActive', lines };
  }

  stability.count += 1;
  if (stability.count < STABILITY_NEEDED) {
    return { phase: 'signal', hintKey: 'kbsMrzFrameLockActive', lines };
  }

  return { phase: 'locking', hintKey: 'kbsMrzFrameLockActive', lines };
}
