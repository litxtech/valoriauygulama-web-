// Public QR menu — anonymous cart checkout + Stripe (no app login)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  defaultPaymentCurrency,
  getStripe,
  toStripeMinorUnits,
} from "../_shared/stripeClient.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CartLine = { menu_item_id: string; quantity: number };

type Body = {
  org_slug: string;
  items: CartLine[];
  customer_name: string;
  customer_email: string;
  room_number?: string | null;
  table_number?: string | null;
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

function publicMenuBaseUrl(): string {
  return (Deno.env.get("PAYMENT_PUBLIC_BASE_URL") ?? "https://valoria.tr").replace(/\/$/, "");
}

function menuPaymentUrls(slug: string, requestId: string, token: string) {
  const base = publicMenuBaseUrl();
  const encSlug = encodeURIComponent(slug.trim().toLowerCase());
  const successQ = new URLSearchParams({ payment: "success", id: requestId, token });
  const cancelQ = new URLSearchParams({ payment: "cancel", id: requestId, token });
  return {
    success: `${base}/menu/${encSlug}?${successQ.toString()}`,
    cancel: `${base}/menu/${encSlug}?${cancelQ.toString()}`,
  };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

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

  const orgSlug = (body.org_slug ?? "").trim().toLowerCase();
  if (!orgSlug || orgSlug.length > 64) {
    return json({ error: "Invalid organization", error_code: "INVALID_SLUG" }, 400);
  }

  const customerName = (body.customer_name ?? "").trim().slice(0, 120);
  const customerEmail = (body.customer_email ?? "").trim().toLowerCase().slice(0, 254);
  if (customerName.length < 2) {
    return json({ error: "Name required", error_code: "NAME_REQUIRED" }, 400);
  }
  if (!isValidEmail(customerEmail)) {
    return json({ error: "Valid email required", error_code: "EMAIL_REQUIRED" }, 400);
  }

  const cart = Array.isArray(body.items) ? body.items : [];
  if (cart.length === 0) {
    return json({ error: "Cart is empty", error_code: "CART_EMPTY" }, 400);
  }
  if (cart.length > 30) {
    return json({ error: "Too many items", error_code: "CART_TOO_LARGE" }, 400);
  }

  const { data: orgRow, error: orgErr } = await admin
    .from("organizations")
    .select("id, name, slug, public_kitchen_menu_enabled")
    .eq("slug", orgSlug)
    .maybeSingle();

  if (orgErr) return json({ error: orgErr.message, error_code: "ORG_ERROR" }, 500);
  if (!orgRow?.id) return json({ error: "Menu not found", error_code: "ORG_NOT_FOUND" }, 404);
  if (orgRow.public_kitchen_menu_enabled !== true) {
    return json({ error: "Public menu disabled", error_code: "MENU_DISABLED" }, 403);
  }

  const orgId = orgRow.id as string;
  const orgName = ((orgRow.name as string) ?? "Hotel").trim();
  const roomNumber = (body.room_number ?? "").trim().slice(0, 32) || null;
  const tableNumber = (body.table_number ?? "").trim().slice(0, 32) || null;

  const menuIds = [...new Set(cart.map((c) => (c.menu_item_id ?? "").trim()).filter(Boolean))];
  if (menuIds.length === 0) {
    return json({ error: "Invalid items", error_code: "INVALID_ITEMS" }, 400);
  }

  const { data: menuRows, error: menuErr } = await admin
    .from("hotel_kitchen_menu_items")
    .select("id, name, price, is_available, organization_id")
    .eq("organization_id", orgId)
    .eq("is_available", true)
    .in("id", menuIds);

  if (menuErr) return json({ error: menuErr.message, error_code: "MENU_ERROR" }, 500);

  const menuMap = new Map(
    (menuRows ?? []).map((r) => [
      r.id as string,
      r as { id: string; name: string; price: number; is_available: boolean },
    ])
  );

  const orderLines: {
    menu_item_id: string;
    item_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }[] = [];

  let total = 0;
  const currency = defaultPaymentCurrency();

  for (const line of cart) {
    const id = (line.menu_item_id ?? "").trim();
    const qty = Math.floor(Number(line.quantity));
    if (!id || !Number.isFinite(qty) || qty < 1 || qty > 99) {
      return json({ error: "Invalid quantity", error_code: "INVALID_QTY" }, 400);
    }
    const item = menuMap.get(id);
    if (!item) {
      return json({ error: "Item unavailable", error_code: "ITEM_UNAVAILABLE" }, 400);
    }
    const unit = roundMoney(Number(item.price));
    const lineTotal = roundMoney(unit * qty);
    total += lineTotal;
    orderLines.push({
      menu_item_id: id,
      item_name: item.name,
      quantity: qty,
      unit_price: unit,
      line_total: lineTotal,
    });
  }

  total = roundMoney(total);
  if (total <= 0 || total > 500000) {
    return json({ error: "Invalid amount", error_code: "INVALID_AMOUNT" }, 400);
  }

  const itemsSummary = buildItemsSummary(orderLines, currency);
  const roomLabel = roomNumber ? `Room ${roomNumber}` : tableNumber ? `Table ${tableNumber}` : "—";
  const title = `${orgName} · Menu · ${roundMoney(total).toFixed(2)} ${currency.toUpperCase()}`;
  const description = `${roomLabel} · ${customerName} · ${itemsSummary}`;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const lang = (body.lang ?? "en").toString().slice(0, 8);

  const { data: orderRow, error: orderErr } = await admin
    .from("kitchen_menu_orders")
    .insert({
      organization_id: orgId,
      org_slug: orgSlug,
      guest_id: null,
      customer_name: customerName,
      customer_email: customerEmail,
      room_number: roomNumber,
      table_number: tableNumber,
      status: "pending_payment",
      total_amount: total,
      currency,
    })
    .select("id")
    .single();

  if (orderErr || !orderRow?.id) {
    return json({ error: orderErr?.message ?? "Order failed", error_code: "ORDER_INSERT" }, 500);
  }

  const orderId = orderRow.id as string;

  const { error: itemsErr } = await admin.from("kitchen_menu_order_items").insert(
    orderLines.map((l) => ({
      order_id: orderId,
      menu_item_id: l.menu_item_id,
      item_name: l.item_name,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total: l.line_total,
    }))
  );

  if (itemsErr) {
    await admin.from("kitchen_menu_orders").update({ status: "cancelled" }).eq("id", orderId);
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
      service_kind: "food",
      reference_type: "kitchen_menu_order",
      reference_id: orderId,
      guest_id: null,
      created_by_staff_id: null,
      metadata: {
        customer_name: customerName,
        customer_email: customerEmail,
        room_number: roomNumber,
        table_number: tableNumber,
        items_summary: itemsSummary,
        kitchen_menu_order_id: orderId,
        org_slug: orgSlug,
        lang,
      },
      expires_at: expiresAt,
      status: "pending",
      provider: "stripe",
    })
    .select("id, public_token")
    .single();

  if (payInsertErr || !paymentRow?.id) {
    await admin.from("kitchen_menu_orders").update({ status: "cancelled" }).eq("id", orderId);
    return json({ error: payInsertErr?.message ?? "Payment record failed", error_code: "PAYMENT_INSERT" }, 500);
  }

  await admin
    .from("kitchen_menu_orders")
    .update({ payment_request_id: paymentRow.id })
    .eq("id", orderId);

  const urls = menuPaymentUrls(orgSlug, paymentRow.id, paymentRow.public_token);

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: customerEmail,
      success_url: urls.success,
      cancel_url: urls.cancel,
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
        service_kind: "food",
        kitchen_menu_order_id: orderId,
        public_token: paymentRow.public_token,
        org_slug: orgSlug,
      },
      expires_at: Math.floor(new Date(expiresAt).getTime() / 1000),
    });

    const payUrl = session.url;
    if (!payUrl) {
      await admin.from("payment_requests").update({ status: "failed" }).eq("id", paymentRow.id);
      await admin.from("kitchen_menu_orders").update({ status: "cancelled" }).eq("id", orderId);
      return json({ error: "Checkout session failed", error_code: "STRIPE_SESSION" }, 500);
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
    await admin.from("kitchen_menu_orders").update({ status: "cancelled" }).eq("id", orderId);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Payment error", error_code: "STRIPE_ERROR" }, 500);
  }
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
