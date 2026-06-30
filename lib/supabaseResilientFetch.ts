import {
  extractErrorMessage,
  isSupabaseUnavailableError,
  sanitizeSupabaseErrorMessage,
} from '@/lib/supabaseTransientErrors';
import { markSupabaseUnhealthy } from '@/lib/supabaseHealthGate';

/** Okuma / RPC — yavaş sunucuda donmayı kısaltır ama meşru sorguları kesmeyecek kadar geniş. */
const FETCH_TIMEOUT_READ_MS = 20_000;
/** Auth oturumu — GoTrue. */
const FETCH_TIMEOUT_AUTH_MS = 10_000;
/** Storage yükleme — büyük dosyalar. */
const FETCH_TIMEOUT_UPLOAD_MS = 25_000;

const TRANSIENT_HTTP = new Set([502, 503, 504, 522, 524]);

function resolveFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function resolveFetchTimeoutMs(input: RequestInfo | URL, init?: RequestInit): number {
  const url = resolveFetchUrl(input);
  const method = (init?.method ?? 'GET').toUpperCase();
  if (url.includes('/auth/v1/')) return FETCH_TIMEOUT_AUTH_MS;
  if (url.includes('/storage/v1/object/') && method !== 'GET' && method !== 'HEAD') {
    return FETCH_TIMEOUT_UPLOAD_MS;
  }
  return FETCH_TIMEOUT_READ_MS;
}

function isHtmlErrorBody(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return (
    lower.startsWith('<!doctype') ||
    lower.startsWith('<html') ||
    lower.includes('error code 522') ||
    lower.includes('error code 524') ||
    lower.includes('connection timed out</span>')
  );
}

/** GoTrue / PostgREST — geçersiz gövde yerine parse edilebilir hata JSON. */
function syntheticUnavailableResponse(status = 503): Response {
  return new Response(
    JSON.stringify({
      error: 'server_unavailable',
      error_description: 'Supabase geçici olarak erişilemiyor (522)',
      message: 'Supabase geçici olarak erişilemiyor (522)',
      code: 'SUPABASE_UNAVAILABLE',
    }),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

function bodyLooksLikeJson(text: string): boolean {
  const t = text.trim();
  return t.startsWith('{') || t.startsWith('[');
}

async function responseLooksLikeCloudflareHtml(res: Response): Promise<boolean> {
  if (TRANSIENT_HTTP.has(res.status)) {
    const peek = await res.clone().text().catch(() => '');
    if (isHtmlErrorBody(peek)) return true;
    if (res.status === 522 || res.status === 524) return true;
  }
  const ct = (res.headers.get('content-type') ?? '').toLowerCase();
  if (ct.includes('text/html')) {
    const peek = await res.clone().text().catch(() => '');
    return isHtmlErrorBody(peek);
  }
  return false;
}

/** 522 HTML, text/plain veya düz metin (ör. "error…") — auth-js JSON parse patlamasın. */
async function responseNeedsJsonNormalization(res: Response): Promise<boolean> {
  // Gerçek geçici/edge hataları (Cloudflare HTML, 5xx) her zaman normalize edilmeli.
  if (await responseLooksLikeCloudflareHtml(res)) return true;
  if (TRANSIENT_HTTP.has(res.status)) return true;

  const ct = (res.headers.get('content-type') ?? '').toLowerCase();

  // Başarılı (2xx) yanıtlara dokunma: skaler JSON (sayı/bool/uuid string) ve
  // JSON dışı geçerli içerik (CSV, düz metin RPC sonucu) sahte 503'e çevrilmemeli.
  // Sadece gövde gerçekten Cloudflare/HTML hata sayfasıysa normalize et.
  if (res.ok) {
    if (ct.includes('json')) return false;
    const peek = await res.clone().text().catch(() => '');
    if (!peek.trim()) return false;
    return isHtmlErrorBody(peek);
  }

  // Hata yanıtı: gövde JSON değilse (auth-js/PostgREST parse patlamasın) normalize et.
  if (!ct.includes('json')) {
    const peek = await res.clone().text().catch(() => '');
    if (!peek.trim()) return true;
    return !bodyLooksLikeJson(peek);
  }
  return false;
}

type FetchAttempt =
  | { kind: 'ok'; res: Response }
  | { kind: 'transient'; status: number };

async function attemptFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<FetchAttempt> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let signal = controller.signal;
  if (init?.signal) {
    const AnySignal = AbortSignal as typeof AbortSignal & {
      any?: (signals: AbortSignal[]) => AbortSignal;
    };
    signal =
      typeof AnySignal.any === 'function'
        ? AnySignal.any([init.signal, controller.signal])
        : init.signal;
  }

  try {
    const res = await fetch(input, { ...init, signal });
    if (await responseNeedsJsonNormalization(res)) {
      return {
        kind: 'transient',
        status: TRANSIENT_HTTP.has(res.status) ? res.status : res.ok ? 503 : res.status,
      };
    }
    return { kind: 'ok', res };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Yan etkisiz okuma — geçici blipte güvenle yeniden denenebilir. */
function isRetryableRead(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return false;
  const url = resolveFetchUrl(input);
  // Auth oturum uçları kendi akışında ele alınıyor; storage indirimi büyük olabilir.
  if (url.includes('/auth/v1/')) return false;
  return true;
}

const READ_RETRY_BACKOFF_MS = 400;

/** Cloudflare 522 HTML ve uzun timeout — auth/PostgREST uncaught promise üretmesin. */
export async function supabaseResilientFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const timeoutMs = resolveFetchTimeoutMs(input, init);
  // Okuma istekleri geçici bir hatada bir kez daha denensin; UI tek blipte boş kalmasın.
  const maxAttempts = isRetryableRead(input, init) ? 2 : 1;

  let lastTransientStatus = 503;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const isLast = attempt + 1 >= maxAttempts;
    try {
      const result = await attemptFetch(input, init, timeoutMs);
      if (result.kind === 'ok') return result.res;
      lastTransientStatus = result.status;
    } catch (e) {
      const msg = extractErrorMessage(e);
      const transient =
        msg.includes('aborted') || msg.includes('AbortError') || isSupabaseUnavailableError(msg);
      if (!transient) {
        throw e instanceof Error ? e : new Error(sanitizeSupabaseErrorMessage(msg));
      }
      lastTransientStatus = 504;
    }
    if (!isLast) {
      await new Promise((r) => setTimeout(r, READ_RETRY_BACKOFF_MS));
    }
  }

  markSupabaseUnhealthy();
  return syntheticUnavailableResponse(lastTransientStatus);
}
