import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AdminPaymentLane = "tips" | "kitchen" | "hotel";

export function paymentLane(serviceKind: string): AdminPaymentLane {
  if (serviceKind === "staff_tip") return "tips";
  if (serviceKind === "food" || serviceKind === "dining") return "kitchen";
  return "hotel";
}

export function laneTitleTr(lane: AdminPaymentLane): string {
  if (lane === "tips") return "Bahşiş";
  if (lane === "kitchen") return "Mutfak ödemesi";
  return "Otel ödemesi";
}

function amountLabel(amount: number | string, currency: string | null): string {
  const n = Number(amount);
  const cur = (currency ?? "try").toUpperCase();
  if (!Number.isFinite(n)) return cur;
  return `${n.toFixed(2)} ${cur}`;
}

export type NotifyOrgAdminsPaymentOpts = {
  organizationId: string;
  requestId: string;
  amount: number | string;
  currency: string | null;
  serviceKind: string;
  paymentTitle: string;
  guestName?: string;
  staffName?: string;
  creatorStaffName?: string;
  tipId?: string;
};

export type PaymentRequestPaidRow = {
  id: string;
  status?: string;
  organization_id: string | null;
  created_by_staff_id: string | null;
  guest_id: string | null;
  title: string | null;
  amount: number | string;
  currency: string | null;
  service_kind: string | null;
  reference_type: string | null;
  reference_id: string | null;
  metadata: unknown;
};

function metaString(meta: unknown, key: string): string {
  if (typeof meta !== "object" || meta == null || Array.isArray(meta)) return "";
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === "string" ? v.trim() : "";
}

/** Ödeme kaydından admin bildirim gövdesi — referans türüne göre zenginleştirilir. */
export function buildAdminPaymentNotificationBody(
  row: PaymentRequestPaidRow,
  guestName: string,
  staffName?: string,
  creatorStaffName?: string
): string {
  const baseTitle = (row.title ?? "").trim() || "Ödeme alındı";
  const ref = row.reference_type ?? "";

  let body = baseTitle;

  if (ref === "guest_extra_order") {
    const roomNo = metaString(row.metadata, "room_number");
    const itemsSummary = metaString(row.metadata, "items_summary");
    if (roomNo) body = `Oda ${roomNo} · ${body}`;
    if (guestName) body += ` · ${guestName}`;
    if (itemsSummary) body += ` · ${itemsSummary}`;
  } else if (ref === "kitchen_menu_order") {
    const roomNo = metaString(row.metadata, "room_number");
    const tableNo = metaString(row.metadata, "table_number");
    const customerName = metaString(row.metadata, "customer_name");
    const itemsSummary = metaString(row.metadata, "items_summary");
    if (roomNo) body = `Oda ${roomNo} · ${body}`;
    else if (tableNo) body = `Masa ${tableNo} · ${body}`;
    if (customerName) body += ` · ${customerName}`;
    else if (guestName) body += ` · ${guestName}`;
    if (itemsSummary) body += ` · ${itemsSummary}`;
  } else {
    if (guestName) body += ` · Misafir: ${guestName}`;
    if (staffName) body += ` · Personel: ${staffName}`;
    if (creatorStaffName) body += ` · Kayıt: ${creatorStaffName}`;
  }

  return body;
}

async function adminPaymentAlreadyNotified(
  admin: SupabaseClient,
  requestId: string
): Promise<boolean> {
  const { count } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .in("notification_type", ["admin_payment_received", "admin_tip_payment"])
    .contains("data", { paymentRequestId: requestId });
  return (count ?? 0) > 0;
}

/** Organizasyon adminlerine ödeme alındı bildirimi — uygulama içi + push. */
export async function notifyOrgAdminsPayment(
  admin: SupabaseClient,
  supabaseUrl: string,
  serviceKey: string,
  opts: NotifyOrgAdminsPaymentOpts
): Promise<void> {
  if (await adminPaymentAlreadyNotified(admin, opts.requestId)) return;

  const lane = paymentLane(opts.serviceKind);
  const isTip = lane === "tips";
  const notificationType = isTip ? "admin_tip_payment" : "admin_payment_received";
  const featureKey = isTip ? "staff_tip" : "payment";
  const amountStr = amountLabel(opts.amount, opts.currency);
  const title = `Ödeme alındı · ${laneTitleTr(lane)} · ${amountStr}`;
  const body = opts.paymentTitle.trim() || "Ödeme tamamlandı";

  const pushData = {
    url: `/admin/payments/${opts.requestId}`,
    screen: "admin_payment_detail",
    paymentRequestId: opts.requestId,
    notificationType,
    feature_key: featureKey,
    lane,
    serviceKind: opts.serviceKind,
    amount: amountStr,
    ...(opts.tipId ? { tipId: opts.tipId } : {}),
  };

  const { data: admins } = await admin
    .from("staff")
    .select("id")
    .eq("role", "admin")
    .eq("is_active", true)
    .is("deleted_at", null)
    .or(`organization_id.eq.${opts.organizationId},organization_id.is.null`);

  if (!admins?.length) return;

  const now = new Date().toISOString();
  const rows = admins.map((a: { id: string }) => ({
    staff_id: a.id,
    title,
    body,
    notification_type: notificationType,
    category: "admin",
    data: pushData,
    sent_via: "both",
    sent_at: now,
  }));

  const { error: insErr } = await admin.from("notifications").insert(rows);
  if (insErr) {
    console.warn("notifyOrgAdminsPayment insert", insErr.message);
    return;
  }

  const adminIds = admins.map((a: { id: string }) => a.id);
  try {
    const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-expo-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        staffIds: adminIds,
        title,
        body,
        data: pushData,
      }),
    });
    if (!pushRes.ok) {
      const errText = await pushRes.text();
      console.warn("notifyOrgAdminsPayment push", errText.slice(0, 300));
    }
  } catch (e) {
    console.warn("notifyOrgAdminsPayment push exception", e);
  }
}
