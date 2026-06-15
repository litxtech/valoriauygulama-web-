import { isUsablePersonName } from '@/lib/guestScan/personNameUtils';
import { mrzCharsetRatio } from '@/lib/scanner/mrzCharset';
import { mrzNamesLookValid } from '@/lib/scanner/mrzPersonNames';
import type { ParsedDocument } from '@/lib/scanner/types';

function digitsOnly(v: string | null | undefined): string {
  return v ? String(v).replace(/\D/g, '') : '';
}

function isTurkishTc(d: string): boolean {
  if (!/^[1-9]\d{10}$/.test(d)) return false;
  const digits = d.split('').map((c) => Number(c));
  let odd = 0;
  let even = 0;
  for (let i = 0; i < 9; i++) {
    if (i % 2 === 0) odd += digits[i]!;
    else even += digits[i]!;
  }
  const tenth = ((odd * 7 - even) % 10 + 10) % 10;
  if (digits[9] !== tenth) return false;
  const eleventh = digits.slice(0, 10).reduce((sum, n) => sum + n, 0) % 10;
  return digits[10] === eleventh;
}

/**
 * MRZ adayları arasından en iyisini seçmek için 0–100 arası güven skoru.
 */
export function scoreMrzCandidate(args: { rawMrz: string; parsed: ParsedDocument }): number {
  const { rawMrz, parsed } = args;
  let score = 0;

  const ratio = mrzCharsetRatio(rawMrz);
  score += ratio * 18;

  if (parsed.checksumsValid === true) score += 42;
  else if (parsed.checksumsValid === false) score -= 28;
  else score -= 8;

  if (mrzNamesLookValid(parsed.firstName, parsed.lastName)) score += 22;
  else if (isUsablePersonName(parsed.firstName) || isUsablePersonName(parsed.lastName)) score += 6;

  const docDigits = digitsOnly(parsed.documentNumber);
  if (docDigits.length >= 6) score += 12;
  if (isTurkishTc(docDigits)) score += 8;
  if (/^99\d{9}$/.test(docDigits)) score += 6;

  if (parsed.birthDate) score += 6;
  if (parsed.expiryDate) score += 4;
  if (parsed.nationalityCode) score += 3;
  if (parsed.documentSeries) score += 2;

  if (parsed.warnings?.some((w) => w === 'MRZ parse failed' || w.includes('parse failed'))) {
    score -= 40;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Skor → ParsedDocument.confidence (0–1). */
export function mrzScoreToConfidence(score: number): number {
  return Math.min(0.99, Math.max(0.35, score / 100));
}
