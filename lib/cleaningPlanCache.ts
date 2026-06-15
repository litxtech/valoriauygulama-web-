import type { CleaningPlanBundle } from '@/lib/cleaningPlanLoad';

const TTL_MS = 120_000;

type Entry = { staffId: string; bundle: CleaningPlanBundle; updatedAt: number };

let session: Entry | null = null;

export function getCleaningPlanSessionCache(staffId: string): CleaningPlanBundle | null {
  if (!session || session.staffId !== staffId) return null;
  if (Date.now() - session.updatedAt > TTL_MS) return null;
  return session.bundle;
}

export function getCleaningPlanSessionCacheStale(staffId: string): CleaningPlanBundle | null {
  if (!session || session.staffId !== staffId) return null;
  return session.bundle;
}

export function setCleaningPlanSessionCache(staffId: string, bundle: CleaningPlanBundle): void {
  session = { staffId, bundle, updatedAt: Date.now() };
}

export function isCleaningPlanCacheFresh(staffId: string): boolean {
  if (!session || session.staffId !== staffId) return false;
  return Date.now() - session.updatedAt <= TTL_MS;
}

export function invalidateCleaningPlanSessionCache(): void {
  session = null;
}
