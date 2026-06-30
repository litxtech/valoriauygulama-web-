// Public QR menu — anonymous cart checkout + Stripe (no app login)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  defaultPaymentCurrency,
  getStripe,
  toStripeMinorUnits,
} from "../_shared/stripeClient.ts";
import {
  resolveGuestForPayment,
  stripeCustomerEmailFromGuest,
} from "../_shared/resolveGuestForPayment.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CartLine = { menu_item_id: string; quantity: number };

type Body = {
  org_slug: string;
  items: CartLine[];
  customer_name: string;
  customer_email?: string | null;
  room_number?: string | null;
  table_number?: string | null;
  guest_hotel_name?: string | null;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  delivery_address?: string | null;
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

/** supabase-js public checkout always sends the anon JWT — getUser() on it hangs in Edge. */
function isAnonAccessToken(token: string, anonKey: string): boolean {
  if (!token || token === anonKey) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    return payload?.role === "anon";
  } catch {
    return false;
  }
}

type CheckoutFieldMode = "required" | "optional" | "hidden";

type CheckoutFields = {
  name: CheckoutFieldMode;
  email: CheckoutFieldMode;
  room: CheckoutFieldMode;
  table: CheckoutFieldMode;
  hotelName: CheckoutFieldMode;
  location: CheckoutFieldMode;
};

const DEFAULT_CHECKOUT_FIELDS: CheckoutFields = {
  name: "required",
  email: "optional",
  room: "optional",
  table: "optional",
  hotelName: "optional",
  location: "optional",
};

