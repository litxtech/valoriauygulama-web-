// Public QR menu — Stripe ödeme dönüşünde webhook yedek doğrulama
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripe } from "../_shared/stripeClient.ts";
import { processPaymentRequestPaid } from "../_shared/processPaymentRequestPaid.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  payment_request_id?: string;
  public_token?: string;
  org_slug?: string;
  order_id?: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed", error_code: "METHOD" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Invalid JSON", error_code: "INVALID_JSON" }, 400);
  }

  const paymentRequestId = (body.payment_request_id ?? "").trim();
  const publicToken = (body.public_token ?? "").trim();
  const orgSlug = (body.org_slug ?? "").trim().toLowerCase();
  const orderIdInput = (body.order_id ?? "").trim();

  if (!paymentRequestId || !publicToken) {
    return json({ error: "Ödeme bilgisi eksik", error_code: "MISSING_PARAMS" }, 400);
  }

  const { data: payRow } = await admin
    .from("payment_requests")
    .select(
      "id, status, public_token, reference_type, reference_id, provider_session_id, provider_payment_intent_id, metadata"
    )
    .eq("id", paymentRequestId)
    .maybeSingle();

  if (!payRow?.id || payRow.public_token !== publicToken) {
    return json({ error: "Ödeme kaydı bulunamadı", error_code: "NOT_FOUND" }, 404);
  }

  if (payRow.reference_type !== "kitchen_menu_order" || !payRow.reference_id) {
    return json({ error: "Menü siparişi değil", error_code: "NOT_KITCHEN_MENU" }, 400);
  }

  const orderId = payRow.reference_id as string;
  if (orderIdInput && orderIdInput !== orderId) {
    return json({ error: "Sipariş eşleşmiyor", error_code: "ORDER_MISMATCH" }, 400);
  }

  const meta =
    typeof payRow.metadata === "object" && payRow.metadata != null && !Array.isArray(payRow.metadata)
      ? (payRow.metadata as Record<string, unknown>)
      : {};
  const metaSlug = typeof meta.org_slug === "string" ? meta.org_slug.trim().toLowerCase() : "";

  if (orgSlug && metaSlug && orgSlug !== metaSlug) {
    return json({ error: "Menü eşleşmiyor", error_code: "SLUG_MISMATCH" }, 400);
  }

  const { data: orderRow } = await admin
    .from("kitchen_menu_orders")
    .select("id, status, org_slug")
    .eq("id", orderId)
    .maybeSingle();

  if (!orderRow?.id) {
    return json({ error: "Sipariş bulunamadı", error_code: "ORDER_NOT_FOUND" }, 404);
  }

  if (orgSlug && orderRow.org_slug && orgSlug !== String(orderRow.org_slug).trim().toLowerCase()) {
    return json({ error: "Menü eşleşmiyor", error_code: "SLUG_MISMATCH" }, 400);
  }

  if (payRow.status === "paid" && orderRow.status === "paid") {
    return json({ ok: true, order_id: orderId, status: "paid", skipped: "already_confirmed" });
  }

  try {
    const stripe = getStripe();
    let paymentIntentId = (payRow.provider_payment_intent_id as string | null)?.trim() || null;

    if (payRow.status !== "paid") {
      const sessionId = payRow.provider_session_id as string | null;
      if (!sessionId) {
        return json({ error: "Ödeme oturumu bulunamadı", error_code: "NO_SESSION" }, 400);
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const stripePaid =
        session.payment_status === "paid" || session.payment_status === "no_payment_required";

      if (!stripePaid) {
        return json({
          error: "Ödeme henüz tamamlanmadı",
          error_code: "STRIPE_NOT_PAID",
          stripe_status: session.payment_status,
        }, 400);
      }

      const rawPi = session.payment_intent;
      paymentIntentId = typeof rawPi === "string" ? rawPi : rawPi?.id ?? paymentIntentId;

      await processPaymentRequestPaid({
        admin,
        supabaseUrl,
        serviceKey,
        requestId: paymentRequestId,
        sessionId: session.id,
        paymentIntentId,
      });
    } else if (orderRow.status === "pending_payment") {
      await processPaymentRequestPaid({
        admin,
        supabaseUrl,
        serviceKey,
        requestId: paymentRequestId,
      });
    }

    const { data: freshOrder } = await admin
      .from("kitchen_menu_orders")
      .select("status")
      .eq("id", orderId)
      .maybeSingle();

    return json({
      ok: true,
      order_id: orderId,
      status: freshOrder?.status ?? orderRow.status,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Doğrulama hatası", error_code: "STRIPE_ERROR" }, 500);
  }
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
