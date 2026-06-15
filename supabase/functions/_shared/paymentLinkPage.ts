/** Valoria Hotel — ödeme linki / QR önizleme (OG) + güvenli yönlendirme */

export const PAYMENT_BRAND_NAME = "Valoria Hotel";
export const PAYMENT_BRAND_TAGLINE = "Güvenli ödeme";
export const PUBLIC_PAYMENT_PATH = "odeme";
export const PUBLIC_PAYMENT_QR_PATH = "odeme/qr";

const PREVIEW_BOT =
  /facebookexternalhit|whatsapp|telegrambot|twitterbot|linkedinbot|slackbot|discordbot|applebot|googlebot|bingpreview|embedly|preview|facebot|ia_archiver/i;

export function isLinkPreviewBot(userAgent: string): boolean {
  return PREVIEW_BOT.test(userAgent);
}

export function paymentFunctionsBase(): string {
  const base = Deno.env.get("SUPABASE_URL")?.trim().replace(/\/$/, "");
  if (!base) throw new Error("SUPABASE_URL yapılandırılmamış");
  return `${base}/functions/v1`;
}

/** Canlı site köprüsü — örn. https://valoria.tr (Supabase URL yerine paylaşımda görünür) */
export function paymentPublicBase(): string | null {
  const custom = Deno.env.get("PAYMENT_PUBLIC_BASE_URL")?.trim().replace(/\/$/, "");
  if (custom) return custom;
  const appUrl = Deno.env.get("APP_PUBLIC_BASE_URL")?.trim().replace(/\/$/, "");
  return appUrl || null;
}

export function paymentRequestOpenUrl(publicToken: string): string {
  const q = `t=${encodeURIComponent(publicToken)}`;
  const pub = paymentPublicBase();
  if (pub) return `${pub}/${PUBLIC_PAYMENT_PATH}?${q}`;
  return `${paymentFunctionsBase()}/open-payment?${q}`;
}

export function paymentQrStandOpenUrl(publicToken: string): string {
  const q = `t=${encodeURIComponent(publicToken)}`;
  const pub = paymentPublicBase();
  if (pub) return `${pub}/${PUBLIC_PAYMENT_QR_PATH}?${q}`;
  return `${paymentFunctionsBase()}/open-payment-qr?${q}`;
}

type OrgBrand = { name?: string | null; finance_report_brand?: string | null } | null | undefined;

/** İşletme adı / rapor markası — WhatsApp önizlemesinde görünür */
export function resolvePaymentBrandName(org?: OrgBrand): string {
  const brand = org?.finance_report_brand?.trim() || org?.name?.trim();
  return brand || PAYMENT_BRAND_NAME;
}

export function paymentBrandOgImage(): string | null {
  const url = Deno.env.get("PAYMENT_BRAND_OG_IMAGE_URL")?.trim();
  return url || null;
}

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, (ch) => {
      const cp = ch.codePointAt(0);
      return cp != null ? `&#${cp};` : "";
    });
}

export function formatAmountLabel(amount: number, currency: string): string {
  const c = currency.toLowerCase();
  const sym = c === "try" ? "₺" : c === "usd" ? "$" : c === "eur" ? "€" : c.toUpperCase();
  return `${Number(amount).toFixed(2)} ${sym}`.trim();
}

type LandingOpts = {
  pageUrl: string;
  ogTitle: string;
  ogDescription: string;
  headline?: string;
  amountLabel?: string;
  subtitle?: string;
  redirectUrl?: string | null;
  variant?: "redirect" | "info" | "error" | "closed" | "paid";
  brandName?: string;
};

