import type { FeedPostViewerRow } from '@/lib/feedPostViewers';
import { loadFeedPostViewers } from '@/lib/feedPostViewers';

/** Kısa TTL: aksi halde ilk prefetch sonsuza kadar eski listeyi kilitler. */
const CACHE_TTL_MS = 8_000;

type CacheEntry = { rows: FeedPostViewerRow[]; at: number };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<FeedPostViewerRow[]>>();

function isFresh(entry: CacheEntry | undefined): entry is CacheEntry {
  return !!entry && Date.now() - entry.at <= CACHE_TTL_MS;
}

export function getCachedFeedPostViewers(postId: string): FeedPostViewerRow[] | null {
  const entry = cache.get(postId);
  return entry ? entry.rows : null;
}

export function setCachedFeedPostViewers(postId: string, rows: FeedPostViewerRow[]): void {
  cache.set(postId, { rows, at: Date.now() });
}

export function prefetchFeedPostViewers(postId: string): void {
  if (isFresh(cache.get(postId)) || inflight.has(postId)) return;
  const p = loadFeedPostViewers(postId).then(({ rows, error }) => {
    inflight.delete(postId);
    if (!error) cache.set(postId, { rows, at: Date.now() });
    return rows;
  });
  inflight.set(postId, p);
}

export async function fetchFeedPostViewersCached(
  postId: string,
  opts?: { force?: boolean }
): Promise<{
  rows: FeedPostViewerRow[];
  fromCache: boolean;
  error: Error | null;
}> {
  if (!opts?.force) {
    const hit = cache.get(postId);
    if (isFresh(hit)) return { rows: hit.rows, fromCache: true, error: null };

    const pending = inflight.get(postId);
    if (pending) {
      const rows = await pending;
      return { rows, fromCache: true, error: null };
    }
  } else {
    invalidateFeedPostViewersCache(postId);
  }

  const p = loadFeedPostViewers(postId).then(({ rows, error }) => {
    inflight.delete(postId);
    if (!error) cache.set(postId, { rows, at: Date.now() });
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
