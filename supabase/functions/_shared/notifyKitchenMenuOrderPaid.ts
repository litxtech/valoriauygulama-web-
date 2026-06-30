import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type KitchenMenuOrderRow = {
  id: string;
  organization_id: string;
  customer_name: string;
  room_number: string | null;
  table_number: string | null;
  guest_hotel_name: string | null;
  delivery_address: string | null;
  total_amount: number | string;
  currency: string | null;
};

export async function notifyKitchenMenuOrderPaid(
  admin: SupabaseClient,
  supabaseUrl: string,
  orderId: string,
  paymentRequestId: string
): Promise<void> {
  const { data: order } = await admin
    .from("kitchen_menu_orders")
    .select(
      "id, organization_id, customer_name, room_number, table_number, guest_hotel_name, delivery_address, total_amount, currency"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order?.organization_id) return;
  const row = order as KitchenMenuOrderRow;

  const { data: items } = await admin
    .from("kitchen_menu_order_items")
    .select("item_name, quantity")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  const summary = (items ?? [])
    .map((i: { item_name: string; quantity: number }) => `${i.item_name} x${i.quantity}`)
    .join(" · ")
    .slice(0, 200);

  const { data: staffIdRows } = await admin.rpc("staff_ids_kitchen_menu_order_notify", {
    p_org_id: row.organization_id,
  });

  let staffIds: string[] = Array.isArray(staffIdRows) ? staffIdRows.filter(Boolean) : [];
  if (!staffIds.length) return;

  const { data: filtered } = await admin.rpc("filter_staff_notification_recipients", {
    p_staff_ids: staffIds,
    p_notification_type: "kitchen_menu_order_paid",
  });
  staffIds = (filtered ?? [])
    .map((r: { staff_id?: string }) => r.staff_id)
    .filter(Boolean) as string[];
  if (!staffIds.length) return;

  const amount = Number(row.total_amount);
  const cur = (row.currency ?? "try").toUpperCase();
  const amountStr = Number.isFinite(amount) ? `${amount.toFixed(2)} ${cur}` : cur;

  const locParts = [
    row.guest_hotel_name?.trim(),
    row.room_number ? `Oda ${row.room_number}` : null,
    row.table_number ? `Masa ${row.table_number}` : null,
    row.delivery_address?.trim(),
  ].filter(Boolean);

  const title = `Yeni menü siparişi · ${amountStr}`;
  let body = row.customer_name?.trim() || "Misafir";
  if (locParts.length) body += ` · ${locParts.join(" · ")}`;
  if (summary) body += ` · ${summary}`;

  const notificationType = "kitchen_menu_order_paid";
  const pushData = {
    url: "/staff/kitchen-ops/menu-orders",
    screen: "staff_kitchen_menu_orders",
    notificationType,
    notification_type: notificationType,
    feature_key: "guest_service_request",
    kitchenMenuOrderId: orderId,
    paymentRequestId,
  };

  const now = new Date().toISOString();
  const rows = staffIds.map((staffId: string) => ({
    staff_id: staffId,
    title,
    body,
    notification_type: notificationType,
    category: "staff",
    data: pushData,
    sent_via: "both",
    sent_at: now,
  }));

  const { error: insErr } = await admin.from("notifications").insert(rows);
  if (insErr) {
    console.warn("notifyKitchenMenuOrderPaid insert", insErr.message);
    return;
  }

  try {
    await fetch(`${supabaseUrl}/functions/v1/send-expo-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        staffIds,
        title,
        body: body.slice(0, 240),
        data: pushData,
      }),
    });
  } catch (e) {
    console.warn("notifyKitchenMenuOrderPaid push", e);
  }
}
