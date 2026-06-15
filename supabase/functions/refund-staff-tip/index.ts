// Admin: Stripe kart bahşişi iadesi
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripe } from "../_shared/stripeClient.ts";
import { applyStaffTipRefund } from "../_shared/staffTipRefund.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  tip_id: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Yetkisiz", error_code: "UNAUTHORIZED" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: "Oturum bulunamadı", error_code: "UNAUTHORIZED" }, 401);

  const { data: adminStaff } = await admin
    .from("staff")
    .select("id, role")
    .eq("auth_id", user.id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!adminStaff?.id || adminStaff.role !== "admin") {
    return json({ error: "Sadece admin bahşiş iade edebilir", error_code: "FORBIDDEN" }, 403);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Invalid JSON", error_code: "INVALID_JSON" }, 400);
  }

  const tipId = (body.tip_id ?? "").trim();
  if (!tipId) return json({ error: "tip_id required", error_code: "TIP_REQUIRED" }, 400);

  const { data: tipRow } = await admin
    .from("staff_tips")
    .select("id, status, payment_method, payment_request_id, stripe_refund_id, amount")
    .eq("id", tipId)
    .maybeSingle();

  if (!tipRow?.id) return json({ error: "Bahşiş bulunamadı", error_code: "TIP_NOT_FOUND" }, 404);

  if (tipRow.status === "refunded") {
    return json({ ok: true, tip_id: tipId, status: "refunded", skipped: "already_refunded" });
  }

  if (tipRow.status !== "confirmed" || tipRow.payment_method !== "stripe_card") {
    return json({ error: "Sadece onaylı Stripe bahşişleri iade edilebilir", error_code: "NOT_REFUNDABLE" }, 400);
  }

  const paymentRequestId = tipRow.payment_request_id as string | null;
  if (!paymentRequestId) {
    return json({ error: "Ödeme kaydı bulunamadı", error_code: "PAYMENT_MISSING" }, 400);
  }

  const { data: payRow } = await admin
    .from("payment_requests")
    .select("id, status, provider_session_id, provider_payment_intent_id, stripe_refund_id")
    .eq("id", paymentRequestId)
    .maybeSingle();

  if (!payRow?.id || payRow.status !== "paid") {
    return json({ error: "Ödeme iade için uygun değil", error_code: "PAYMENT_NOT_PAID" }, 400);
  }

  if (payRow.stripe_refund_id || tipRow.stripe_refund_id) {
    await applyStaffTipRefund(admin, {
      tipId,
      paymentRequestId,
      stripeRefundId: payRow.stripe_refund_id ?? tipRow.stripe_refund_id,
      refundedByStaffId: adminStaff.id,
    });
    return json({ ok: true, tip_id: tipId, status: "refunded", skipped: "already_refunded" });
  }

  try {
    const stripe = getStripe();
    let paymentIntentId = (payRow.provider_payment_intent_id as string | null)?.trim() || null;

    if (!paymentIntentId && payRow.provider_session_id) {
      const session = await stripe.checkout.sessions.retrieve(payRow.provider_session_id as string);
      const rawPi = session.payment_intent;
      paymentIntentId = typeof rawPi === "string" ? rawPi : rawPi?.id ?? null;
      if (paymentIntentId) {
        await admin
          .from("payment_requests")
          .update({ provider_payment_intent_id: paymentIntentId })
          .eq("id", paymentRequestId);
      }
    }

    if (!paymentIntentId) {
      return json({ error: "Stripe ödeme kimliği bulunamadı", error_code: "PAYMENT_INTENT_MISSING" }, 400);
    }

    const refund = await stripe.refunds.create({ payment_intent: paymentIntentId });

    const result = await applyStaffTipRefund(admin, {
      tipId,
      paymentRequestId,
      stripeRefundId: refund.id,
      refundedByStaffId: adminStaff.id,
    });

    if (!result.ok && result.skipped !== "already_refunded") {
      return json({ error: "Kayıt güncellenemedi", error_code: "UPDATE_FAILED" }, 500);
    }

    return json({
      ok: true,
      tip_id: tipId,
      payment_request_id: paymentRequestId,
      refund_id: refund.id,
      status: "refunded",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/already been refunded|charge_already_refunded/i.test(msg)) {
      await applyStaffTipRefund(admin, {
        tipId,
        paymentRequestId,
        refundedByStaffId: adminStaff.id,
      });
      return json({ ok: true, tip_id: tipId, status: "refunded", skipped: "already_refunded_stripe" });
    }
    return json({ error: msg || "Stripe iade hatası", error_code: "STRIPE_REFUND_ERROR" }, 500);
  }
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
