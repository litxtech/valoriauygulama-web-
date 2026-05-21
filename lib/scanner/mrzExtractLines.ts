import { canLockMrzLiveScan, canSaveMrzDocument } from '@/lib/scanner/mrzScanGate';
import { mrzOcrAmbiguityVariants, normalizeMrzOcrLine, normalizeMrzOcrLines } from '@/lib/scanner/mrzOcrNormalize';
import { parseMrzToNormalized } from '@/lib/scanner/mrzParser';
import type { ParsedDocument } from '@/lib/scanner/types';

const TD3_LEN = 44;
const TD2_LEN = 36;
const TD1_LEN = 30;
const TD3_MIN = 38;
const TD3_MAX = 46;
const TD2_MIN = 32;
const TD2_MAX = 40;
const TD1_MIN = 26;
const TD1_MAX = 34;

function isMrzLikeLine(line: string): boolean {
  if (line.length < 22) return false;
  const chevrons = (line.match(/</g) ?? []).length;
  return chevrons >= 2 && /^[A-Z0-9<]+$/.test(line);
}

function padOrTrimTo(line: string, target: number): string {
  if (line.length === target) return line;
  if (line.length > target) return line.slice(0, target);
  return line.padEnd(target, '<');
}

function pairTd3(a: string, b: string): string | null {
  const la = padOrTrimTo(a, TD3_LEN);
  const lb = padOrTrimTo(b, TD3_LEN);
  if (la.length < TD3_MIN || lb.length < TD3_MIN) return null;
  return `${la}\n${lb}`;
}

function pairTd2(a: string, b: string): string | null {
  const la = padOrTrimTo(a, TD2_LEN);
  const lb = padOrTrimTo(b, TD2_LEN);
  if (la.length < TD2_MIN || lb.length < TD2_MIN) return null;
  return `${la}\n${lb}`;
}

function tripleTd1(a: string, b: string, c: string): string | null {
  const lines = [a, b, c].map((l) => padOrTrimTo(l, TD1_LEN));
  if (lines.some((l) => l.length < TD1_MIN)) return null;
  return lines.join('\n');
}

function buildCandidateStrings(lines: string[]): string[] {
  const cleaned = normalizeMrzOcrLines(lines);
  const candidates = cleaned.filter(isMrzLikeLine);
  const out = new Set<string>();

  for (let i = 0; i < candidates.length - 1; i++) {
    const a = candidates[i];
    const b = candidates[i + 1];
    if (a.length >= TD3_MIN && a.length <= TD3_MAX && b.length >= TD3_MIN && b.length <= TD3_MAX) {
      const p = pairTd3(a, b);
      if (p) out.add(p);
    }
    if (a.length >= TD2_MIN && a.length <= TD2_MAX && b.length >= TD2_MIN && b.length <= TD2_MAX) {
      const p2 = pairTd2(a, b);
      if (p2) out.add(p2);
    }
    if (a.length >= TD1_MIN && a.length <= TD1_MAX && b.length >= TD1_MIN && b.length <= TD1_MAX) {
      const c = candidates[i + 2];
      if (c) {
        const t = tripleTd1(a, b, c);
        if (t) out.add(t);
      }
    }
  }

  const byLen = [...candidates].sort((x, y) => y.length - x.length);
  if (byLen.length >= 2 && byLen[0].length >= 40) {
    out.add(`${padOrTrimTo(byLen[0], TD3_LEN)}\n${padOrTrimTo(byLen[1], TD3_LEN)}`);
  }
  if (byLen.length >= 2 && byLen[0].length >= TD2_MIN && byLen[0].length <= TD2_MAX) {
    out.add(`${padOrTrimTo(byLen[0], TD2_LEN)}\n${padOrTrimTo(byLen[1], TD2_LEN)}`);
  }
  if (byLen.length >= 3 && byLen[0].length >= 28 && byLen[0].length <= 34) {
    out.add(
      `${padOrTrimTo(byLen[0], TD1_LEN)}\n${padOrTrimTo(byLen[1], TD1_LEN)}\n${padOrTrimTo(byLen[2], TD1_LEN)}`
    );
  }

  const joined = candidates.slice(-3).join('');
  if (joined.length >= 60 && joined.includes('<')) {
    if (joined.length >= 88) {
      out.add(`${joined.slice(0, TD3_LEN)}\n${joined.slice(TD3_LEN, TD3_LEN * 2)}`);
    }
    if (joined.length >= 72 && joined.length < 88) {
      out.add(`${joined.slice(0, TD2_LEN)}\n${joined.slice(TD2_LEN, TD2_LEN * 2)}`);
    }
    if (joined.length >= 90) {
      out.add(
        `${joined.slice(0, TD1_LEN)}\n${joined.slice(TD1_LEN, TD1_LEN * 2)}\n${joined.slice(TD1_LEN * 2, TD1_LEN * 3)}`
      );
    }
  }

  return [...out];
}

export type MrzExtractResult = { mrz: string; parsed: ParsedDocument } | null;

/** OCR satırlarından en iyi geçerli MRZ (checksum + charset kapısı). */
export function extractMrzFromLinesBest(lines: string[]): MrzExtractResult | null {
  const candidates = buildCandidateStrings(lines);
  for (const raw of candidates) {
    for (const variant of mrzOcrAmbiguityVariants(raw)) {
      const parsed = parseMrzToNormalized(variant);
      const gate = canSaveMrzDocument({ rawMrz: variant, parsed });
      if (gate.allowed || canLockMrzLiveScan({ rawMrz: variant, parsed })) {
        return { mrz: variant, parsed };
      }
    }
  }
  return null;
}

/** @deprecated extractMrzFromLinesBest kullanın */
export function extractMrzFromLines(lines: string[]): string | null {
  const best = extractMrzFromLinesBest(lines);
  return best?.mrz ?? null;
}
