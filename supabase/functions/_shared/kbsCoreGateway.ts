/** Edge → Railway kbs-core HMAC istemcisi (JWT / ops oturumu yok). */

import { normalizeGatewayBase, validateKbsGatewayBase } from "./kbsGatewayUrl.ts";

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return bytesToBase64(new Uint8Array(sig));
}

export function resolveKbsCoreBase(): string {
  const raw =
    Deno.env.get("KBS_CORE_URL") ??
    Deno.env.get("GATEWAY_BASE_URL") ??
    Deno.env.get("KBS_SOAP_GATEWAY_URL") ??
    "";
  return normalizeGatewayBase(raw);
}

export async function postKbsCoreGateway<T = unknown>(
  path: string,
  payload: unknown,
): Promise<
  | { ok: true; data: T; httpStatus: number }
  | { ok: false; code: string; message: string; httpStatus?: number; details?: unknown }
> {
  const base = resolveKbsCoreBase();
  const check = validateKbsGatewayBase(base);
  const secret = (Deno.env.get("GATEWAY_SHARED_SECRET") ?? "").trim();

  if (!check.ok) {
    return {
      ok: false,
      code: "CONFIG",
      message: `${check.message} Secret KBS_CORE_URL = https://kbs-core-production.up.railway.app`,
    };
  }
  if (secret.length < 16) {
    return {
      ok: false,
      code: "CONFIG",
      message: "GATEWAY_SHARED_SECRET Edge secret eksik (kbs-core ile aynı olmalı).",
    };
  }

  const body = JSON.stringify(payload ?? {});
  const ts = Date.now();
  const message = `${ts}.POST.${path}.${body}`;
  const signature = await hmacSha256Base64(secret, message);
  const url = `${base}${path}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-gw-ts": String(ts),
        "x-gw-signature": signature,
      },
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return {
        ok: false,
        code: "UPSTREAM",
        httpStatus: res.status,
        message: `KBS core JSON değil (HTTP ${res.status}).`,
        details: text.slice(0, 200),
      };
    }

    if (parsed.ok === true) {
      return { ok: true, data: (parsed.data as T) ?? (parsed as T), httpStatus: res.status };
    }

    const err = parsed.error as { code?: string; message?: string } | undefined;
    const msg = err?.message || `KBS core hata (HTTP ${res.status})`;
    const code = err?.code || (res.status === 401 ? "UNAUTHORIZED" : "UPSTREAM");
    return {
      ok: false,
      code: code === "INVALID_SIGNATURE" || code === "UNAUTHORIZED" ? "GATEWAY_SIGN" : code,
      message:
        code === "INVALID_SIGNATURE" || /unauthorized/i.test(msg)
          ? "KBS core imza reddetti. GATEWAY_SHARED_SECRET ops/core ile aynı olmalı."
          : msg,
      httpStatus: res.status,
      details: parsed,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort/i.test(msg)) {
      return { ok: false, code: "TIMEOUT", message: "KBS core yanıt vermedi (45 sn)." };
    }
    return { ok: false, code: "UPSTREAM", message: `KBS core erişim hatası: ${msg}` };
  } finally {
    clearTimeout(t);
  }
}
