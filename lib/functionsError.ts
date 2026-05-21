import { FunctionsHttpError } from '@supabase/supabase-js';
import type { ApiResult } from '@/lib/kbsApi';

/**
 * Edge function 4xx/5xx döndüğünde Supabase client sadece generic mesaj veriyor.
 * Gerçek hata gövdesini FunctionsHttpError.context (Response) üzerinden okur.
 */
export async function getEdgeFunctionErrorMessage(error: unknown): Promise<string> {
  const parsed = await parseEdgeFunctionErrorBody(error);
  if (parsed?.message) return parsed.message;
  return (error as Error)?.message ?? 'Bilinmeyen hata';
}

export async function parseEdgeFunctionErrorBody(
  error: unknown
): Promise<{ code?: string; message: string } | null> {
  if (!(error instanceof FunctionsHttpError) || !error.context) {
    return null;
  }

  try {
    const ctx = error.context as { json?: () => Promise<unknown>; text?: () => Promise<string> };
    let body: unknown = null;
    if (typeof ctx.json === 'function') {
      body = await ctx.json();
    } else if (typeof ctx.text === 'function') {
      const text = await ctx.text();
      try {
        body = JSON.parse(text);
      } catch {
        return { message: text.slice(0, 500) };
      }
    }

    if (!body || typeof body !== 'object') return null;
    const b = body as {
      ok?: boolean;
      error?: { code?: string; message?: string } | string;
      message?: string;
    };

    if (typeof b.error === 'object' && b.error?.message) {
      return { code: b.error.code, message: b.error.message };
    }
    if (typeof b.error === 'string') {
      return { message: b.error };
    }
    if (typeof b.message === 'string') {
      return { message: b.message };
    }
  } catch {
    // fallback below
  }

  return null;
}

/** invoke() non-2xx döndüğünde gövdedeki { ok:false, error } yapısını mümkünse kurtarır. */
export async function edgeInvokeToApiResult<T>(args: {
  data: unknown;
  error: unknown;
  deployHint?: string;
}): Promise<ApiResult<T>> {
  const { data, error, deployHint } = args;

  if (!error) {
    if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
      const j = data as { ok?: boolean };
      if (typeof j.ok === 'boolean') return data as ApiResult<T>;
    }
    return { ok: false, error: { code: 'EDGE', message: 'Beklenmeyen Edge yanıtı' } };
  }

  const parsed = await parseEdgeFunctionErrorBody(error);
  if (parsed && data !== null && typeof data === 'object') {
    const j = data as { ok?: boolean };
    if (typeof j.ok === 'boolean') return data as ApiResult<T>;
  }

  const rawMsg = (error as Error)?.message ?? 'Edge function error';
  if (/Function not found|404|not found/i.test(rawMsg)) {
    return {
      ok: false,
      error: {
        code: 'EDGE_DEPLOY',
        message: deployHint ?? 'Edge fonksiyonu deploy edilmemiş.',
      },
    };
  }

  if (/non-2xx|2xx status/i.test(rawMsg)) {
    return {
      ok: false,
      error: {
        code: parsed?.code ?? 'EDGE_HTTP',
        message:
          parsed?.message ??
          'Edge fonksiyonu hata döndü. Supabase → Edge Functions → Logs bölümünden ayrıntıya bakın.',
      },
    };
  }

  return {
    ok: false,
    error: {
      code: parsed?.code ?? 'EDGE',
      message: parsed?.message ?? rawMsg,
    },
  };
}
