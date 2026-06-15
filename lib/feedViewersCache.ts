import type { FeedPostViewerRow } from '@/lib/feedPostViewers';
import { loadFeedPostViewers } from '@/lib/feedPostViewers';

const cache = new Map<string, FeedPostViewerRow[]>();
const inflight = new Map<string, Promise<FeedPostViewerRow[]>>();

export function getCachedFeedPostViewers(postId: string): FeedPostViewerRow[] | null {
  return cache.get(postId) ?? null;
}

export function setCachedFeedPostViewers(postId: string, rows: FeedPostViewerRow[]): void {
  cache.set(postId, rows);
}

export function prefetchFeedPostViewers(postId: string): void {
  if (cache.has(postId) || inflight.has(postId)) return;
  const p = loadFeedPostViewers(postId).then(({ rows, error }) => {
    inflight.delete(postId);
    if (!error) cache.set(postId, rows);
    return rows;
  });
  inflight.set(postId, p);
}

export async function fetchFeedPostViewersCached(postId: string): Promise<{
  rows: FeedPostViewerRow[];
  fromCache: boolean;
  error: Error | null;
}> {
  const hit = cache.get(postId);
  if (hit) return { rows: hit, fromCache: true, error: null };

  const pending = inflight.get(postId);
  if (pending) {
    const rows = await pending;
    return { rows, fromCache: true, error: null };
  }

  const p = loadFeedPostViewers(postId).then(({ rows, error }) => {
    inflight.delete(postId);
    if (!error) cache.set(postId, rows);
    return { rows, error };
  });
  inflight.set(
    postId,
    p.then((r) => r.rows)
  );
  const { rows, error } = await p;
  return { rows, fromCache: false, error };
}

export function invalidateFeedPostViewersCache(postId?: string): void {
  if (postId) {
    cache.delete(postId);
    inflight.delete(postId);
    return;
  }
  cache.clear();
  inflight.clear();
}
