import type { KbsCaptureSide } from '@/lib/kbsCaptureOcr';

const PREFIX = 'kbs_side:';

export function kbsCaptureSideWarning(side: KbsCaptureSide): string {
  return `${PREFIX}${side}`;
}

export function parseKbsCaptureSideFromWarnings(
  warnings: string[] | null | undefined
): KbsCaptureSide {
  const hit = warnings?.find((w) => w.startsWith(PREFIX));
  if (hit === `${PREFIX}mrz_back`) return 'mrz_back';
  return 'front';
}

export function isKbsCaptureSideWarning(w: string): boolean {
  return w.startsWith(PREFIX);
}
