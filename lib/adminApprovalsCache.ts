/** Oturum içi onay merkezi önbelleği — ekrana anında dönüş için. */
export type ApprovalsCacheItem = {
  kind: string;
  id: string;
  created_at: string;
  title: string;
  fromLine: string;
  whyLine: string;
  orgLine: string | null;
  organizationId: string | null;
  extraLines: string[];
  raw: unknown;
};

const TTL_MS = 60_000;

let entry: { key: string; items: ApprovalsCacheItem[]; at: number } | null = null;

export function approvalsCacheKey(canUseAll: boolean, orgScoped: string | null): string {
  return `${canUseAll ? 'all' : 'scoped'}:${orgScoped ?? '_'}`;
}

export function getApprovalsCache(key: string, allowStale = false): ApprovalsCacheItem[] | null {
  if (!entry || entry.key !== key) return null;
  if (!allowStale && Date.now() - entry.at > TTL_MS) return null;
  return entry.items;
}

export function setApprovalsCache(key: string, items: ApprovalsCacheItem[]): void {
  entry = { key, items, at: Date.now() };
}

export function getApprovalsCacheAgeMs(key: string): number | null {
  if (!entry || entry.key !== key) return null;
  return Date.now() - entry.at;
}
