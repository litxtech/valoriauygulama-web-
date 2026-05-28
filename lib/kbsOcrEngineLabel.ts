import { MRZ_OCR_ENGINE_VISION_MLKIT } from '@/lib/scanner/mrzOcrEngine';
import { MRZ_OCR_ENGINE_EXPO } from '@/lib/scanner/ocrLinesFromImage';

/** İsteğe bağlı gelişmiş / yedek okuma (expo) — nadiren kullanılır. */
export const KBS_OCR_ENGINE_AI_FALLBACK = 'kbs-ai-fallback' as const;
/** MRZ yok — kimlik/pasaport ön yüzündeki yazılı alanlar. */
export const KBS_OCR_ENGINE_FRONT_VISUAL = 'kbs-on-yuz' as const;

export function kbsOcrEngineLabel(engine: string | null | undefined): string {
  const e = (engine ?? '').trim();
  if (e === KBS_OCR_ENGINE_FRONT_VISUAL) return 'Ön yüz okuma';
  if (e === MRZ_OCR_ENGINE_VISION_MLKIT) return 'Belge okuma';
  if (e === KBS_OCR_ENGINE_AI_FALLBACK) return 'AI yedek okuma';
  if (e === MRZ_OCR_ENGINE_EXPO) return 'Yedek okuma';
  if (!e) return 'Okuma';
  return 'Okuma';
}

export function kbsOcrEngineShort(engine: string | null | undefined): string {
  const e = (engine ?? '').trim();
  if (e === KBS_OCR_ENGINE_FRONT_VISUAL) return 'Ön yüz';
  if (e === MRZ_OCR_ENGINE_VISION_MLKIT) return 'Okuma';
  if (e === KBS_OCR_ENGINE_AI_FALLBACK) return 'AI';
  if (e === MRZ_OCR_ENGINE_EXPO) return 'Yedek';
  return '';
}
