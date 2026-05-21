/** PostgREST `ops` şeması — Accept-Profile / Content-Profile zorunlu (PGRST106 önlenir). */

export const OPS_SCHEMA_HINT =
  "Supabase Dashboard → Project Settings → Data API → Exposed schemas: public ve ops (ikisi de işaretli). Kaydedin, 1–2 dk bekleyin.";

export function opsRestHeaders(serviceKey: string, extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: "application/json",
    "Accept-Profile": "ops",
    "Content-Profile": "ops",
    ...extra,
  };
}

export type OpsFetchResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; status: number; code?: string };

export async function opsFetchJson<T>(
  supabaseUrl: string,
  serviceKey: string,
  path: string,
  init?: RequestInit
): Promise<OpsFetchResult<T>> {
  const base = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${path.replace(/^\//, "")}`;
  const headers = opsRestHeaders(
    serviceKey,
    init?.headers as Record<string, string> | undefined
  );

  const res = await fetch(base, { ...init, headers });
  const text = await res.text();

  if (res.status === 406 || /PGRST106/i.test(text)) {
    return {
      ok: false,
      error: `ops şeması API'de açık değil (PGRST106). ${OPS_SCHEMA_HINT}`,
      status: res.status,
      code: "PGRST106",
    };
  }

  if (!res.ok) {
    let msg = text.slice(0, 400);
    try {
      const j = JSON.parse(text) as { message?: string; error?: string };
      msg = j.message ?? j.error ?? msg;
    } catch {
      /* raw text */
    }
    return { ok: false, error: msg, status: res.status };
  }

  if (!text) return { ok: true, data: null as T, status: res.status };
  try {
    return { ok: true, data: JSON.parse(text) as T, status: res.status };
  } catch {
    return { ok: false, error: "PostgREST JSON parse failed", status: res.status };
  }
}

export async function opsRpc(
  supabaseUrl: string,
  serviceKey: string,
  fn: string,
  args: Record<string, unknown>
): Promise<OpsFetchResult<unknown>> {
  return opsFetchJson(supabaseUrl, serviceKey, `rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
}
