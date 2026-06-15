// Personel: ödeme talebi + Stripe Checkout Session + pay_url (QR)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  defaultPaymentCurrency,
  getStripe,
  paymentCancelUrl,
  paymentSuccessUrl,
  toStripeMinorUnits,
} from "../_shared/stripeClient.ts";
import { paymentRequestOpenUrl, stripeProductName } from "../_shared/paymentLinkPage.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SERVICE_KINDS = new Set(["food", "amenity", "room_service", "transfer", "dining", "generic", "other"]);

type Body = {
  amount: number;
  currency?: string;
  title: string;
  description?: string | null;
  service_kind?: string;
  reference_type?: string | null;
  reference_id?: string | null;
  guest_id?: string | null;
  metadata?: Record<string, unknown>;
  expires_in_minutes?: number;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Yetkisiz" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: "Oturum geçersiz" }, 401);

  const { data: staffRow } = await admin
    .from("staff")
    .select("id, organization_id, role, full_name, is_active, deleted_at")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (!staffRow?.id || staffRow.deleted_at || staffRow.is_active === false) {
    return json({ error: "Personel kaydı bulunamadı" }, 403);
  }
  if (!staffRow.organization_id) {
    return json({ error: "Otel (organization) atanmamış" }, 400);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Geçersiz JSON" }, 400);
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 500000) {
    return json({ error: "Geçersiz tutar (0–500.000)" }, 400);
  }

  const title = (body.title ?? "").trim();
  if (title.length < 2) return json({ error: "Başlık en az 2 karakter olmalı" }, 400);

  const currency = (body.currency ?? defaultPaymentCurrency()).trim().toLowerCase();
  const serviceKind = (body.service_kind ?? "generic").trim().toLowerCase();
  if (!SERVICE_KINDS.has(serviceKind)) {
    return json({ error: "Geçersiz service_kind" }, 400);
  }

  const expiresMinutes = Math.min(1440, Math.max(15, Number(body.expires_in_minutes) || 120));
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString();

  const { data: inserted, error: insertErr } = await admin
    .from("payment_requests")
    .insert({
      organization_id: staffRow.organization_id,
      amount: Math.round(amount * 100) / 100,
      currency,
      title,
      description: body.description?.trim() || null,
      service_kind: serviceKind,
      reference_type: body.reference_type?.trim() || null,
      reference_id: body.reference_id || null,
      guest_id: body.guest_id || null,
      created_by_staff_id: staffRow.id,
      metadata: {
        ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
        staff_name: staffRow.full_name ?? null,
      },
      expires_at: expiresAt,
      status: "pending",
      provider: "stripe",
    })
    .select("id, public_token, organization_id, amount, currency, title, description, service_kind")
    .single();

  if (insertErr || !inserted) {
    return json({ error: insertErr?.message ?? "Kayıt oluşturulamadı" }, 500);
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: paymentSuccessUrl(inserted.id, inserted.public_token),
      cancel_url: paymentCancelUrl(inserted.id, inserted.public_token),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: toStripeMinorUnits(amount, currency),
            product_data: {
              name: stripeProductName(title),
              description: (body.description?.trim() || serviceKind).slice(0, 500),
            },
          },
        },
      ],
      metadata: {
        payment_request_id: inserted.id,
        organization_id: inserted.organization_id,
        service_kind: serviceKind,
        public_token: inserted.public_token,
      },
      expires_at: Math.floor(new Date(expiresAt).getTime() / 1000),
    });

    const payUrl = session.url;
    if (!payUrl) {
      await admin.from("payment_requests").update({ status: "failed" }).eq("id", inserted.id);
      return json({ error: "Stripe oturumu oluşturulamadı" }, 500);
    }

    await admin
      .from("payment_requests")
      .update({
        provider_session_id: session.id,
        pay_url: payUrl,
      })
      .eq("id", inserted.id);

    const openUrl = paymentRequestOpenUrl(inserted.public_token);

    return json({
      id: inserted.id,
      public_token: inserted.public_token,
      open_url: openUrl,
      pay_url: payUrl,
      amount: inserted.amount,
      currency: inserted.currency,
      title: inserted.title,
      description: inserted.description,
      service_kind: inserted.service_kind,
      expires_at: expiresAt,
      status: "pending",
    });
  } catch (e) {
    await admin.from("payment_requests").update({ status: "failed" }).eq("id", inserted.id);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Stripe hatası" }, 500);
  }
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
