/**
 * KBS bağlantı testi — Edge → kbs-core (HMAC) → Jandarma.
 * Railway kbs-ops JWT / ops.app_users oturumuna bağımlı değil.
 */

import { normalizeGatewayBase, validateKbsGatewayBase } from "./kbsGatewayUrl.ts";

export type KbsGatewayTestResult = {
  ok: boolean;
  message: string;
  via: string;
  httpStatus?: number;
  /** Machine code: AUTH | GATEWAY_TOKEN | CONFIG | TIMEOUT | UPSTREAM | KBS | OK */
  code?: string;
  /** Railway kbs-core çıkış IPv4 (Jandarma panel). */
  egressIp?: string | null;
};

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(invalid-url)";
  }
}

function enrichIpHint(message: string, egressIp?: string | null): string {
  // Sabit IP zorunlu değil — bu metin yalnızca Jandarma’nın döndürdüğü Yetkisiz IP için.
  if (!/yetkisiz\s*ip|yetkihatasi/i.test(message)) return message;
  if (egressIp && message.includes(egressIp)) return message;
  const ipLine = egressIp
    ? ` ★ JANDARMA’YA KAYDEDİLECEK IP: ${egressIp} — panelde yetkili IP ekleyin veya IP listesini tamamen SİLİN/BOŞALTIN.`
    : " Çıkış IP henüz okunamadı. Açın: https://kbs-ops-production.up.railway.app/egress-ip";
  return (
    `${message}` +
    " " +
    ipLine +
    " Eski VPS IP kayıtlıysa Yetkisiz IP verir. Sabit IP şart değil."
  );
}

/** kbs-ops ile kbs-core aynı Railway NAT → ops /egress-ip yedek. */
async function detectEgressViaOps(): Promise<string | null> {
  const raw =
    Deno.env.get("KBS_GATEWAY_URL") ??
    Deno.env.get("KBS_OPS_URL") ??
    "https://kbs-ops-production.up.railway.app";
  const base = normalizeGatewayBase(raw);
  if (!base) return null;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(`${base}/egress-ip`, { signal: controller.signal });
      if (!res.ok) return null;
      const j = (await res.json()) as { egressIp?: string | null };
      const ip = typeof j.egressIp === "string" ? j.egressIp.trim() : "";
      return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip) ? ip : null;
    } finally {
      clearTimeout(t);
    }
  } catch {
    return null;
  }
}

