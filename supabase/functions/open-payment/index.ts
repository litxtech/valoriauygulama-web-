// Tek seferlik ödeme linki — Valoria önizleme + arka planda Stripe Checkout
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  formatAmountLabel,
  htmlResponse,
  isLinkPreviewBot,
  paymentLandingHtml,
  paymentRequestOpenUrl,
  PAYMENT_BRAND_NAME,
  redirectResponse,
  resolvePaymentBrandName,
} from "../_shared/paymentLinkPage.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const url = new URL(req.url);
  const publicToken = (url.searchParams.get("t") ?? url.searchParams.get("token") ?? "").trim();
  const pageUrl = publicToken ? paymentRequestOpenUrl(publicToken) : paymentRequestOpenUrl("");
  const ua = req.headers.get("user-agent") ?? "";

  if (!publicToken) {
    return htmlResponse(
      paymentLandingHtml({
        pageUrl,
        ogTitle: `${PAYMENT_BRAND_NAME} — Ödeme`,
        ogDescription: "Ödeme bağlantısı eksik.",
        variant: "error",
      }),
      400
    );
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: row } = await admin
    .from("payment_requests")
    .select(
      "id, public_token, amount, currency, title, description, status, pay_url, paid_at, expires_at, archived_at, cancelled_at, organizations(name, finance_report_brand)"
    )
    .eq("public_token", publicToken)
    .maybeSingle();

  if (!row?.id) {
    return htmlResponse(
      paymentLandingHtml({
        pageUrl,
        ogTitle: `${PAYMENT_BRAND_NAME} — Ödeme`,
        ogDescription: "Bu ödeme bağlantısı geçersiz veya süresi dolmuş.",
        variant: "error",
      }),
      404
    );
  }

  const org = row.organizations as { name?: string; finance_report_brand?: string } | null;
  const brandName = resolvePaymentBrandName(org);
  const amountLabel = formatAmountLabel(Number(row.amount), String(row.currency));
  const paymentTitle = String(row.title ?? "").trim() || "Ödeme";
  const ogTitle = `${brandName} — ${paymentTitle}`;
  const ogDescription =
    (row.description as string | null)?.trim() ||
    `${amountLabel} · Güvenli kart ödemesi`;
  const landingBase = { pageUrl, ogTitle, ogDescription, amountLabel, brandName };

  if (row.archived_at || row.cancelled_at || row.status === "cancelled") {
    return htmlResponse(
      paymentLandingHtml({
        ...landingBase,
        ogDescription: "Bu ödeme linki kapatıldı.",
        headline: paymentTitle,
        variant: "closed",
      }),
      410
    );
  }

  if (row.status === "paid") {
    return htmlResponse(
      paymentLandingHtml({
        ...landingBase,
        ogDescription: `Ödeme alındı · ${amountLabel}`,
        variant: "paid",
      })
    );
  }

  if (row.status !== "pending" || !row.pay_url) {
    return htmlResponse(
      paymentLandingHtml({
        ...landingBase,
        ogDescription: "Bu ödeme artık kullanılamıyor.",
        variant: "error",
      }),
      410
    );
  }

  if (isLinkPreviewBot(ua)) {
    return htmlResponse(
      paymentLandingHtml({
        ...landingBase,
        subtitle: paymentTitle,
        variant: "info",
      })
    );
  }

  return redirectResponse(String(row.pay_url));
});
