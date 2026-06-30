// Partner otel cari bakiyesi → Stripe Checkout
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  defaultPaymentCurrency,
  getStripe,
  paymentCancelUrl,
  paymentSuccessUrl,
  toStripeMinorUnits,
} from "../_shared/stripeClient.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  amount?: number | null;
  agreement_id?: string | null;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

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
  if (userErr || !user) return json({ error: "Oturum geçersiz", error_code: "UNAUTHORIZED" }, 401);

  const { data: staffCaller } = await admin.from("staff").select("id").eq("auth_id", user.id).maybeSingle();
  if (staffCaller?.id) return json({ error: "Yalnızca partner hesabı", error_code: "PARTNER_ONLY" }, 403);

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const { data: partnerUser, error: partnerErr } = await admin
    .from("breakfast_partner_users")
    .select("id, email, full_name, partner_hotel_id, is_active")
    .eq("auth_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (partnerErr || !partnerUser?.partner_hotel_id) {
    return json({ error: "Partner profili bulunamadı", error_code: "PARTNER_NOT_FOUND" }, 404);
  }

  const { data: hotel, error: hotelErr } = await admin
    .from("breakfast_partner_hotels")
    .select("id, organization_id, counterparty_id, name, status, email")
    .eq("id", partnerUser.partner_hotel_id)
    .maybeSingle();

  if (hotelErr || !hotel) return json({ error: "Partner otel bulunamadı", error_code: "HOTEL_NOT_FOUND" }, 404);
  if (hotel.status !== "active") {
    return json({ error: "Hesap aktif değil", error_code: "PORTAL_INACTIVE" }, 403);
  }

  const { data: openBalanceRaw, error: balanceErr } = await userClient.rpc("breakfast_partner_open_balance");
  if (balanceErr) return json({ error: balanceErr.message, error_code: "BALANCE_ERROR" }, 400);

  const openBalance = roundMoney(Number(openBalanceRaw) || 0);
  if (openBalance <= 0) {
    return json({ error: "Ödenecek açık bakiye yok", error_code: "NO_BALANCE" }, 400);
  }

  let targetAgreementId = (body.agreement_id ?? "").trim() || null;
  let agreementRemaining = 0;
  let agreementTitle = "";

  if (targetAgreementId) {
    const { data: agreement, error: agreementErr } = await admin
      .from("finance_counterparty_agreements")
      .select("id, title, amount_remaining, status, movement_kind, counterparty_id, started_on")
      .eq("id", targetAgreementId)
      .maybeSingle();

    if (agreementErr || !agreement) {
      return json({ error: "Kahvaltı kaydı bulunamadı", error_code: "AGREEMENT_NOT_FOUND" }, 404);
    }
    if (agreement.counterparty_id !== hotel.counterparty_id || agreement.movement_kind !== "income") {
      return json({ error: "Bu kayıt için ödeme yapılamaz", error_code: "AGREEMENT_FORBIDDEN" }, 403);
    }
    agreementRemaining = roundMoney(Number(agreement.amount_remaining) || 0);
    if (agreementRemaining <= 0 || !["open", "partial"].includes(String(agreement.status))) {
      return json({ error: "Bu kahvaltı kaydı zaten ödenmiş", error_code: "AGREEMENT_PAID" }, 400);
    }
    agreementTitle = String(agreement.title ?? "").trim();
  }

  let payAmount =
    body.amount != null && body.amount > 0
      ? roundMoney(Number(body.amount))
      : targetAgreementId
        ? agreementRemaining
        : openBalance;
  if (targetAgreementId && payAmount > agreementRemaining) payAmount = agreementRemaining;
  if (payAmount > openBalance) payAmount = openBalance;
  if (payAmount < 1) {
    return json({ error: "Minimum ödeme tutarı 1 ₺", error_code: "MIN_AMOUNT" }, 400);
  }

  const { data: pendingRow } = await admin
    .from("payment_requests")
    .select("id, public_token, pay_url, amount, status, expires_at, metadata")
    .eq("reference_type", "breakfast_partner_hotel")
    .eq("reference_id", hotel.id)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(5);

  const matchedPending = (pendingRow ?? []).find((row) => {
    if (Number(row.amount) !== payAmount) return false;
    const metaAgreement = (row.metadata as { agreement_id?: string } | null)?.agreement_id ?? null;
    return (metaAgreement ?? null) === (targetAgreementId ?? null);
  });

  if (matchedPending?.pay_url) {
    return json({
      payment_request_id: matchedPending.id,
      pay_url: matchedPending.pay_url,
      amount: Number(matchedPending.amount),
      currency: defaultPaymentCurrency(),
      status: "pending",
      reused: true,
    });
  }

  const currency = defaultPaymentCurrency();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const title = targetAgreementId
    ? `${hotel.name} — ${agreementTitle || "kahvaltı kaydı"}`
    : `${hotel.name} — kahvaltı cari ödemesi`;
  const description = targetAgreementId
    ? `${payAmount.toFixed(2)} ₺ kahvaltı tahsilatı (Stripe)`
    : `${payAmount.toFixed(2)} ₺ açık cari tahsilatı (Stripe)`;

  const { data: paymentRow, error: insertErr } = await admin
    .from("payment_requests")
    .insert({
      organization_id: hotel.organization_id,
      amount: payAmount,
      currency,
      title,
      description,
      service_kind: "breakfast_partner",
      reference_type: "breakfast_partner_hotel",
      reference_id: hotel.id,
      status: "pending",
      expires_at: expiresAt,
      metadata: {
        partner_hotel_id: hotel.id,
        counterparty_id: hotel.counterparty_id,
        partner_user_id: partnerUser.id,
        open_balance_snapshot: openBalance,
        ...(targetAgreementId ? { agreement_id: targetAgreementId } : {}),
      },
    })
    .select("id, public_token")
    .single();

  if (insertErr || !paymentRow) {
    return json({ error: insertErr?.message ?? "Ödeme kaydı oluşturulamadı", error_code: "INSERT_FAILED" }, 500);
  }

  const customerEmail = (partnerUser.email ?? hotel.email ?? user.email ?? "").trim().toLowerCase();

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      success_url: paymentSuccessUrl(paymentRow.id, paymentRow.public_token),
      cancel_url: paymentCancelUrl(paymentRow.id, paymentRow.public_token),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: toStripeMinorUnits(payAmount, currency),
            product_data: {
              name: title.slice(0, 120),
              description: description.slice(0, 500),
            },
          },
        },
      ],
      metadata: {
        payment_request_id: paymentRow.id,
        organization_id: hotel.organization_id,
        service_kind: "breakfast_partner",
        partner_hotel_id: hotel.id,
        counterparty_id: hotel.counterparty_id,
        public_token: paymentRow.public_token,
        ...(targetAgreementId ? { agreement_id: targetAgreementId } : {}),
      },
      expires_at: Math.floor(new Date(expiresAt).getTime() / 1000),
    });

    const payUrl = session.url;
    if (!payUrl) {
      await admin.from("payment_requests").update({ status: "failed" }).eq("id", paymentRow.id);
      return json({ error: "Stripe oturumu oluşturulamadı", error_code: "STRIPE_SESSION" }, 500);
    }

    await admin
      .from("payment_requests")
      .update({ provider_session_id: session.id, pay_url: payUrl })
      .eq("id", paymentRow.id);

    return json({
      payment_request_id: paymentRow.id,
      pay_url: payUrl,
      amount: payAmount,
      currency,
      status: "pending",
    });
  } catch (e) {
    await admin.from("payment_requests").update({ status: "failed" }).eq("id", paymentRow.id);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Stripe hatası", error_code: "STRIPE_ERROR" }, 500);
  }
});
