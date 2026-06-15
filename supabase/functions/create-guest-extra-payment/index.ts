// Misafir → ekstra ücret kalemleri (battaniye, su vb.) + Stripe Checkout
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

type CartLine = { catalog_id: string; quantity: number };

type Body = {
  items: CartLine[];
  lang?: string | null;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildItemsSummary(
  lines: { name: string; quantity: number; line_total: number }[],
  currency: string
): string {
  const sym = currency.toLowerCase() === "try" ? "₺" : currency.toUpperCase();
  return lines
    .map((l) => `${l.name} x${l.quantity} (${roundMoney(l.line_total).toFixed(2)} ${sym})`)
    .join(" · ")
    .slice(0, 480);
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
  if (staffCaller?.id) return json({ error: "Yalnızca misafir hesabı", error_code: "GUEST_ONLY" }, 403);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Geçersiz JSON", error_code: "INVALID_JSON" }, 400);
  }

  const cart = Array.isArray(body.items) ? body.items : [];
  if (cart.length === 0) {
    return json({ error: "Sepet boş", error_code: "CART_EMPTY" }, 400);
  }

  const { data: guestRows } = await admin
    .from("guests")
    .select("id, full_name, organization_id, room_id, rooms(room_number)")
    .eq("auth_user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  const guest = guestRows?.[0] as {
    id: string;
    full_name: string | null;
    organization_id: string | null;
    room_id: string | null;
    rooms?: { room_number?: string | number | null } | null;
  } | undefined;

  if (!guest?.id) return json({ error: "Misafir kaydı bulunamadı", error_code: "GUEST_NOT_FOUND" }, 404);
  if (!guest.organization_id) {
    return json({ error: "Otel bilgisi eksik", error_code: "ORG_MISSING" }, 400);
  }

  const orgId = guest.organization_id;
  const guestName = (guest.full_name ?? "Misafir").trim();
  const roomNumber = guest.rooms?.room_number != null ? String(guest.rooms.room_number) : null;

  const catalogIds = [...new Set(cart.map((c) => (c.catalog_id ?? "").trim()).filter(Boolean))];
  if (catalogIds.length === 0) {
    return json({ error: "Geçersiz ürün", error_code: "INVALID_ITEMS" }, 400);
  }

  const { data: catalogRows, error: catErr } = await admin
    .from("hotel_extra_catalog")
    .select("id, name, price, currency, is_available")
    .eq("organization_id", orgId)
    .eq("is_available", true)
    .in("id", catalogIds);

  if (catErr) return json({ error: catErr.message, error_code: "CATALOG_ERROR" }, 500);

  const catalogMap = new Map(
    (catalogRows ?? []).map((r) => [
      r.id as string,
      r as { id: string; name: string; price: number; currency: string; is_available: boolean },
    ])
  );

  const orderLines: {
    catalog_item_id: string;
    item_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }[] = [];

  let total = 0;
  let currency = defaultPaymentCurrency();

  for (const line of cart) {
    const id = (line.catalog_id ?? "").trim();
    const qty = Math.floor(Number(line.quantity));
    if (!id || !Number.isFinite(qty) || qty < 1 || qty > 99) {
      return json({ error: "Geçersiz adet", error_code: "INVALID_QTY" }, 400);
    }
    const item = catalogMap.get(id);
    if (!item) {
      return json({ error: "Ürün bulunamadı veya satışta değil", error_code: "ITEM_UNAVAILABLE" }, 400);
    }
    const unit = roundMoney(Number(item.price));
    const lineTotal = roundMoney(unit * qty);
    total += lineTotal;
    currency = (item.currency ?? currency).trim().toLowerCase();
    orderLines.push({
      catalog_item_id: id,
      item_name: item.name,
      quantity: qty,
      unit_price: unit,
      line_total: lineTotal,
    });
  }

  total = roundMoney(total);
  if (total <= 0 || total > 500000) {
    return json({ error: "Geçersiz tutar", error_code: "INVALID_AMOUNT" }, 400);
  }

  const itemsSummary = buildItemsSummary(orderLines, currency);
  const roomLabel = roomNumber ? `Oda ${roomNumber}` : "Oda —";
  const title = `Ekstra hizmet · ${roundMoney(total).toFixed(2)} ${currency.toUpperCase()}`;
  const description = `${roomLabel} · ${guestName} · ${itemsSummary}`;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const { data: orderRow, error: orderErr } = await admin
    .from("guest_extra_orders")
    .insert({
      organization_id: orgId,
      guest_id: guest.id,
      room_id: guest.room_id,
      room_number: roomNumber,
      status: "pending_payment",
      total_amount: total,
      currency,
    })
    .select("id")
    .single();

  if (orderErr || !orderRow?.id) {
    return json({ error: orderErr?.message ?? "Sipariş oluşturulamadı", error_code: "ORDER_INSERT" }, 500);
  }

  const orderId = orderRow.id as string;

  const { error: itemsErr } = await admin.from("guest_extra_order_items").insert(
    orderLines.map((l) => ({
      order_id: orderId,
      catalog_item_id: l.catalog_item_id,
      item_name: l.item_name,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total: l.line_total,
    }))
  );

  if (itemsErr) {
    await admin.from("guest_extra_orders").update({ status: "cancelled" }).eq("id", orderId);
    return json({ error: itemsErr.message, error_code: "ITEMS_INSERT" }, 500);
  }

  const { data: paymentRow, error: payInsertErr } = await admin
    .from("payment_requests")
    .insert({
      organization_id: orgId,
      amount: total,
      currency,
      title,
      description,
      service_kind: "amenity",
      reference_type: "guest_extra_order",
      reference_id: orderId,
      guest_id: guest.id,
      created_by_staff_id: null,
      metadata: {
        guest_name: guestName,
        room_number: roomNumber,
        items_summary: itemsSummary,
        guest_extra_order_id: orderId,
        lang: (body.lang ?? "tr").toString().slice(0, 8),
      },
      expires_at: expiresAt,
      status: "pending",
      provider: "stripe",
    })
    .select("id, public_token")
    .single();

  if (payInsertErr || !paymentRow?.id) {
    await admin.from("guest_extra_orders").update({ status: "cancelled" }).eq("id", orderId);
    return json({ error: payInsertErr?.message ?? "Ödeme kaydı oluşturulamadı", error_code: "PAYMENT_INSERT" }, 500);
  }

  await admin
    .from("guest_extra_orders")
    .update({ payment_request_id: paymentRow.id })
    .eq("id", orderId);

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
            unit_amount: toStripeMinorUnits(total, currency),
            product_data: {
              name: title.slice(0, 120),
              description: description.slice(0, 500),
            },
          },
        },
      ],
      metadata: {
        payment_request_id: paymentRow.id,
        organization_id: orgId,
        service_kind: "amenity",
        guest_extra_order_id: orderId,
        public_token: paymentRow.public_token,
      },
      expires_at: Math.floor(new Date(expiresAt).getTime() / 1000),
    });

    const payUrl = session.url;
    if (!payUrl) {
      await admin.from("payment_requests").update({ status: "failed" }).eq("id", paymentRow.id);
      await admin.from("guest_extra_orders").update({ status: "cancelled" }).eq("id", orderId);
      return json({ error: "Stripe oturumu oluşturulamadı", error_code: "STRIPE_SESSION" }, 500);
    }

    await admin
      .from("payment_requests")
      .update({ provider_session_id: session.id, pay_url: payUrl })
      .eq("id", paymentRow.id);

    return json({
      order_id: orderId,
      payment_request_id: paymentRow.id,
      pay_url: payUrl,
      amount: total,
      currency,
      status: "pending",
    });
  } catch (e) {
    await admin.from("payment_requests").update({ status: "failed" }).eq("id", paymentRow.id);
    await admin.from("guest_extra_orders").update({ status: "cancelled" }).eq("id", orderId);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Stripe hatası", error_code: "STRIPE_ERROR" }, 500);
  }
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
