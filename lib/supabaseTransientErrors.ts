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

/** Cloudflare HTML hata sayfası veya çok uzun PostgREST mesajlarını kısalt. */
export function sanitizeSupabaseErrorMessage(message: string | undefined, maxLen = 160): string {
  if (!message) return 'Unknown error';
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('<!doctype') ||
    lower.startsWith('<html') ||
    lower.includes('error code 522') ||
    lower.includes('error code 523') ||
    lower.includes('error code 524') ||
    lower.includes('connection timed out</span>')
  ) {
    return 'Supabase geçici olarak erişilemiyor (522)';
  }
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}

/** Ağ / Cloudflare 522-524 veya gateway 504 — rol bilinmeden misafir sayma. */
/** GoTrue yanıtı JSON değilken (522 HTML, düz metin) auth-js bu metni üretir. */
export function isAuthJsonParseError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes('json parse error') ||
    m.includes('unexpected character') ||
    m.includes('unexpected token') ||
    m.includes('is not valid json')
  );
}

export function isSupabaseUnavailableError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    isAuthJsonParseError(message) ||
    m.includes('timed out') ||
    m.includes('timeout') ||
    m.includes('network request failed') ||
    m.includes('failed to fetch') ||
    m.includes('522') ||
    m.includes('523') ||
    m.includes('524') ||
    m.includes('504') ||
    m.includes('503') ||
    m.includes('server_unavailable') ||
    m.includes('supabase_unavailable') ||
    m.includes('supabase geçici') ||
    m.includes('context canceled') ||
    m.includes('econnreset') ||
    m.includes('etimedout') ||
    m.includes('<!doctype') ||
    m.includes('error code 522') ||
    m.includes('cloudflare')
  );
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

export function extractErrorMessage(reason: unknown): string {
  if (!reason) return '';
  if (typeof reason === 'string') return reason;
  if (reason instanceof Error) return reason.message;
  if (typeof reason === 'object' && 'message' in reason) {
    const m = (reason as { message?: unknown }).message;
    return typeof m === 'string' ? m : String(m ?? '');
  }
  return String(reason);
}

/** Fetch timeout / iptal — kullanıcıya ham "aborted" gösterme. */
export function isAbortLikeError(reason: unknown): boolean {
  if (reason instanceof Error && reason.name === 'AbortError') return true;
  const msg = extractErrorMessage(reason).toLowerCase();
  return msg.includes('aborted') || msg.includes('aborterror') || msg === 'abort';
}

export function toSupabaseUserMessage(reason: unknown, fallback = 'Bağlantı hatası'): string {
  if (isAbortLikeError(reason)) {
    return 'Bağlantı zaman aşımına uğradı. Tekrar deneyin.';
  }
  const msg = sanitizeSupabaseErrorMessage(extractErrorMessage(reason));
  if (isSupabaseUnavailableError(msg)) {
    return 'Sunucuya ulaşılamıyor. Biraz sonra yenileyin.';
  }
  return msg || fallback;
}

/** PostgREST / RPC geçici hata — yeniden denenebilir. */
export function isTransientSupabaseDbError(
  e: { code?: string; message?: string } | null | undefined
): boolean {
  if (!e) return false;
  if (e.code === 'SUPABASE_UNAVAILABLE' || e.code === 'PGRST002') return true;
  return isSupabaseUnavailableError(e.message) || isPostgrestSchemaCacheError(e);
}

export function isTransientSupabaseRejection(reason: unknown): boolean {
  if (reason && typeof reason === 'object') {
    const o = reason as { code?: unknown; error?: unknown };
    if (o.code === 'SUPABASE_UNAVAILABLE') return true;
    if (o.error === 'server_unavailable') return true;
  }
  return isSupabaseUnavailableError(extractErrorMessage(reason));
}
