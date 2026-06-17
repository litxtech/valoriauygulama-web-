// Stripe webhook — checkout.session.completed → payment_requests paid
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripe, stripeWebhookSecret } from "../_shared/stripeClient.ts";
import {
  applyStaffTipRefund,
  findPaymentRequestForPaymentIntent,
} from "../_shared/staffTipRefund.ts";
import { notifyPaymentCreator } from "../_shared/notifyPaymentCreator.ts";
import { processPaymentRequestPaid } from "../_shared/processPaymentRequestPaid.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new Response(JSON.stringify({ error: "stripe-signature gerekli" }), { status: 400 });
  }

  const rawBody = await req.text();
  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, sig, stripeWebhookSecret());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: `Webhook imza hatası: ${msg}` }), { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as {
      id: string;
      payment_status?: string;
      payment_intent?: string | { id: string } | null;
      metadata?: Record<string, string>;
    };

    const requestId = session.metadata?.payment_request_id;
    if (!requestId) {
      return new Response(JSON.stringify({ received: true, skipped: "no payment_request_id" }), { status: 200 });
    }

    if (session.payment_status && session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
      return new Response(JSON.stringify({ received: true, skipped: session.payment_status }), { status: 200 });
    }

    const rawPi = session.payment_intent;
    const paymentIntentId = typeof rawPi === "string" ? rawPi : rawPi?.id ?? null;

    await processPaymentRequestPaid({
      admin,
      supabaseUrl,
      serviceKey,
      requestId,
      sessionId: session.id,
      paymentIntentId,
    });
  }

  if (
    event.type === "checkout.session.expired" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    const session = event.data.object as { metadata?: Record<string, string> };
    const requestId = session.metadata?.payment_request_id;
    if (requestId) {
      const { data: payRow } = await admin
        .from("payment_requests")
        .select("reference_type, reference_id, status")
        .eq("id", requestId)
        .maybeSingle();

      const nextStatus = event.type === "checkout.session.expired" ? "expired" : "failed";
      const outcome = event.type === "checkout.session.expired" ? "expired" : "failed";

      await admin
        .from("payment_requests")
        .update({ status: nextStatus })
        .eq("id", requestId)
        .eq("status", "pending");

      if (payRow?.reference_type === "staff_tip" && payRow.reference_id) {
        await admin
          .from("staff_tips")
          .update({ status: "cancelled" })
          .eq("id", payRow.reference_id)
          .eq("status", "pending");
      }
      if (payRow?.reference_type === "guest_extra_order" && payRow.reference_id) {
        await admin
          .from("guest_extra_orders")
          .update({ status: nextStatus === "expired" ? "expired" : "cancelled" })
          .eq("id", payRow.reference_id)
          .eq("status", "pending_payment");
      }
      if (payRow?.reference_type === "kitchen_menu_order" && payRow.reference_id) {
        await admin
          .from("kitchen_menu_orders")
          .update({ status: nextStatus === "expired" ? "expired" : "cancelled" })
          .eq("id", payRow.reference_id)
          .eq("status", "pending_payment");
      }

      if (payRow?.status === "pending") {
        await notifyPaymentCreator(admin, supabaseUrl, serviceKey, requestId, outcome);
      }
    }
  }

  if (event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as {
      metadata?: Record<string, string>;
      payment_intent?: string | { id: string } | null;
      id: string;
    };
    const requestId = session.metadata?.payment_request_id;
    if (requestId) {
      const rawPi = session.payment_intent;
      const paymentIntentId = typeof rawPi === "string" ? rawPi : rawPi?.id ?? null;

      await processPaymentRequestPaid({
        admin,
        supabaseUrl,
        serviceKey,
        requestId,
        sessionId: session.id,
        paymentIntentId,
      });
    }
  }

  if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object as { id?: string };
    const paymentIntentId = intent.id;
    if (paymentIntentId) {
      const stripe = getStripe();
      const payRow = await findPaymentRequestForPaymentIntent(admin, stripe, paymentIntentId);
      if (payRow?.id && payRow.status === "pending") {
        await admin
          .from("payment_requests")
          .update({ status: "failed" })
          .eq("id", payRow.id)
          .eq("status", "pending");

        await notifyPaymentCreator(admin, supabaseUrl, serviceKey, payRow.id, "failed");
      }
    }
  }

  if (event.type === "charge.refunded" || event.type === "refund.updated") {
    const stripe = getStripe();
    let paymentIntentId: string | null = null;
    let refundId: string | null = null;

    if (event.type === "charge.refunded") {
      const charge = event.data.object as {
        payment_intent?: string | { id: string } | null;
        refunds?: { data?: Array<{ id?: string }> };
      };
      const rawPi = charge.payment_intent;
      paymentIntentId = typeof rawPi === "string" ? rawPi : rawPi?.id ?? null;
      refundId = charge.refunds?.data?.[0]?.id ?? null;
    } else {
      const refund = event.data.object as {
        status?: string;
        payment_intent?: string | { id: string } | null;
        id?: string;
      };
      if (refund.status !== "succeeded") {
        return new Response(JSON.stringify({ received: true, skipped: refund.status }), { status: 200 });
      }
      const rawPi = refund.payment_intent;
      paymentIntentId = typeof rawPi === "string" ? rawPi : rawPi?.id ?? null;
      refundId = refund.id ?? null;
    }

    if (paymentIntentId) {
      const payRow = await findPaymentRequestForPaymentIntent(admin, stripe, paymentIntentId);
      if (payRow?.reference_type === "staff_tip" && payRow.reference_id && payRow.status === "paid") {
        await applyStaffTipRefund(admin, {
          tipId: payRow.reference_id as string,
          paymentRequestId: payRow.id,
          stripeRefundId: refundId,
        });
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
