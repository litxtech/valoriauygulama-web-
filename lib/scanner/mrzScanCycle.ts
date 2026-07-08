/** Aynı MRZ’nin ardışık OCR karelerinde çift kilitlemesini önler (ms). */
export const MRZ_SCAN_LOCK_COOLDOWN_MS = 1100;

export function mrzNormalizedKey(mrz: string): string {
  return mrz.replace(/\r/g, '').trim().toUpperCase();
}

/** Yeni kilitleme kabul edilsin mi (aynı MRZ kısa sürede tekrarlanmasın). */
export function shouldAcceptMrzLock(
  lastKey: string | null,
  lastAt: number,
  mrz: string,
  now = Date.now(),
  cooldownMs = MRZ_SCAN_LOCK_COOLDOWN_MS
): boolean {
  const key = mrzNormalizedKey(mrz);
  if (!key.length) return false;
  if (lastKey === key && now - lastAt < cooldownMs) return false;
  return true;
}

export function recordMrzLock(
  refs: { key: string | null; at: number },
  mrz: string,
  now = Date.now()
): void {
  refs.key = mrzNormalizedKey(mrz);
  refs.at = now;
}

export function clearMrzLockRecord(refs: { key: string | null; at: number }): void {
  refs.key = null;
  refs.at = 0;
}
