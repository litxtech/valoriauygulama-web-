import { ADMIN_HOME_LIVE_OPS_SESSION_TTL_MS } from '@/lib/adminHomePerf';

const SESSION_TTL_MS = ADMIN_HOME_LIVE_OPS_SESSION_TTL_MS;

type SessionEntry = { state: unknown; at: number };

const sessions = new Map<string, SessionEntry>();
const loadPromises = new Map<string, Promise<unknown>>();

export function liveOpsMapSessionKey(orgId: string): string {
  return orgId;
}

export function getLiveOpsMapSession<T>(key: string, allowStale = false): T | null {
  const entry = sessions.get(key);
  if (!entry) return null;
  if (!allowStale && Date.now() - entry.at > SESSION_TTL_MS) return null;
  return entry.state as T;
}

export function setLiveOpsMapSession<T>(key: string, state: T): void {
  sessions.set(key, { state, at: Date.now() });
}

export function getLiveOpsMapSessionAgeMs(key: string): number | null {
  const entry = sessions.get(key);
  if (!entry) return null;
  return Date.now() - entry.at;
}

/** Paylaşımlı yükleme — aynı key için eşzamanlı istekleri birleştirir (farklı key'ler birbirini beklemez). */
export function runLiveOpsMapLoad<T>(
  key: string,
  fetcher: () => Promise<T>,
  force = false
): Promise<T> {
  if (!force) {
    const hit = getLiveOpsMapSession<T>(key, true);
    if (hit && (getLiveOpsMapSessionAgeMs(key) ?? Infinity) < SESSION_TTL_MS) {
      return Promise.resolve(hit);
    }
  }

  const inflight = loadPromises.get(key);
  if (inflight) return inflight as Promise<T>;

  const promise = (async () => {
    try {
      const state = await fetcher();
      setLiveOpsMapSession(key, state);
      return state;
    } finally {
      if (loadPromises.get(key) === promise) {
        loadPromises.delete(key);
      }
    }
  })();

  loadPromises.set(key, promise);
  return promise as Promise<T>;
}

// —— Paylaşımlı poll / realtime (çift hook = tek ağ döngüsü) ——
let pollTimer: ReturnType<typeof setInterval> | null = null;
let realtimeUnsub: (() => void) | null = null;
const listeners = new Set<() => void>();

function notifyLiveOpsListeners(): void {
  for (const fn of listeners) fn();
}

export function liveOpsMapSubscribe(
  onTick: () => void,
  startRealtime: (onLocation: () => void) => () => void
): () => void {
  listeners.add(onTick);
  if (listeners.size === 1) {
    pollTimer = setInterval(notifyLiveOpsListeners, ADMIN_HOME_LIVE_OPS_SESSION_TTL_MS);
    realtimeUnsub = startRealtime(notifyLiveOpsListeners);
  }
  return () => {
    listeners.delete(onTick);
    if (listeners.size === 0) {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      realtimeUnsub?.();
      realtimeUnsub = null;
    }
  };
}
