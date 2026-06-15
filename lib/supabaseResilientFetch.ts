import {
  extractErrorMessage,
  isSupabaseUnavailableError,
  sanitizeSupabaseErrorMessage,
} from '@/lib/supabaseTransientErrors';

const FETCH_TIMEOUT_MS = 25_000;
const TRANSIENT_HTTP = new Set([502, 503, 504, 522, 524]);

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
  if (await responseLooksLikeCloudflareHtml(res)) return true;
  const ct = (res.headers.get('content-type') ?? '').toLowerCase();
  if (ct.includes('text/html') || ct.includes('text/plain')) return true;
  if (TRANSIENT_HTTP.has(res.status)) return true;
  if (!res.ok && !ct.includes('json')) return true;
  const peek = await res.clone().text().catch(() => '');
  if (!peek.trim()) return !res.ok;
  return !bodyLooksLikeJson(peek);
}

/** Cloudflare 522 HTML ve uzun timeout — auth/PostgREST uncaught promise üretmesin. */
export async function supabaseResilientFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

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
      return syntheticUnavailableResponse(
        TRANSIENT_HTTP.has(res.status) ? res.status : res.ok ? 503 : res.status
      );
    }
    return res;
  } catch (e) {
    const msg = extractErrorMessage(e);
    if (
      msg.includes('aborted') ||
      msg.includes('AbortError') ||
      isSupabaseUnavailableError(msg)
    ) {
      return syntheticUnavailableResponse(504);
    }
    throw e instanceof Error ? e : new Error(sanitizeSupabaseErrorMessage(msg));
  } finally {
    clearTimeout(timeoutId);
  }
}
