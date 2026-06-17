// Admin: Stripe bahşiş ödemesini kabul et / senkronize et
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripe } from "../_shared/stripeClient.ts";
import { applyStaffTipPaymentConfirmed } from "../_shared/staffTipConfirm.ts";
import { processPaymentRequestPaid } from "../_shared/processPaymentRequestPaid.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  tip_id?: string;
  payment_request_id?: string;
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
    return json({ error: "Sadece admin ödeme kabul edebilir", error_code: "FORBIDDEN" }, 403);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Invalid JSON", error_code: "INVALID_JSON" }, 400);
  }

  const tipId = (body.tip_id ?? "").trim();
  const paymentRequestIdInput = (body.payment_request_id ?? "").trim();

  let tipRow: { id: string; payment_request_id: string | null; status: string; payment_method: string } | null = null;
  let paymentRequestId = paymentRequestIdInput || null;

  if (tipId) {
    const { data } = await admin
      .from("staff_tips")
      .select("id, payment_request_id, status, payment_method")
      .eq("id", tipId)
      .maybeSingle();
    tipRow = data;
    paymentRequestId = paymentRequestId ?? (data?.payment_request_id as string | null);
  }

  if (!paymentRequestId) {
    return json({ error: "Ödeme kaydı bulunamadı", error_code: "PAYMENT_MISSING" }, 400);
  }

  const { data: payRow } = await admin
    .from("payment_requests")
    .select(
      "id, status, amount, currency, title, metadata, reference_type, reference_id, provider_session_id, provider_payment_intent_id"
    )
    .eq("id", paymentRequestId)
    .maybeSingle();

  if (!payRow?.id || payRow.reference_type !== "staff_tip" || !payRow.reference_id) {
    return json({ error: "Bahşiş ödemesi bulunamadı", error_code: "NOT_STAFF_TIP" }, 404);
  }

  if (tipId && payRow.reference_id !== tipId) {
    return json({ error: "Kayıt eşleşmiyor", error_code: "MISMATCH" }, 400);
  }

  if (!tipRow) {
    const { data } = await admin
      .from("staff_tips")
      .select("id, payment_request_id, status, payment_method")
      .eq("id", payRow.reference_id)
      .maybeSingle();
    tipRow = data;
  }

  if (!tipRow?.id) return json({ error: "Bahşiş bulunamadı", error_code: "TIP_NOT_FOUND" }, 404);
  if (tipRow.status === "confirmed") {
    return json({ ok: true, tip_id: tipRow.id, status: "confirmed", skipped: "already_confirmed" });
  }
  if (tipRow.status === "refunded") {
    return json({ error: "İade edilmiş bahşiş onaylanamaz", error_code: "REFUNDED" }, 400);
  }

  try {
    const stripe = getStripe();
    let paymentStatus = payRow.status as string;
    let paymentIntentId = (payRow.provider_payment_intent_id as string | null)?.trim() || null;

    if (paymentStatus !== "paid") {
      const sessionId = payRow.provider_session_id as string | null;
      if (!sessionId) {
        return json({ error: "Stripe oturumu bulunamadı — misafir henüz ödemedi", error_code: "NO_SESSION" }, 400);
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const stripePaid =
        session.payment_status === "paid" || session.payment_status === "no_payment_required";

      if (!stripePaid) {
        return json({
          error: "Stripe ödemesi henüz tamamlanmadı",
          error_code: "STRIPE_NOT_PAID",
          stripe_status: session.payment_status,
        }, 400);
      }

      const rawPi = session.payment_intent;
      paymentIntentId = typeof rawPi === "string" ? rawPi : rawPi?.id ?? paymentIntentId;

      await admin
        .from("payment_requests")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          provider_payment_intent_id: paymentIntentId,
        })
        .eq("id", paymentRequestId);

      paymentStatus = "paid";
    }

    if (paymentStatus !== "paid") {
      return json({ error: "Ödeme henüz alınmadı", error_code: "NOT_PAID" }, 400);
    }

    const result = await applyStaffTipPaymentConfirmed(admin, {
      paymentRequestId,
      paymentRow: payRow,
    });

    if (!result.ok) {
      return json({ error: "Bahşiş onaylanamadı", error_code: result.skipped ?? "FAILED" }, 500);
    }

    await processPaymentRequestPaid({
      admin,
      supabaseUrl,
      serviceKey,
      requestId: paymentRequestId,
    });

    return json({
      ok: true,
      tip_id: result.tipId ?? tipRow.id,
      payment_request_id: paymentRequestId,
      status: "confirmed",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Stripe doğrulama hatası", error_code: "STRIPE_ERROR" }, 500);
  }
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