function parseCheckoutFields(raw: unknown): CheckoutFields {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_CHECKOUT_FIELDS };
  const theme = raw as { checkoutFields?: Record<string, unknown> };
  const f = theme.checkoutFields;
  if (!f || typeof f !== "object") return { ...DEFAULT_CHECKOUT_FIELDS };
  const mode = (v: unknown, fallback: CheckoutFieldMode): CheckoutFieldMode =>
    v === "required" || v === "optional" || v === "hidden" ? v : fallback;
  return {
    name: mode(f.name, DEFAULT_CHECKOUT_FIELDS.name),
    email: mode(f.email, DEFAULT_CHECKOUT_FIELDS.email),
    room: mode(f.room, DEFAULT_CHECKOUT_FIELDS.room),
    table: mode(f.table, DEFAULT_CHECKOUT_FIELDS.table),
    hotelName: mode(f.hotelName, DEFAULT_CHECKOUT_FIELDS.hotelName),
    location: mode(f.location, DEFAULT_CHECKOUT_FIELDS.location),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed", error_code: "METHOD" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  let authGuest: Awaited<ReturnType<typeof resolveGuestForPayment>> = null;
  if (token && !isAnonAccessToken(token, anonKey)) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (user?.id) {
      const { data: staffCaller } = await admin.from("staff").select("id").eq("auth_id", user.id).maybeSingle();
      if (!staffCaller?.id) {
        authGuest = await resolveGuestForPayment(admin, userClient, user.id);
      }
    }
  }

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

  const customerName = ((body.customer_name ?? "").trim() || authGuest?.full_name?.trim() || "").slice(0, 120);
  let customerEmail = (body.customer_email ?? "").trim().toLowerCase().slice(0, 254);
  if (!isValidEmail(customerEmail) && authGuest) {
    customerEmail = stripeCustomerEmailFromGuest(authGuest) ?? "";
  }

  const { data: orgRow, error: orgErr } = await admin
    .from("organizations")
    .select("id, name, slug, public_kitchen_menu_enabled, kitchen_menu_public_theme")
    .eq("slug", orgSlug)
    .maybeSingle();

  if (orgErr) return json({ error: orgErr.message, error_code: "ORG_ERROR" }, 500);
  if (!orgRow?.id) return json({ error: "Menu not found", error_code: "ORG_NOT_FOUND" }, 404);
  if (orgRow.public_kitchen_menu_enabled !== true) {
    return json({ error: "Public menu disabled", error_code: "MENU_DISABLED" }, 403);
  }

  const checkoutFields = parseCheckoutFields(
    (orgRow as { kitchen_menu_public_theme?: unknown }).kitchen_menu_public_theme
  );

  const resolvedName = customerName.length >= 2 ? customerName : "Misafir";
  if (checkoutFields.name === "required" && customerName.length < 2) {
    return json({ error: "Name required", error_code: "NAME_REQUIRED" }, 400);
  }
  if (checkoutFields.email === "required" && !isValidEmail(customerEmail)) {
    return json({ error: "Valid email required", error_code: "EMAIL_REQUIRED" }, 400);
  }
  if (customerEmail && !isValidEmail(customerEmail)) {
    return json({ error: "Valid email required", error_code: "EMAIL_REQUIRED" }, 400);
  }

  const orgId = orgRow.id as string;
  const orgName = ((orgRow.name as string) ?? "Hotel").trim();
  const roomNumber =
    (body.room_number ?? "").trim().slice(0, 32) ||
    (authGuest?.rooms?.room_number != null ? String(authGuest.rooms.room_number) : "") ||
    null;
  const tableNumber = (body.table_number ?? "").trim().slice(0, 32) || null;
  const guestHotelName = (body.guest_hotel_name ?? "").trim().slice(0, 120) || null;
  const deliveryAddress = (body.delivery_address ?? "").trim().slice(0, 500) || null;
  const deliveryLat = Number(body.delivery_lat);
  const deliveryLng = Number(body.delivery_lng);
  const hasLocation =
    deliveryAddress.length > 0 ||
    (Number.isFinite(deliveryLat) && Number.isFinite(deliveryLng));

  if (checkoutFields.room === "required" && !roomNumber) {
    return json({ error: "Room number required", error_code: "ROOM_REQUIRED" }, 400);
  }
  if (checkoutFields.table === "required" && !tableNumber) {
    return json({ error: "Table number required", error_code: "TABLE_REQUIRED" }, 400);
  }
  if (checkoutFields.hotelName === "required" && !guestHotelName) {
    return json({ error: "Hotel name required", error_code: "HOTEL_NAME_REQUIRED" }, 400);
  }
  if (checkoutFields.location === "required" && !hasLocation) {
    return json({ error: "Location required", error_code: "LOCATION_REQUIRED" }, 400);
  }

  const cart = Array.isArray(body.items) ? body.items : [];
  if (cart.length === 0) {
    return json({ error: "Cart is empty", error_code: "CART_EMPTY" }, 400);
  }
  if (cart.length > 30) {
    return json({ error: "Too many items", error_code: "CART_TOO_LARGE" }, 400);
  }

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
  const roomLabel = [
    guestHotelName,
    roomNumber ? `Oda ${roomNumber}` : null,
    tableNumber ? `Masa ${tableNumber}` : null,
    deliveryAddress || null,
  ]
    .filter(Boolean)
    .join(" · ") || "—";
  const title = `${orgName} · Menu · ${roundMoney(total).toFixed(2)} ${currency.toUpperCase()}`;
  const description = `${roomLabel} · ${resolvedName} · ${itemsSummary}`;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const lang = (body.lang ?? "en").toString().slice(0, 8);

  const orderEmail =
    isValidEmail(customerEmail) ? customerEmail : `menu+${crypto.randomUUID().slice(0, 8)}@orders.valoria.local`;

  const { data: orderRow, error: orderErr } = await admin
    .from("kitchen_menu_orders")
    .insert({
      organization_id: orgId,
      org_slug: orgSlug,
      guest_id: authGuest?.id ?? null,
      customer_name: resolvedName,
      customer_email: orderEmail,
      room_number: roomNumber,
      table_number: tableNumber,
      guest_hotel_name: guestHotelName,
      delivery_lat: Number.isFinite(deliveryLat) ? deliveryLat : null,
      delivery_lng: Number.isFinite(deliveryLng) ? deliveryLng : null,
      delivery_address: deliveryAddress || null,
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
      guest_id: authGuest?.id ?? null,
      created_by_staff_id: null,
      metadata: {
        customer_name: resolvedName,
        customer_email: isValidEmail(customerEmail) ? customerEmail : null,
        room_number: roomNumber,
        table_number: tableNumber,
        guest_hotel_name: guestHotelName,
        delivery_address: deliveryAddress || null,
        delivery_lat: Number.isFinite(deliveryLat) ? deliveryLat : null,
        delivery_lng: Number.isFinite(deliveryLng) ? deliveryLng : null,
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
      ...(isValidEmail(customerEmail) ? { customer_email: customerEmail } : {}),
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
