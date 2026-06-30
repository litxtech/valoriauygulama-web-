// Misafir → personel bahşişi + Stripe Checkout (gerçek kart ödemesi)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  defaultPaymentCurrency,
  getStripe,
  paymentCancelUrl,
  paymentSuccessUrl,
  toStripeMinorUnits,
} from "../_shared/stripeClient.ts";
import {
  guestTipError,
  guestTipPack,
  parseGuestTipLang,
  stripeLocaleForLang,
} from "../_shared/guestTipI18n.ts";
import { paymentRequestOpenUrl, stripeProductName } from "../_shared/paymentLinkPage.ts";
import {
  resolveGuestForPayment,
  stripeCustomerEmailFromGuest,
} from "../_shared/resolveGuestForPayment.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  staff_id: string;
  amount: number;
  currency?: string;
  note?: string | null;
  lang?: string | null;
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
  if (!token) return jsonErr("UNAUTHORIZED", "tr");

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return jsonErr("UNAUTHORIZED", "tr");

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Invalid JSON", error_code: "INVALID_JSON" }, 400);
  }

  const lang = parseGuestTipLang(body.lang);
  const i18n = guestTipPack(lang);

  const { data: staffCaller } = await admin
    .from("staff")
    .select("id")
    .eq("auth_id", user.id)
    .maybeSingle();
  if (staffCaller?.id) return jsonErr("GUEST_ONLY", lang);

  const staffId = (body.staff_id ?? "").trim();
  if (!staffId) return json({ error: "staff_id required", error_code: "STAFF_REQUIRED" }, 400);

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 10 || amount > 50000) {
    return jsonErr("INVALID_AMOUNT", lang);
  }

  const currency = (body.currency ?? defaultPaymentCurrency()).trim().toLowerCase();
  const note = body.note?.trim() || null;

  const guest = await resolveGuestForPayment(admin, userClient, user.id);
  if (!guest?.id) return jsonErr("GUEST_NOT_FOUND", lang);

  const { data: staffRow } = await admin
    .from("staff")
    .select("id, full_name, organization_id, is_active, deleted_at, tips_enabled")
    .eq("id", staffId)
    .maybeSingle();

  if (!staffRow?.id || staffRow.deleted_at || staffRow.is_active === false) {
    return jsonErr("STAFF_NOT_FOUND", lang);
  }

  if (staffRow.tips_enabled === false) {
    return jsonErr("TIPS_DISABLED", lang);
  }

  const { data: blocked } = await admin
    .from("user_blocks")
    .select("id")
    .eq("blocker_type", "guest")
    .eq("blocker_guest_id", guest.id)
    .eq("blocked_type", "staff")
    .eq("blocked_staff_id", staffId)
    .maybeSingle();
  if (blocked?.id) return jsonErr("STAFF_BLOCKED", lang);

  const orgId = staffRow.organization_id ?? guest.organization_id;
  if (!orgId) return jsonErr("HOTEL_NOT_FOUND", lang);

  const roundedAmount = Math.round(amount * 100) / 100;
  const staffName = (staffRow.full_name ?? "Staff").trim();
  const guestName = (guest.full_name ?? "Guest").trim();
  const title = i18n.stripeProductTitle(staffName);
  const description = note ?? i18n.stripeDescription(guestName, staffName);

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const { data: tipRow, error: tipErr } = await admin
    .from("staff_tips")
    .insert({
      guest_id: guest.id,
      staff_id: staffId,
      amount: roundedAmount,
      currency: currency.toUpperCase(),
      payment_method: "stripe_card",
      note,
      status: "pending",
    })
    .select("id")
    .single();

  if (tipErr || !tipRow?.id) {
    return json({ error: tipErr?.message ?? "Tip insert failed", error_code: "TIP_INSERT_FAILED" }, 500);
  }

  const { data: paymentRow, error: payInsertErr } = await admin
    .from("payment_requests")
    .insert({
      organization_id: orgId,
      amount: roundedAmount,
      currency,
      title,
      description,
      service_kind: "staff_tip",
      reference_type: "staff_tip",
      reference_id: tipRow.id,
      guest_id: guest.id,
      created_by_staff_id: null,
      metadata: {
        staff_id: staffId,
        staff_name: staffName,
        guest_name: guestName,
        staff_tip_id: tipRow.id,
        lang,
      },
      expires_at: expiresAt,
      status: "pending",
      provider: "stripe",
    })
    .select("id, public_token")
    .single();

  if (payInsertErr || !paymentRow?.id) {
    await admin.from("staff_tips").update({ status: "cancelled" }).eq("id", tipRow.id);
    return json({ error: payInsertErr?.message ?? "Payment insert failed", error_code: "PAYMENT_INSERT_FAILED" }, 500);
  }

  await admin
    .from("staff_tips")
    .update({ payment_request_id: paymentRow.id })
    .eq("id", tipRow.id);

  try {
    const stripe = getStripe();
    const customerEmail = stripeCustomerEmailFromGuest(guest);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: stripeLocaleForLang(lang) as "auto",
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      success_url: paymentSuccessUrl(paymentRow.id, paymentRow.public_token),
      cancel_url: paymentCancelUrl(paymentRow.id, paymentRow.public_token),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: toStripeMinorUnits(roundedAmount, currency),
            product_data: {
              name: stripeProductName(title),
              description: description.slice(0, 500),
            },
          },
        },
      ],
      metadata: {
        payment_request_id: paymentRow.id,
        organization_id: orgId,
        service_kind: "staff_tip",
        staff_tip_id: tipRow.id,
        staff_id: staffId,
        public_token: paymentRow.public_token,
      },
      expires_at: Math.floor(new Date(expiresAt).getTime() / 1000),
    });

    const payUrl = session.url;
    if (!payUrl) {
      await admin.from("payment_requests").update({ status: "failed" }).eq("id", paymentRow.id);
      await admin.from("staff_tips").update({ status: "cancelled" }).eq("id", tipRow.id);
      return json({ error: "Stripe session failed", error_code: "STRIPE_SESSION_FAILED" }, 500);
    }

    await admin
      .from("payment_requests")
      .update({ provider_session_id: session.id, pay_url: payUrl })
      .eq("id", paymentRow.id);

    const openUrl = paymentRequestOpenUrl(paymentRow.public_token);

    return json({
      tip_id: tipRow.id,
      payment_request_id: paymentRow.id,
      public_token: paymentRow.public_token,
      open_url: openUrl,
      pay_url: payUrl,
      amount: roundedAmount,
      currency,
      status: "pending",
    });
  } catch (e) {
    await admin.from("payment_requests").update({ status: "failed" }).eq("id", paymentRow.id);
    await admin.from("staff_tips").update({ status: "cancelled" }).eq("id", tipRow.id);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Stripe error", error_code: "STRIPE_ERROR" }, 500);
  }
});

function jsonErr(code: string, lang: ReturnType<typeof parseGuestTipLang>) {
  const payload = guestTipError(lang, code);
  const status =
    code === "UNAUTHORIZED" || code === "GUEST_NOT_FOUND" ? 401 :
    code === "GUEST_ONLY" || code === "STAFF_BLOCKED" ? 403 :
    code === "INVALID_AMOUNT" ? 400 :
    code === "STAFF_NOT_FOUND" ? 404 :
    400;
  return json(payload, status);
}

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
