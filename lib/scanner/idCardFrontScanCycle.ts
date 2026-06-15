import { idFrontLockFingerprint } from '@/lib/scanner/idCardFrontLiveEngine';
import type { ParsedDocument } from '@/lib/scanner/types';

export const ID_FRONT_SCAN_LOCK_COOLDOWN_MS = 2800;

export function shouldAcceptIdFrontLock(
  lastKey: string | null,
  lastAt: number,
  parsed: ParsedDocument,
  now = Date.now()
): boolean {
  const key = idFrontLockFingerprint(parsed);
  if (!key || key === '|') return false;
  if (lastKey === key && now - lastAt < ID_FRONT_SCAN_LOCK_COOLDOWN_MS) return false;
  return true;
}

export function recordIdFrontLock(
  ref: { key: string | null; at: number },
  parsed: ParsedDocument
): void {
  ref.key = idFrontLockFingerprint(parsed);
  ref.at = Date.now();
}

export function clearIdFrontLockRecord(ref: { key: string | null; at: number }): void {
  ref.key = null;
  ref.at = 0;
}
