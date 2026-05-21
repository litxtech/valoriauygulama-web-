/**
 * Mobil → Supabase Edge → Railway KBS ops API (railway-service).
 *
 * Secrets:
 * - KBS_GATEWAY_URL = https://<kbs-ops>.up.railway.app (sonunda / yok)
 * - KBS_GATEWAY_TOKEN = Railway kbs-ops ile aynı
 *
 * Kurulum: deploy/RAILWAY_KURULUM.md
 */

import { normalizeGatewayBase, validateKbsGatewayBase } from "../_shared/kbsGatewayUrl.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kbs-gateway-token",
};

type ProxyBody = {
  method?: string;
  path?: string;
  payload?: unknown;
};

function gatewayBase(): string {
  const raw = Deno.env.get("KBS_GATEWAY_URL") ?? Deno.env.get("OPS_VPS_URL") ?? "";
  return normalizeGatewayBase(raw);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const vpsBase = gatewayBase();
  const gatewayCheck = validateKbsGatewayBase(vpsBase);
  if (!gatewayCheck.ok) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "CONFIG",
          message: gatewayCheck.message,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Upstream-Status": "0" } }
    );
  }

  try {
    const meta = (await req.json().catch(() => ({}))) as ProxyBody;
    const method = (meta.method ?? "POST").toUpperCase();
    // Boşluk / satır sonu path’ten sızarsa (ör. JSON kopya hatası) geçerli URL üretmek için temizle
    const path =
      typeof meta.path === "string" ? meta.path.replace(/[\s\u00a0]+/g, "") : "/";
    if (!path.startsWith("/")) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: "BAD_REQUEST", message: "path must start with /" } }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Upstream-Status": "0" } }
      );
    }

    const auth = req.headers.get("Authorization") ?? "";
    const url = `${vpsBase}${path}`;
    const gatewayToken = (Deno.env.get("KBS_GATEWAY_TOKEN") ?? "").trim();

    const headers: Record<string, string> = {
      Authorization: auth,
      "Content-Type": "application/json",
    };
    if (gatewayToken) {
      headers["x-kbs-gateway-token"] = gatewayToken;
    }

    const upstream = await fetch(url, {
      method: method === "GET" ? "GET" : "POST",
      headers,
      body: method === "GET" ? undefined : JSON.stringify(meta.payload ?? {}),
    });

    const text = await upstream.text();
    const ct = upstream.headers.get("content-type") ?? "application/json";
    return new Response(text, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": ct,
        "X-Upstream-Status": String(upstream.status),
      },
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const msg = /failed to lookup|name or service not known|ENOTFOUND/i.test(raw)
      ? `KBS sunucusuna DNS ile ulaşılamadı (${vpsBase}). Supabase secret KBS_GATEWAY_URL gerçek VPS IP olmalı (örnek metin senin_sunucu_ip kullanılamaz). VPS: curl http://127.0.0.1:4000/health — Detay: ${raw}`
      : raw;
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: "PROXY_ERROR", message: msg },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Upstream-Status": "0" } }
    );
  }
});
