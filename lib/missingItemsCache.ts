import type { MissingItemReportRow } from '@/lib/missingItems';

const cache = new Map<string, MissingItemReportRow>();

export function cacheMissingItemReport(report: MissingItemReportRow): void {
  cache.set(report.id, report);
}

export function getCachedMissingItemReport(id: string): MissingItemReportRow | undefined {
  return cache.get(id);
}

export function patchCachedMissingItemReport(
  id: string,
  patch: Partial<MissingItemReportRow> | ((prev: MissingItemReportRow) => MissingItemReportRow)
): void {
  const prev = cache.get(id);
  if (!prev) return;
  const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
  cache.set(id, next);
}
