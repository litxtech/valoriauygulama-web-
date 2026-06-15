// Sabit QR — Valoria önizleme; misafirde arka planda Stripe Checkout
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  defaultPaymentCurrency,
  getStripe,
  paymentCancelUrl,
  paymentSuccessUrl,
  toStripeMinorUnits,
} from "../_shared/stripeClient.ts";
import {
  formatAmountLabel,
  htmlResponse,
  isLinkPreviewBot,
  paymentLandingHtml,
  paymentQrStandOpenUrl,
  PAYMENT_BRAND_NAME,
  redirectResponse,
  resolvePaymentBrandName,
  stripeProductName,
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
  const pageUrl = publicToken ? paymentQrStandOpenUrl(publicToken) : paymentQrStandOpenUrl("");
  const ua = req.headers.get("user-agent") ?? "";

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

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: stand } = await admin
    .from("payment_qr_stands")
    .select(
      "id, organization_id, amount, currency, title, description, service_kind, status, public_token, organizations(name, finance_report_brand)"
    )
    .eq("public_token", publicToken)
    .maybeSingle();

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
  const amount = Number(stand.amount);
  const currency = (stand.currency ?? defaultPaymentCurrency()).toLowerCase();
  const title = String(stand.title);
  const amountLabel = formatAmountLabel(amount, currency);
  const ogTitle = `${brandName} — ${title}`;
  const ogDescription =
    (stand.description as string | null)?.trim() ||
    `Sabit QR · ${amountLabel} · Güvenli ödeme`;
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

  const serviceKind = String(stand.service_kind ?? "generic");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const { data: paymentRow, error: payErr } = await admin
    .from("payment_requests")
    .insert({
      organization_id: stand.organization_id,
      amount: Math.round(amount * 100) / 100,
      currency,
      title,
      description: stand.description,
      service_kind: serviceKind,
      reference_type: "qr_stand",
      reference_id: stand.id,
      created_by_staff_id: null,
      metadata: {
        qr_stand_id: stand.id,
        qr_stand_token: stand.public_token,
        qr_mode: "standing",
      },
      expires_at: expiresAt,
      status: "pending",
      provider: "stripe",
    })
    .select("id, public_token")
    .single();

  if (payErr || !paymentRow?.id) {
    return htmlResponse(
      paymentLandingHtml({
        ...landingBase,
        ogDescription: payErr?.message ?? "Ödeme başlatılamadı",
        variant: "error",
      }),
      500
    );
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: paymentSuccessUrl(paymentRow.id, paymentRow.public_token),
      cancel_url: paymentCancelUrl(paymentRow.id, paymentRow.public_token),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: toStripeMinorUnits(amount, currency),
            product_data: {
              name: stripeProductName(title, org),
              description: (stand.description ?? serviceKind).slice(0, 500),
            },
          },
        },
      ],
      metadata: {
        payment_request_id: paymentRow.id,
        organization_id: stand.organization_id,
        service_kind: serviceKind,
        qr_stand_id: stand.id,
        public_token: paymentRow.public_token,
      },
      expires_at: Math.floor(new Date(expiresAt).getTime() / 1000),
    });

    const payUrl = session.url;
    if (!payUrl) {
      await admin.from("payment_requests").update({ status: "failed" }).eq("id", paymentRow.id);
      return htmlResponse(
        paymentLandingHtml({
          ...landingBase,
          ogDescription: "Stripe oturumu oluşturulamadı",
          variant: "error",
        }),
        500
      );
    }

    await admin
      .from("payment_requests")
      .update({ provider_session_id: session.id, pay_url: payUrl })
      .eq("id", paymentRow.id);

    if (isLinkPreviewBot(ua)) {
      return htmlResponse(
        paymentLandingHtml({
          ...landingBase,
          headline: title,
          variant: "info",
        })
      );
    }

    return redirectResponse(payUrl);
  } catch (e) {
    await admin.from("payment_requests").update({ status: "failed" }).eq("id", paymentRow.id);
    const msg = e instanceof Error ? e.message : String(e);
    return htmlResponse(
      paymentLandingHtml({
        ...landingBase,
        ogDescription: msg,
        variant: "error",
      }),
      500
    );
  }
});
