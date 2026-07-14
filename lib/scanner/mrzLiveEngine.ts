import { applyBestPassportNamesToParsed } from '@/lib/kbsPassportNameResolve';
import { applyBestPassportIdentityToParsed } from '@/lib/kbsPassportFieldResolve';
import { extractMrzFromLinesBest } from '@/lib/scanner/mrzExtractLines';
import { normalizeMrzOcrLines } from '@/lib/scanner/mrzOcrNormalize';
import { ocrLinesLookLikeMrz } from '@/lib/scanner/mrzPresence';
import type { ParsedDocument } from '@/lib/scanner/types';

/** Kamera açıldıktan sonra ilk sessiz tarama gecikmesi */
export const MRZ_LIVE_WARMUP_MS = 1200;
/** MRZ benzeri sinyal yokken örnekleme aralığı (pil + «çekim» hissi azaltma) */
export const MRZ_WATCH_INTERVAL_MS = 1650;
/** MRZ şeridi görünürken daha sık örnekleme */
export const MRZ_SIGNAL_INTERVAL_MS = 850;
/** Sinyal modunda düşük kalite önizleme karesi */
export const MRZ_SCOUT_QUALITY = 0.62;
/** Kilitleme modunda daha net kare */
export const MRZ_LOCK_QUALITY = 0.84;

export type MrzLivePhase = 'warmup' | 'watch' | 'signal' | 'locking';

export type MrzLiveAnalyzeResult =
  | { phase: MrzLivePhase; locked?: undefined }
  | { phase: 'locking'; locked: { mrz: string; parsed: ParsedDocument } };

export function mrzLiveIntervalForPhase(phase: MrzLivePhase): number {
  if (phase === 'signal' || phase === 'locking') return MRZ_SIGNAL_INTERVAL_MS;
  return MRZ_WATCH_INTERVAL_MS;
}

export function mrzCaptureQualityForPhase(phase: MrzLivePhase, torchOn: boolean): number {
  const base = phase === 'signal' || phase === 'locking' ? MRZ_LOCK_QUALITY : MRZ_SCOUT_QUALITY;
  return torchOn ? Math.min(0.9, base + 0.06) : base;
}

/**
 * OCR satırlarından MRZ çıkarımı.
 * watch: MRZ yok veya zayıf sinyal
 * signal: MRZ benzeri satır var, henüz tam parse yok
 * locking: geçerli pasaport/kimlik MRZ
 */
export function analyzeOcrLinesForMrzLive(lines: string[]): MrzLiveAnalyzeResult {
  const norm = normalizeMrzOcrLines(lines);
  const probe = norm.length ? norm : lines;
  const rawProbe = lines.map((l) => l.trim()).filter((l) => l.length >= 14);
  if (!ocrLinesLookLikeMrz(probe) && !ocrLinesLookLikeMrz(lines) && !ocrLinesLookLikeMrz(rawProbe)) {
    return { phase: 'watch' };
  }

  const best =
    extractMrzFromLinesBest(probe.length ? probe : lines) ??
    extractMrzFromLinesBest(rawProbe.length ? rawProbe : lines);
  if (!best) {
    return { phase: 'signal' };
  }

  const ocrLines = probe.length ? probe : lines;
  const withNames = applyBestPassportNamesToParsed(best.parsed, ocrLines);
  const parsed = applyBestPassportIdentityToParsed(withNames, ocrLines, best.parsed);

  return { phase: 'locking', locked: { mrz: best.mrz, parsed } };
}
