/**
 * KBS bağlantı testi — Edge → Railway kbs-ops → kbs-core → Jandarma.
 * HTTP / error.code’a göre mesaj üretir; Edge log’a durum özeti basar.
 */

import { normalizeGatewayBase, validateKbsGatewayBase } from "./kbsGatewayUrl.ts";

export type KbsGatewayTestResult = {
  ok: boolean;
  message: string;
  via: string;
  /** HTTP status from Railway ops (if reached). */
  httpStatus?: number;
  /** Machine code for UI hints: AUTH | GATEWAY_TOKEN | CONFIG | TIMEOUT | UPSTREAM | KBS */
  code?: string;
};

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(invalid-url)";
  }
}

function enrichIpHint(message: string): string {
  if (!/yetkisiz|unauthorized|ip|forbidden|jandarma/i.test(message)) return message;
  return (
    `${message} ` +
    "Jandarma isteği Railway kbs-core çıkış IP’sinden gider; panelde o IP kayıtlı olmalı. " +
    "Supabase Edge doğrudan Jandarma’ya bağlanmaz."
  );
}

function logStep(level: "info" | "warn" | "error", payload: Record<string, unknown>) {
  const line = JSON.stringify({ scope: "kbs_connection_test", ts: new Date().toISOString(), ...payload });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function mapByStatus(args: {
  status: number;
  bodyCode?: string;
  bodyMessage: string;
}): Pick<KbsGatewayTestResult, "message" | "code"> {
  const { status, bodyCode, bodyMessage } = args;
  const lower = `${bodyCode ?? ""} ${bodyMessage}`.toLowerCase();

  // Token mismatch → 403 FORBIDDEN + gateway token text
  if (
    status === 403 ||
    bodyCode === "FORBIDDEN" ||
    /gateway token|invalid or missing gateway/i.test(bodyMessage)
  ) {
    return {
      code: "GATEWAY_TOKEN",
      message:
        "KBS köprü token reddetti (HTTP 403). Supabase secret KBS_GATEWAY_TOKEN ile Railway kbs-ops Variables birebir aynı olmalı; ardından Edge redeploy / ops restart.",
    };
  }

  // Session / JWT → 401
  if (status === 401 || bodyCode === "UNAUTHORIZED" || /invalid token|missing bearer|user not provisioned/i.test(lower)) {
    return {
      code: "AUTH",
      message:
        "KBS köprü oturum reddetti (HTTP 401). Çıkış yapıp yeniden giriş edin; ops.app_users kaydınız aktif olmalı.",
    };
  }

  if (status === 404) {
    return {
      code: "UPSTREAM",
      message:
        "KBS köprü yolu bulunamadı (HTTP 404). KBS_GATEWAY_URL = https://kbs-ops-production.up.railway.app olmalı; Root Directory railway-service.",
    };
  }

  if (status === 502 || status === 503 || status === 504) {
    return {
      code: "UPSTREAM",
      message: `KBS köprü geçici olarak yanıt vermiyor (HTTP ${status}). Railway kbs-ops / kbs-core deploy loglarına bakın.`,
    };
  }

  if (status >= 500) {
    return {
      code: "UPSTREAM",
      message: enrichIpHint(bodyMessage || `KBS köprü sunucu hatası (HTTP ${status}).`),
    };
  }

  return {
    code: "KBS",
    message: enrichIpHint(bodyMessage || `KBS köprü hatası (HTTP ${status}).`),
  };
}

export async function testKbsConnectionViaGateway(userJwt: string): Promise<KbsGatewayTestResult> {
  const raw = Deno.env.get("KBS_GATEWAY_URL") ?? Deno.env.get("OPS_VPS_URL") ?? "";
  const base = normalizeGatewayBase(raw);
  const check = validateKbsGatewayBase(base);
  const gatewayToken = (Deno.env.get("KBS_GATEWAY_TOKEN") ?? "").trim();
  const host = base ? hostOf(base) : "(empty)";

  logStep("info", {
    event: "start",
    host,
    hasGatewayUrl: Boolean(base),
    hasGatewayToken: gatewayToken.length > 0,
    gatewayTokenLen: gatewayToken.length,
    jwtLen: userJwt?.length ?? 0,
  });

  if (!check.ok) {
    logStep("warn", { event: "config_invalid", host, message: check.message });
    return {
      ok: false,
      code: "CONFIG",
      message: `${check.message} Supabase secret KBS_GATEWAY_URL = Railway kbs-ops HTTPS URL olmalı (sonunda / yok).`,
      via: "gateway_config",
    };
  }

  if (!gatewayToken) {
    logStep("warn", { event: "missing_token", host });
    return {
      ok: false,
      code: "GATEWAY_TOKEN",
      message:
        "Supabase secret KBS_GATEWAY_TOKEN boş. Railway kbs-ops Variables’daki ile aynı değeri yazıp Edge’i güncelleyin.",
      via: "gateway_config",
    };
  }

  const url = `${base}/admin/kbs-settings/test-connection`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 28_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userJwt}`,
        "Content-Type": "application/json",
        "x-kbs-gateway-token": gatewayToken,
      },
      body: "{}",
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
        message: `KBS köprü geçersiz yanıt (HTTP ${res.status}, JSON değil). ${host} /health JSON dönmeli.`,
        via: "railway_gateway",
      };
    }

    const err = parsed.error as { code?: string; message?: string } | undefined;
    const data = parsed.data as { message?: string } | undefined;
    const bodyMessage =
      (typeof err?.message === "string" && err.message) ||
      (typeof data?.message === "string" && data.message) ||
      (typeof parsed.message === "string" && parsed.message) ||
      "";
    const bodyCode = typeof err?.code === "string" ? err.code : undefined;

    if (parsed.ok === true) {
      const msg =
        (typeof data?.message === "string" && data.message) ||
        "KBS bağlantısı başarılı (Railway köprüsü üzerinden).";
      logStep("info", { event: "ok", host, httpStatus: res.status, bodyCode });
      return { ok: true, message: msg, via: "railway_gateway", httpStatus: res.status, code: "OK" };
    }

    // HTTP 200 but ok:false (biznes hatası) — yine map
    const mapped = mapByStatus({
      status: res.ok ? (bodyCode === "FORBIDDEN" ? 403 : bodyCode === "UNAUTHORIZED" ? 401 : res.status) : res.status,
      bodyCode,
      bodyMessage: bodyMessage || `KBS köprü hatası (HTTP ${res.status})`,
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
      message: mapped.message,
      code: mapped.code,
      httpStatus: res.status,
      via: "railway_gateway",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort/i.test(msg)) {
      logStep("error", { event: "timeout", host });
      return {
        ok: false,
        code: "TIMEOUT",
        message:
          "KBS köprü yanıt vermedi (28 sn). Railway kbs-ops ayakta mı? /health — Supabase KBS_GATEWAY_URL doğru mu?",
        via: "railway_gateway",
      };
    }
    logStep("error", { event: "network", host, error: msg.slice(0, 200) });
    return {
      ok: false,
      code: "UPSTREAM",
      message: enrichIpHint(`KBS köprü erişim hatası: ${msg}`),
      via: "railway_gateway",
    };
  } finally {
    clearTimeout(t);
  }
}