function logStep(level: "info" | "warn" | "error", payload: Record<string, unknown>) {
  const line = JSON.stringify({ scope: "kbs_connection_test", ts: new Date().toISOString(), ...payload });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

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

function resolveCoreBase(): string {
  const raw =
    Deno.env.get("KBS_CORE_URL") ??
    Deno.env.get("GATEWAY_BASE_URL") ??
    Deno.env.get("KBS_SOAP_GATEWAY_URL") ??
    "";
  return normalizeGatewayBase(raw);
}

function mapFailure(args: {
  status: number;
  bodyCode?: string;
  bodyMessage: string;
}): Pick<KbsGatewayTestResult, "message" | "code"> {
  const { status, bodyCode, bodyMessage } = args;
  const lower = `${bodyCode ?? ""} ${bodyMessage}`.toLowerCase();

  if (status === 401 || bodyCode === "INVALID_SIGNATURE" || /invalid.?signature|unauthorized/i.test(lower)) {
    return {
      code: "GATEWAY_TOKEN",
      message:
        "KBS core imza reddetti (HTTP 401). Supabase GATEWAY_SHARED_SECRET ile Railway kbs-core Variables birebir aynı olmalı.",
    };
  }

  if (status === 404) {
    return {
      code: "UPSTREAM",
      message:
        "KBS core yolu bulunamadı (HTTP 404). Secret KBS_CORE_URL = https://kbs-core-production.up.railway.app olmalı.",
    };
  }

  if (status === 502 || status === 503 || status === 504) {
    return {
      code: "UPSTREAM",
      message: `KBS core geçici olarak yanıt vermiyor (HTTP ${status}). Railway kbs-core deploy loglarına bakın.`,
    };
  }

  if (status >= 500) {
    return {
      code: "UPSTREAM",
      message: enrichIpHint(bodyMessage || `KBS core sunucu hatası (HTTP ${status}).`),
    };
  }

  return {
    code: "KBS",
    message: enrichIpHint(bodyMessage || `KBS hatası (HTTP ${status}).`),
  };
}

/**
 * @param hotelId ops hotel UUID (kbs_edge_get_credentials_for_test → hotel_id)
 */
export async function testKbsConnectionViaGateway(hotelId: string): Promise<KbsGatewayTestResult> {
  const base = resolveCoreBase();
  const check = validateKbsGatewayBase(base);
  const sharedSecret = (Deno.env.get("GATEWAY_SHARED_SECRET") ?? "").trim();
  const host = base ? hostOf(base) : "(empty)";
  const path = "/gateway/test-connection";

  logStep("info", {
    event: "start",
    host,
    hasCoreUrl: Boolean(base),
    hasSharedSecret: sharedSecret.length > 0,
    hotelIdLen: hotelId?.length ?? 0,
  });

  if (!hotelId || !/^[0-9a-f-]{36}$/i.test(hotelId)) {
    return {
      ok: false,
      code: "CONFIG",
      message: "Bağlantı testi için hotel_id eksik. DB migration 533 uygulayın.",
      via: "gateway_config",
    };
  }

  if (!check.ok) {
    logStep("warn", { event: "config_invalid", host, message: check.message });
    return {
      ok: false,
      code: "CONFIG",
      message:
        `${check.message} Supabase secret KBS_CORE_URL = https://kbs-core-production.up.railway.app (sonunda / yok).`,
      via: "gateway_config",
    };
  }

  if (sharedSecret.length < 16) {
    logStep("warn", { event: "missing_shared_secret", host });
    return {
      ok: false,
      code: "CONFIG",
      message:
        "Supabase secret GATEWAY_SHARED_SECRET boş veya kısa. Railway kbs-core / kbs-ops ile aynı değeri yazın.",
      via: "gateway_config",
    };
  }

  const payload = { hotelId };
  const body = JSON.stringify(payload);
  const ts = Date.now();
  const message = `${ts}.POST.${path}.${body}`;
  const signature = await hmacSha256Base64(sharedSecret, message);

  const url = `${base}${path}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 28_000);

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
      logStep("error", {
        event: "non_json",
        host,
        httpStatus: res.status,
        bodyPreview: text.slice(0, 180),
      });
      return {
        ok: false,
        code: "UPSTREAM",
        httpStatus: res.status,
        message: `KBS core geçersiz yanıt (HTTP ${res.status}, JSON değil). ${host}/gateway/health JSON dönmeli.`,
        via: "kbs_core",
      };
    }

    const err = parsed.error as { code?: string; message?: string } | undefined;
    const data = parsed.data as {
      ok?: boolean;
      message?: string;
      egressIp?: string | null;
    } | undefined;
    let egressIp =
      (typeof data?.egressIp === "string" && data.egressIp) ||
      (typeof (parsed as { egressIp?: string }).egressIp === "string"
        ? (parsed as { egressIp?: string }).egressIp
        : null) ||
      null;
    if (!egressIp) {
      egressIp = await detectEgressViaOps();
    }
    const bodyMessage =
      (typeof err?.message === "string" && err.message) ||
      (typeof data?.message === "string" && data.message) ||
      (typeof parsed.message === "string" && parsed.message) ||
      "";
    const bodyCode = typeof err?.code === "string" ? err.code : undefined;

    // Gateway envelope: { ok: true, data: { ok, message, egressIp } }
    if (parsed.ok === true) {
      const innerOk = data?.ok !== false;
      const msg =
        (typeof data?.message === "string" && data.message) ||
        (innerOk ? "KBS bağlantısı başarılı." : "KBS bağlantı testi başarısız.");
      if (!innerOk) {
        logStep("warn", {
          event: "kbs_rejected",
          host,
          httpStatus: res.status,
          egressIp,
          msg: msg.slice(0, 200),
        });
        return {
          ok: false,
          message: enrichIpHint(msg, egressIp),
          code: "KBS",
          httpStatus: res.status,
          via: "kbs_core",
          egressIp,
        };
      }
      logStep("info", { event: "ok", host, httpStatus: res.status, egressIp });
      return {
        ok: true,
        message: msg,
        via: "kbs_core",
        httpStatus: res.status,
        code: "OK",
        egressIp,
      };
    }

    const mapped = mapFailure({
      status: res.status,
      bodyCode,
      bodyMessage: bodyMessage || `KBS core hatası (HTTP ${res.status})`,
    });

    logStep("warn", {
      event: "rejected",
      host,
      httpStatus: res.status,
      bodyCode: bodyCode ?? null,
      mappedCode: mapped.code,
      bodyMessage: bodyMessage.slice(0, 200),
    });

    return {
      ok: false,
      message: enrichIpHint(mapped.message, egressIp),
      code: mapped.code,
      httpStatus: res.status,
      via: "kbs_core",
      egressIp,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort/i.test(msg)) {
      logStep("error", { event: "timeout", host });
      return {
        ok: false,
        code: "TIMEOUT",
        message:
          "KBS core yanıt vermedi (28 sn). Railway kbs-core ayakta mı? /gateway/health — KBS_CORE_URL doğru mu?",
        via: "kbs_core",
      };
    }
    logStep("error", { event: "network", host, error: msg.slice(0, 200) });
    return {
      ok: false,
      code: "UPSTREAM",
      message: enrichIpHint(`KBS core erişim hatası: ${msg}`),
      via: "kbs_core",
    };
  } finally {
    clearTimeout(t);
  }
}
