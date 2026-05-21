/**
 * KBS bağlantı testi — Jandarma yalnızca kayıtlı (Hetzner) çıkış IP kabul eder.
 * Supabase Edge doğrudan SOAP atmaz; Railway ops → kbs-core üzerinden test edilir.
 */

import { normalizeGatewayBase, validateKbsGatewayBase } from "./kbsGatewayUrl.ts";

function enrichIpHint(message: string): string {
  if (!/yetkisiz|unauthorized|ip/i.test(message)) return message;
  return (
    `${message} Jandarma’ya istek Hetzner sabit IP üzerinden gitmeli; Supabase Edge IP’si beyaz listede değildir. ` +
    "Supabase secret KBS_GATEWAY_URL=http://HETZNER_IP:4000 ve VPS’te pm2 ayakta olmalı; Jandarma panelinde kayıtlı IP ile sunucunun dış IP’si aynı olmalı."
  );
}

export async function testKbsConnectionViaGateway(userJwt: string): Promise<{
  ok: boolean;
  message: string;
  via: string;
}> {
  const raw = Deno.env.get("KBS_GATEWAY_URL") ?? Deno.env.get("OPS_VPS_URL") ?? "";
  const base = normalizeGatewayBase(raw);
  const check = validateKbsGatewayBase(base);
  if (!check.ok) {
    return {
      ok: false,
      message: `${check.message} Bağlantı testi için Hetzner VPS köprüsü zorunludur (Jandarma IP kısıtı).`,
      via: "gateway_config",
    };
  }

  const gatewayToken = (Deno.env.get("KBS_GATEWAY_TOKEN") ?? "").trim();
  const url = `${base}/admin/kbs-settings/test-connection`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 28_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userJwt}`,
        "Content-Type": "application/json",
        ...(gatewayToken ? { "x-kbs-gateway-token": gatewayToken } : {}),
      },
      body: "{}",
      signal: controller.signal,
    });

    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return {
        ok: false,
        message: enrichIpHint(
          `KBS köprü geçersiz yanıt (HTTP ${res.status}). VPS /health ve KBS_GATEWAY_TOKEN kontrol edin.`
        ),
        via: "hetzner_gateway",
      };
    }

    if (parsed.ok === true) {
      const data = parsed.data as { message?: string } | undefined;
      const msg =
        (typeof data?.message === "string" && data.message) ||
        "KBS bağlantısı başarılı (Hetzner sabit IP üzerinden).";
      return { ok: true, message: msg, via: "hetzner_gateway" };
    }

    const err = parsed.error as { message?: string } | undefined;
    const data = parsed.data as { message?: string } | undefined;
    const rawMsg =
      (typeof err?.message === "string" && err.message) ||
      (typeof data?.message === "string" && data.message) ||
      (typeof parsed.message === "string" && parsed.message) ||
      `KBS köprü hatası (HTTP ${res.status})`;

    if (!res.ok && res.status === 401) {
      return {
        ok: false,
        message:
          "KBS köprü oturum reddetti. KBS_GATEWAY_TOKEN Supabase secret ile VPS .env aynı mı? Admin oturumu geçerli mi?",
        via: "hetzner_gateway",
      };
    }

    return { ok: false, message: enrichIpHint(rawMsg), via: "hetzner_gateway" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort/i.test(msg)) {
      return {
        ok: false,
        message:
          "KBS köprü yanıt vermedi (28 sn). Railway kbs-ops ayakta mı? /health — Supabase KBS_GATEWAY_URL doğru mu?",
        via: "hetzner_gateway",
      };
    }
    return {
      ok: false,
      message: enrichIpHint(`KBS köprü erişim hatası: ${msg}`),
      via: "hetzner_gateway",
    };
  } finally {
    clearTimeout(t);
  }
}
