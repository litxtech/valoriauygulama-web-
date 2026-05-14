import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';

/** Debug: köprü Supabase Edge `ops-proxy` → Hetzner KBS gateway (KBS’ye doğrudan değil). */
function getKbsBridgeLabel(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const pub = (extra.public ?? {}) as Record<string, unknown>;
  const u = typeof pub.supabaseUrl === 'string' ? pub.supabaseUrl : '';
  return u ? `edge:ops-proxy → KBS gateway (${u})` : 'edge:ops-proxy';
}

export const kbsOpsBridgeLabel = getKbsBridgeLabel();

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } };

export type ApiDebugEntry = {
  ts: string;
  method: 'GET' | 'POST';
  url: string;
  status?: number;
  contentType?: string;
  bodyPreview?: string;
  note?: string;
};

let lastApiDebug: ApiDebugEntry | null = null;
export function getLastApiDebug() {
  return lastApiDebug;
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Köprü bazen düz string döner; gürültülü JSON / çift string-JSON için toleranslı parse. */
function parseJsonLenient(raw: string): unknown | undefined {
  const t = stripBom(raw.trim());
  if (!t) return undefined;

  const tryOne = (x: string): unknown | undefined => {
    try {
      return JSON.parse(x) as unknown;
    } catch {
      return undefined;
    }
  };

  let v = tryOne(t);
  if (v !== undefined) {
    if (typeof v === 'string') {
      const inner = tryOne(v.trim());
      if (inner !== undefined) return inner;
    }
    return v;
  }

  const o0 = t.indexOf('{');
  const o1 = t.lastIndexOf('}');
  if (o0 !== -1 && o1 > o0) {
    v = tryOne(t.slice(o0, o1 + 1));
    if (v !== undefined) return v;
  }
  const a0 = t.indexOf('[');
  const a1 = t.lastIndexOf(']');
  if (a0 !== -1 && a1 > a0) {
    v = tryOne(t.slice(a0, a1 + 1));
    if (v !== undefined) return v;
  }
  return undefined;
}

/** Edge invoke bazen gövdeyi string veya düz metin (ör. "OK") verir; JSON parse + ApiResult şekline çevir. */
function normalizeInvokePayload(raw: unknown): unknown {
  if (raw == null) return raw;
  if (typeof raw === 'string') {
    if (/^ok$/i.test(raw.trim())) {
      return { ok: true, data: { message: 'OK', rawText: raw.trim() } };
    }
    const parsed = parseJsonLenient(raw);
    if (parsed !== undefined) return parsed;

    const snippet = raw.trim().slice(0, 1200);
    const isHtml = /<!DOCTYPE\s+html|<html[\s>]/i.test(snippet);
    const express404 = /Cannot\s+(GET|POST|PUT|DELETE)\s+\//i.test(snippet);
    if (isHtml || express404) {
      return {
        ok: false,
        error: {
          code: 'GATEWAY_HTML',
          message:
            'Sunucu JSON yerine HTML hata sayfası döndü. Genelde VPS’teki gateway sürümü eski (bu route yok) veya yanlış porta istek gidiyor. VPS’te `railway-service` klasöründe: npm run build && pm2 restart; KBS_GATEWAY_URL’nin doğru IP:port olduğundan emin olun.',
          details: snippet,
        },
      };
    }

    return {
      ok: false,
      error: {
        code: 'NON_JSON',
        message: 'Gateway yanıtı geçerli JSON değil (köprü veya VPS çıktısını kontrol edin).',
        details: snippet.slice(0, 800),
      },
    };
  }
  return raw;
}

function coerceApiResult<T>(json: unknown): ApiResult<T> {
  const normalized = normalizeInvokePayload(json);
  const j = normalized as Record<string, unknown> | null;

  if (normalized !== null && typeof normalized === 'object' && !Array.isArray(normalized) && typeof j.ok === 'boolean') {
    return normalized as ApiResult<T>;
  }

  const msg =
    typeof j?.error === 'object' && j.error !== null && typeof (j.error as { message?: string }).message === 'string'
      ? (j.error as { message: string }).message
      : typeof j?.message === 'string'
        ? j.message
        : 'Unexpected server response';

  const code =
    typeof j?.error === 'object' && j.error !== null && typeof (j.error as { code?: string }).code === 'string'
      ? (j.error as { code: string }).code
      : typeof j?.code === 'string'
        ? j.code
        : typeof j?.code === 'number'
          ? String(j.code)
          : 'NETWORK';

  return { ok: false, error: { code, message: msg, details: normalized } };
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function normalizeKbsPath(path: string): string {
  return path.trim().replace(/[\s\u00a0]+/g, '');
}

async function invokeOpsProxy<T>(method: 'GET' | 'POST', path: string, payload?: unknown): Promise<ApiResult<T>> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: { code: 'AUTH', message: 'Not authenticated' } };

  const pathNorm = normalizeKbsPath(path);
  if (pathNorm.length === 0 || !pathNorm.startsWith('/')) {
    return { ok: false, error: { code: 'BAD_PATH', message: 'KBS path must start with /' } };
  }

  const url = `functions/v1/ops-proxy`;
  lastApiDebug = { ts: new Date().toISOString(), method, url, note: 'invoke_sent' };

  const { data, error } = await supabase.functions.invoke('ops-proxy', {
    body: method === 'GET' ? { method: 'GET', path: pathNorm } : { method: 'POST', path: pathNorm, payload: payload ?? {} },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) {
    lastApiDebug = {
      ts: new Date().toISOString(),
      method,
      url,
      note: 'invoke_error',
      bodyPreview: error.message?.slice(0, 500),
    };
    return { ok: false, error: { code: 'EDGE', message: error.message } };
  }

  const preview =
    typeof data === 'string'
      ? data.trim().slice(0, 400)
      : data !== null && typeof data === 'object'
        ? JSON.stringify(data).slice(0, 400)
        : String(data).slice(0, 400);
  lastApiDebug = { ts: new Date().toISOString(), method, url, note: 'invoke_ok', bodyPreview: preview };
  return coerceApiResult<T>(data);
}

export async function apiPost<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  return invokeOpsProxy<T>('POST', path, body);
}

export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  return invokeOpsProxy<T>('GET', path);
}
