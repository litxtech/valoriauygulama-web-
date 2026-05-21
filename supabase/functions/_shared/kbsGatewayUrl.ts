/** Edge ops-proxy: KBS_GATEWAY_URL doğrulama (Supabase secret). */

const PLACEHOLDER_HOSTS = [
  "senin_sunucu_ip",
  "sunucu_ip",
  "your_static_ip",
  "your-server",
  "your_server",
  "example.com",
  "placeholder",
];

export function normalizeGatewayBase(raw: string): string {
  return raw.trim().replace(/\s+/g, "").replace(/\/$/, "");
}

export function validateKbsGatewayBase(base: string): { ok: true; host: string } | { ok: false; message: string } {
  if (!base) {
    return {
      ok: false,
      message:
        "KBS_GATEWAY_URL ayarlı değil. Supabase → Edge Secrets: KBS_GATEWAY_URL=https://<kbs-ops>.up.railway.app (deploy/RAILWAY_KURULUM.md)",
    };
  }

  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return {
      ok: false,
      message: `KBS_GATEWAY_URL geçersiz URL: "${base.slice(0, 80)}". Örnek: https://valoriahotel-production.up.railway.app`,
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: "KBS_GATEWAY_URL http:// veya https:// ile başlamalı." };
  }

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
    return {
      ok: false,
      message:
        "KBS_GATEWAY_URL localhost olamaz. Railway ops servisinin public HTTPS adresini yazın.",
    };
  }

  if (PLACEHOLDER_HOSTS.some((p) => host.includes(p))) {
    return {
      ok: false,
      message: `KBS_GATEWAY_URL hâlâ örnek adres (${host}). Supabase secret’ı Railway ops URL ile güncelleyin, sonra: supabase functions deploy ops-proxy`,
    };
  }

  return { ok: true, host };
}