export function paymentLandingHtml(opts: LandingOpts): string {
  const title = escapeHtml(opts.ogTitle);
  const desc = escapeHtml(opts.ogDescription);
  const pageUrl = escapeHtml(opts.pageUrl);
  const amount = opts.amountLabel ? escapeHtml(opts.amountLabel) : "";
  const headline = escapeHtml(opts.headline ?? opts.ogTitle.replace(/^Valoria Hotel — /, ""));
  const subtitle = escapeHtml(opts.subtitle ?? PAYMENT_BRAND_TAGLINE);
  const redirect = opts.redirectUrl?.trim() || "";
  const variant = opts.variant ?? (redirect ? "redirect" : "info");
  const brandName = escapeHtml(opts.brandName?.trim() || PAYMENT_BRAND_NAME);
  const ogImage = paymentBrandOgImage();
  const ogImageTag = ogImage
    ? `<meta property="og:image" content="${escapeHtml(ogImage)}"/><meta name="twitter:image" content="${escapeHtml(ogImage)}"/>`
    : "";

  const redirectMeta = redirect
    ? `<meta http-equiv="refresh" content="0;url=${escapeHtml(redirect)}"/>`
    : "";
  const redirectScript = redirect
    ? `<script>try{window.location.replace(${JSON.stringify(redirect)});}catch(e){window.location.href=${JSON.stringify(redirect)};}</script>`
    : "";

  const bodyMain =
    variant === "paid"
      ? `<p class="badge ok">${escapeHtml("Ödeme tamamlandı")}</p><p class="msg">${escapeHtml("Teşekkür ederiz. Bu bağlantı artık ödeme için kullanılamaz.")}</p>`
      : variant === "closed"
        ? `<p class="badge warn">${escapeHtml("QR kapatıldı")}</p><p class="msg">${escapeHtml("Bu ödeme noktası artık aktif değil. Lütfen resepsiyona başvurun.")}</p>`
        : variant === "error"
          ? `<p class="badge err">${escapeHtml("Bağlantı geçersiz")}</p><p class="msg">${desc}</p>`
          : redirect
            ? `<p class="badge">${escapeHtml("Yönlendiriliyorsunuz")}</p><p class="msg">${escapeHtml("Güvenli ödeme sayfası açılıyor…")}</p><a class="btn" href="${escapeHtml(redirect)}">${escapeHtml("Ödemeye devam et")}</a>`
            : `<p class="msg">${desc}</p>`;

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>${title}</title>
<meta name="description" content="${desc}"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="${brandName}"/>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${desc}"/>
<meta property="og:url" content="${pageUrl}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${title}"/>
<meta name="twitter:description" content="${desc}"/>
${ogImageTag}
${redirectMeta}
<link rel="canonical" href="${pageUrl}"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;600;700;800&display=swap');
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;font-family:'DM Sans',system-ui,sans-serif;background:linear-gradient(165deg,#0f172a 0%,#1e3a5f 42%,#0f172a 100%);color:#e2e8f0;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{max-width:420px;width:100%;background:#fff;border-radius:24px;padding:28px 24px 24px;box-shadow:0 24px 60px rgba(15,23,42,.35);color:#0f172a;text-align:center}
  .brand{font-size:11px;font-weight:800;letter-spacing:.14em;color:#635bff;text-transform:uppercase}
  h1{font-size:22px;font-weight:800;margin:8px 0 4px;letter-spacing:-.02em;color:#0f172a}
  .sub{font-size:13px;color:#64748b;margin:0 0 16px;line-height:1.45}
  .amount{font-size:32px;font-weight:900;color:#635bff;margin:4px 0 12px}
  .badge{display:inline-block;font-size:12px;font-weight:800;padding:6px 12px;border-radius:999px;background:#eef2ff;color:#4338ca;margin-bottom:10px}
  .badge.ok{background:#dcfce7;color:#166534}
  .badge.warn{background:#fef3c7;color:#b45309}
  .badge.err{background:#fee2e2;color:#b91c1c}
  .msg{font-size:14px;color:#475569;line-height:1.5;margin:0 0 16px}
  .btn{display:inline-block;margin-top:8px;padding:14px 22px;border-radius:14px;background:linear-gradient(135deg,#635bff,#4f46e5);color:#fff!important;font-weight:800;font-size:15px;text-decoration:none}
  .foot{margin-top:20px;font-size:11px;color:#94a3b8}
  .spinner{width:28px;height:28px;border:3px solid #e2e8f0;border-top-color:#635bff;border-radius:50%;animation:spin .8s linear infinite;margin:12px auto}
  @keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
  <div class="card">
    <div class="brand">${brandName}</div>
    <h1>${headline}</h1>
    <p class="sub">${subtitle}</p>
    ${amount ? `<div class="amount">${amount}</div>` : ""}
    ${redirect ? `<div class="spinner" aria-hidden="true"></div>` : ""}
    ${bodyMain}
    <p class="foot">${brandName} ${escapeHtml("·")} ${escapeHtml("Kart bilgileriniz Stripe ile korunur")}</p>
  </div>
${redirectScript}
</body>
</html>`;
}

export function htmlResponse(html: string, status = 200): Response {
  const bytes = new TextEncoder().encode(html);
  return new Response(bytes, {
    status,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Supabase ara katmanı HTML'i text/plain gösterebiliyor — gerçek kullanıcıya 302 ile Stripe'a git. */
export function redirectResponse(targetUrl: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: {
      Location: targetUrl,
      "Cache-Control": "no-store",
    },
  });
}

export function stripeProductName(title: string, org?: OrgBrand): string {
  const brand = resolvePaymentBrandName(org);
  const t = title.trim().slice(0, 100);
  return t ? `${brand} — ${t}` : brand;
}
