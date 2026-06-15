import { filterKbsOcrLines } from '@/lib/kbsOcrDocumentFocus';
import { sanitizeKbsOcrForApply } from '@/lib/kbsCaptureOcrMerge';
import {
  galleryParsedHasMinimumFields,
  parseIdCardFromOcrLines,
} from '@/lib/guestScan/idCardOcrParser';
import { isUsablePersonName } from '@/lib/guestScan/personNameUtils';
import type { ParsedDocument } from '@/lib/scanner/types';

const TC_RE = /\b([1-9]\d{10})\b/;
const YKN_RE = /\b(99\d{9})\b/;
const ID_LABEL_RE =
  /(?:soyad|surname|family\s*name|given\s*name|ad[ıi]|kimlik|identity|t\.?\s*c\.?|nüfus|nufus|republic|cumhuriyet|türkiye|turkey|nufus|cumhuriyeti)/i;

export type IdCardFrontLivePhase = 'watch' | 'signal' | 'capture';

export type IdCardFrontLiveAnalyzeResult =
  | { phase: IdCardFrontLivePhase; locked?: undefined }
  | { phase: 'capture'; locked: { parsed: ParsedDocument } };

/** Kimlik ön yüzü sinyali — TC / etiket / ad benzeri satır. */
export function ocrLinesLookLikeIdFront(lines: string[] | null | undefined): boolean {
  if (!lines?.length) return false;
  const joined = lines.join('\n').toUpperCase();
  if (TC_RE.test(joined) || YKN_RE.test(joined)) return true;
  if (ID_LABEL_RE.test(joined)) return true;
  for (const line of lines) {
    const t = line.trim();
    if (TC_RE.test(t) || YKN_RE.test(t)) return true;
    if (t.length >= 4 && /^[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s'.-]+$/.test(t)) {
      if (!/^(TUR|TC|KIMLIK)/i.test(t)) return true;
    }
  }
  const nameish = lines.filter((l) => /^[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s'.-]{2,}$/i.test(l.trim()));
  return nameish.length >= 2;
}

export function idFrontLockFingerprint(parsed: ParsedDocument): string {
  const tc = (parsed.documentNumber ?? '').replace(/\D/g, '');
  return `${tc}|${(parsed.firstName ?? '').trim()}|${(parsed.lastName ?? '').trim()}`.toUpperCase();
}

/** Fotoğraf OCR sonrası kabul — TC yeterli; ad/soyaddan biri veya ikisi. */
export function canLockIdFrontLiveScan(parsed: ParsedDocument): boolean {
  const p = sanitizeKbsOcrForApply(parsed);
  if (galleryParsedHasMinimumFields(p)) return true;

  const docDigits = (p.documentNumber ?? '').replace(/\D/g, '');
  const hasTc = /^[1-9]\d{10}$/.test(docDigits);
  const hasYkn = /^99\d{9}$/.test(docDigits);
  const hasFirst = isUsablePersonName(p.firstName);
  const hasLast = isUsablePersonName(p.lastName);

  if ((hasTc || hasYkn) && (hasFirst || hasLast)) return true;
  if (hasTc || hasYkn) return true;
  if (hasFirst && hasLast) return true;
  return false;
}

export function analyzeOcrLinesForIdFrontLive(lines: string[]): IdCardFrontLiveAnalyzeResult {
  const filtered = filterKbsOcrLines(lines);
  const probe = filtered.length ? filtered : lines;

  if (!ocrLinesLookLikeIdFront(probe)) {
    return { phase: 'watch' };
  }

  const parsed = sanitizeKbsOcrForApply(parseIdCardFromOcrLines(probe));

  if (canLockIdFrontLiveScan(parsed)) {
    return { phase: 'capture', locked: { parsed } };
  }

  const hasPartial =
    !!(parsed.documentNumber && parsed.documentNumber.replace(/\D/g, '').length >= 6) ||
    isUsablePersonName(parsed.firstName) ||
    isUsablePersonName(parsed.lastName);

  if (hasPartial) return { phase: 'signal' };
  return { phase: 'watch' };
}

export type IdCardFrontStabilityState = {
  lastSnapshot: string;
  count: number;
  lastAt: number;
};

export function createIdCardFrontStabilityState(): IdCardFrontStabilityState {
  return { lastSnapshot: '', count: 0, lastAt: 0 };
}

const STABILITY_NEEDED = 1;
const STABILITY_WINDOW_MS = 900;

export type IdCardFrontFrameReadiness = {
  phase: IdCardFrontLivePhase;
  hintKey: 'kbsIdFrontLiveHunting' | 'kbsIdFrontLiveReading' | 'kbsIdFrontLiveAlign';
  lines: string[];
};

/**
 * Canlı karede yalnızca “kimlik görünüyor” sinyali.
 * Asıl OCR yüksek çözünürlüklü fotoğrafta yapılır (IdCardFrontVisionScanner).
 */
export function assessIdCardFrontFrameReadiness(
  lines: string[],
  stability: IdCardFrontStabilityState
): IdCardFrontFrameReadiness {
  if (!ocrLinesLookLikeIdFront(lines)) {
    stability.lastSnapshot = '';
    stability.count = 0;
    stability.lastAt = 0;
    return { phase: 'watch', hintKey: 'kbsIdFrontLiveHunting', lines };
  }

  const snap = lines
    .map((l) => l.trim())
    .filter(Boolean)
    .join('|')
    .slice(0, 160);
  const now = Date.now();
  if (snap !== stability.lastSnapshot || now - stability.lastAt > STABILITY_WINDOW_MS) {
    stability.lastSnapshot = snap;
    stability.count = 1;
    stability.lastAt = now;
    return { phase: 'signal', hintKey: 'kbsIdFrontLiveReading', lines };
  }

  stability.count += 1;
  if (stability.count < STABILITY_NEEDED) {
    return { phase: 'signal', hintKey: 'kbsIdFrontLiveReading', lines };
  }

  return { phase: 'capture', hintKey: 'kbsIdFrontLiveReading', lines };
}
