import type { MrzOcrBlock } from '@/lib/scanner/mrzOcrFromMlKit';

/** Kimlik ön yüzü — kart bölgesindeki satırlar (MRZ alt şerit filtresi yok). */
export function linesFromMlKitOcrForIdFront(
  fullText: string,
  blocks?: MrzOcrBlock[] | null
): string[] {
  const rawLines = fullText
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 2);

  if (!blocks?.length) return rawLines;

  const cardBlocks = blocks.filter((b) => {
    const t = b.text?.trim() ?? '';
    if (t.length < 2) return false;
    const top = b.top ?? 0;
    return top >= 0.1 && top <= 0.96;
  });

  if (cardBlocks.length < 2) return rawLines;

  const fromBlocks = cardBlocks
    .sort((a, b) => (a.top ?? 0) - (b.top ?? 0))
    .map((b) => b.text.trim())
    .filter(Boolean);

  return fromBlocks.length ? [...new Set([...fromBlocks, ...rawLines])] : rawLines;
}
