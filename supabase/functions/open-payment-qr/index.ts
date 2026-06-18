// Sabit QR — Valoria önizleme; misafirde arka planda Stripe Checkout
// Serbest tutar modunda müşteri önce tutar girer, sonra Stripe'a yönlendirilir
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  defaultPaymentCurrency,
} from "../_shared/stripeClient.ts";
import {
  createQrStandCheckout,
  parseQrPaymentAmount,
  QR_VARIABLE_MAX_AMOUNT,
  QR_VARIABLE_MIN_AMOUNT,
} from "../_shared/paymentQrCheckout.ts";
import {
  formatAmountLabel,
  htmlResponse,
  isLinkPreviewBot,
  paymentLandingHtml,
  paymentQrStandOpenUrl,
  paymentQrStandPostUrl,
  PAYMENT_BRAND_NAME,
  paymentVariableAmountFormHtml,
  redirectResponse,
  resolvePaymentBrandName,
} from "../_shared/paymentLinkPage.ts";

async function loadStand(admin: ReturnType<typeof createClient>, publicToken: string) {
  const { data, error } = await admin
    .from("payment_qr_stands")
    .select(
      "id, organization_id, amount, amount_mode, currency, title, description, service_kind, status, public_token, created_by_staff_id, organizations(name, finance_report_brand)"
    )
    .eq("public_token", publicToken)
    .maybeSingle();

  if (error) return { stand: null, loadError: error.message };
  return { stand: data, loadError: null as string | null };
}

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
  const ua = req.headers.get("user-agent") ?? "";
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let publicToken = (url.searchParams.get("t") ?? url.searchParams.get("token") ?? "").trim();
  let postedAmount: unknown = null;

  if (req.method === "POST") {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        const body = await req.json() as { t?: string; token?: string; amount?: unknown };
        publicToken = (body.t ?? body.token ?? publicToken).trim();
        postedAmount = body.amount;
      } catch {
        return htmlResponse(
          paymentLandingHtml({
            pageUrl: paymentQrStandOpenUrl(""),
            ogTitle: `${PAYMENT_BRAND_NAME} — Ödeme QR`,
            ogDescription: "Geçersiz istek.",
            variant: "error",
          }),
          400
        );
      }
    } else {
      const form = await req.formData();
      publicToken = String(form.get("t") ?? form.get("token") ?? publicToken).trim();
      postedAmount = form.get("amount");
    }
  }

  const pageUrl = publicToken ? paymentQrStandOpenUrl(publicToken) : paymentQrStandOpenUrl("");

  if (!publicToken) {
    return htmlResponse(
      paymentLandingHtml({
        pageUrl,
        ogTitle: `${PAYMENT_BRAND_NAME} — Ödeme QR`,
        ogDescription: "QR bağlantısı eksik.",
        variant: "error",
      }),
      400
    );
  }

  const { stand, loadError } = await loadStand(admin, publicToken);

  if (loadError) {
    return htmlResponse(
      paymentLandingHtml({
        pageUrl,
        ogTitle: `${PAYMENT_BRAND_NAME} — Ödeme QR`,
        ogDescription: "Ödeme servisi geçici olarak kullanılamıyor. Lütfen tekrar deneyin.",
        variant: "error",
      }),
      503
    );
  }

  if (!stand?.id) {
    return htmlResponse(
      paymentLandingHtml({
        pageUrl,
        ogTitle: `${PAYMENT_BRAND_NAME} — Ödeme QR`,
        ogDescription: "Bu ödeme kodu geçersiz.",
        variant: "error",
      }),
      404
    );
  }

  const org = stand.organizations as { name?: string; finance_report_brand?: string } | null;
  const brandName = resolvePaymentBrandName(org);
  const currency = (stand.currency ?? defaultPaymentCurrency()).toLowerCase();
  const title = String(stand.title);
  const isVariable = stand.amount_mode === "variable";
  const fixedAmount = stand.amount != null ? Number(stand.amount) : null;
  const amountLabel = fixedAmount != null ? formatAmountLabel(fixedAmount, currency) : undefined;
  const ogTitle = `${brandName} — ${title}`;
  const ogDescription =
    (stand.description as string | null)?.trim() ||
    (isVariable ? "Serbest tutar · Güvenli ödeme" : `Sabit QR · ${amountLabel} · Güvenli ödeme`);
  const landingBase = { pageUrl, ogTitle, ogDescription, amountLabel, brandName };

  if (stand.status !== "active") {
    return htmlResponse(
      paymentLandingHtml({
        ...landingBase,
        ogDescription: "Bu ödeme QR kodu kapatıldı.",
        headline: title,
        variant: "closed",
      }),
      410
    );
  }

  if (isVariable) {
    const postUrl = paymentQrStandPostUrl();

    if (req.method === "POST") {
      const amount = parseQrPaymentAmount(postedAmount);
      if (amount == null) {
        return htmlResponse(
          paymentVariableAmountFormHtml({
            pageUrl,
            postUrl,
            publicToken,
            ogTitle,
            ogDescription,
            headline: title,
            subtitle: "Ödeme tutarını girin",
            brandName,
            currency,
            minAmount: QR_VARIABLE_MIN_AMOUNT,
            maxAmount: QR_VARIABLE_MAX_AMOUNT,
            errorMessage: `Geçerli bir tutar girin (${QR_VARIABLE_MIN_AMOUNT} – ${QR_VARIABLE_MAX_AMOUNT.toLocaleString("tr-TR")} ${currency.toUpperCase()}).`,
          }),
          400
        );
      }

      const result = await createQrStandCheckout(admin, stand, amount);
      if ("error" in result) {
        return htmlResponse(
          paymentVariableAmountFormHtml({
            pageUrl,
            postUrl,
            publicToken,
            ogTitle,
            ogDescription,
            headline: title,
            brandName,
            currency,
            minAmount: QR_VARIABLE_MIN_AMOUNT,
            maxAmount: QR_VARIABLE_MAX_AMOUNT,
            errorMessage: result.error,
          }),
          500
        );
      }

      return redirectResponse(result.payUrl);
    }

    if (isLinkPreviewBot(ua)) {
      return htmlResponse(
        paymentLandingHtml({
          ...landingBase,
          headline: title,
          subtitle: `Serbest tutar · ${brandName}`,
          variant: "info",
        })
      );
    }

    return htmlResponse(
      paymentVariableAmountFormHtml({
        pageUrl,
        postUrl,
        publicToken,
        ogTitle,
        ogDescription,
        headline: title,
        subtitle: stand.description?.trim() || "Ödeme tutarını girin",
        brandName,
        currency,
        minAmount: QR_VARIABLE_MIN_AMOUNT,
        maxAmount: QR_VARIABLE_MAX_AMOUNT,
      })
    );
  }

  if (fixedAmount == null || !Number.isFinite(fixedAmount) || fixedAmount <= 0) {
    return htmlResponse(
      paymentLandingHtml({
        ...landingBase,
        ogDescription: "Bu QR için tutar tanımlı değil.",
        variant: "error",
      }),
      500
    );
  }

  if (isLinkPreviewBot(ua)) {
    return htmlResponse(
      paymentLandingHtml({
        ...landingBase,
        headline: title,
        subtitle: `QR ile ödeme · ${brandName}`,
        variant: "info",
      })
    );
  }

  const result = await createQrStandCheckout(admin, stand, fixedAmount);
  if ("error" in result) {
    return htmlResponse(
      paymentLandingHtml({
        ...landingBase,
        ogDescription: result.error,
        variant: "error",
      }),
      500
    );
  }

  return redirectResponse(result.payUrl);
});
