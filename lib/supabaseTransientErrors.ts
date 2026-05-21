/**
 * PostgREST geçici hatalar (PGRST002: schema cache, vb.) — kısa aralıklarla yeniden denemeye uygun.
 */
export function isPostgrestSchemaCacheError(
  e: { code?: string; message?: string } | null | undefined
): boolean {
  if (!e) return false;
  if (e.code === 'PGRST002') return true;
  const m = (e.message ?? '').toLowerCase();
  return m.includes('schema cache') && m.includes('retry');
}

/** Data API → Exposed schemas listesinde `ops` yok (HTTP 406). */
export function isOpsSchemaNotExposedError(
  e: { code?: string; message?: string; status?: number } | null | undefined
): boolean {
  if (!e) return false;
  if (e.code === 'PGRST106' || e.status === 406) return true;
  const m = (e.message ?? '').toLowerCase();
  return m.includes('pgrst106') || m.includes('exposed schemas') || m.includes('invalid schema');
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Ağ / PostgREST takılırsa sonsuz bekleme olmasın. */
export function withTimeout<T>(promise: PromiseLike<T>, ms: number, label = 'request'): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

/** Ağ / Cloudflare 522-524 veya gateway 504 — rol bilinmeden misafir sayma. */
export function isSupabaseUnavailableError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes('timed out') ||
    m.includes('timeout') ||
    m.includes('network request failed') ||
    m.includes('failed to fetch') ||
    m.includes('522') ||
    m.includes('524') ||
    m.includes('504') ||
    m.includes('503') ||
    m.includes('context canceled') ||
    m.includes('econnreset') ||
    m.includes('etimedout')
  );
}
