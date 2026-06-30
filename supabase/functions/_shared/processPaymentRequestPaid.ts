import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifyPaymentCreator } from "./notifyPaymentCreator.ts";
import {
  buildAdminPaymentNotificationBody,
  notifyOrgAdminsPayment,
  type PaymentRequestPaidRow,
} from "./notifyOrgAdminsPayment.ts";
import { notifyKitchenMenuOrderPaid } from "./notifyKitchenMenuOrderPaid.ts";
import {
  guestTipPaidNotif,
  parseTipNotifLang,
  staffTipReceivedNotif,
} from "./tipNotificationI18n.ts";

type ProcessPaidContext = {
  admin: SupabaseClient;
  supabaseUrl: string;
  serviceKey: string;
  requestId: string;
  sessionId?: string | null;
  paymentIntentId?: string | null;
};

async function loadPaymentRow(
  admin: SupabaseClient,
  requestId: string
): Promise<PaymentRequestPaidRow | null> {
  const { data: row } = await admin
    .from("payment_requests")
    .select(
      "id, status, organization_id, created_by_staff_id, guest_id, title, description, amount, currency, service_kind, reference_type, reference_id, metadata"
    )
    .eq("id", requestId)
    .maybeSingle();
  return (row as PaymentRequestPaidRow | null) ?? null;
}

async function markPaymentPaid(
  admin: SupabaseClient,
  requestId: string,
  sessionId?: string | null,
  paymentIntentId?: string | null
): Promise<boolean> {
  const { data: row } = await admin
    .from("payment_requests")
    .select("id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (!row || row.status === "paid") return false;

  await admin
    .from("payment_requests")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      ...(sessionId ? { provider_session_id: sessionId } : {}),
      ...(paymentIntentId ? { provider_payment_intent_id: paymentIntentId } : {}),
    })
    .eq("id", requestId);

  return true;
}

async function resolvePaymentPartyNames(
  admin: SupabaseClient,
  row: PaymentRequestPaidRow
): Promise<{ guestName: string; creatorStaffName: string; staffName: string }> {
  let guestName = "";
  let creatorStaffName = "";
  let staffName = "";

  const lookups: Promise<void>[] = [];

  if (row.guest_id) {
    lookups.push(
      admin
        .from("guests")
        .select("full_name")
        .eq("id", row.guest_id)
        .maybeSingle()
        .then(({ data: g }) => {
          guestName = ((g?.full_name as string) ?? "").trim();
        })
    );
  }

  if (row.created_by_staff_id) {
    lookups.push(
      admin
        .from("staff")
        .select("full_name")
        .eq("id", row.created_by_staff_id)
        .maybeSingle()
        .then(({ data: s }) => {
          creatorStaffName = ((s?.full_name as string) ?? "").trim();
        })
    );
  }

  if (row.reference_type === "staff_tip" && row.reference_id) {
    lookups.push(
      admin
        .from("staff_tips")
        .select("staff_id")
        .eq("id", row.reference_id)
        .maybeSingle()
        .then(async ({ data: tip }) => {
          if (!tip?.staff_id) return;
          const { data: s } = await admin
            .from("staff")
            .select("full_name")
            .eq("id", tip.staff_id)
            .maybeSingle();
          staffName = ((s?.full_name as string) ?? "").trim();
        })
    );
  }

  if (row.reference_type === "qr_stand" && row.reference_id && !row.created_by_staff_id) {
    lookups.push(
      admin
        .from("payment_qr_stands")
        .select("created_by_staff_id")
        .eq("id", row.reference_id)
        .maybeSingle()
        .then(async ({ data: stand }) => {
          if (!stand?.created_by_staff_id) return;
          const { data: s } = await admin
            .from("staff")
            .select("full_name")
            .eq("id", stand.created_by_staff_id)
            .maybeSingle();
          creatorStaffName = ((s?.full_name as string) ?? "").trim();
        })
    );
  }

  await Promise.all(lookups);
  return { guestName, creatorStaffName, staffName };
}

async function notifyAdminsForPaidPayment(
  ctx: ProcessPaidContext,
  row: PaymentRequestPaidRow,
  names: { guestName: string; creatorStaffName: string; staffName: string },
  tipId?: string
): Promise<void> {
  if (!row.organization_id) return;

  const adminBody = buildAdminPaymentNotificationBody(
    row,
    names.guestName,
    names.staffName || undefined,
    names.creatorStaffName || undefined
  );

  await notifyOrgAdminsPayment(ctx.admin, ctx.supabaseUrl, ctx.serviceKey, {
    organizationId: row.organization_id as string,
    requestId: ctx.requestId,
    amount: row.amount,
    currency: row.currency,
    serviceKind: (row.service_kind as string) ?? "generic",
    paymentTitle: adminBody,
    guestName: names.guestName || undefined,
    staffName: names.staffName || undefined,
    creatorStaffName: names.creatorStaffName || undefined,
    tipId,
    qrStandId:
      row.reference_type === "qr_stand" && row.reference_id
        ? String(row.reference_id)
        : undefined,
  });
}

/**
 * payment_requests → paid sonrası tüm yan etkiler:
 * muhasebe, oluşturucu bildirimi, referans güncellemeleri, admin bildirimi.
 * Idempotent — zaten paid ise yan etkiler atlanır (admin bildirimi kendi içinde korunur).
 */
export async function processPaymentRequestPaid(ctx: ProcessPaidContext): Promise<{ processed: boolean }> {
  const wasUpdated = await markPaymentPaid(
    ctx.admin,
    ctx.requestId,
    ctx.sessionId,
    ctx.paymentIntentId
  );

  const row = await loadPaymentRow(ctx.admin, ctx.requestId);
  if (!row || row.status !== "paid") {
    return { processed: false };
  }

  if (wasUpdated) {
    try {
      if (row.service_kind === "breakfast_partner") {
        await ctx.admin.rpc("record_breakfast_partner_stripe_payment", { p_request_id: ctx.requestId });
      } else {
        await ctx.admin.rpc("record_stripe_payment_income", { p_request_id: ctx.requestId });
      }
    } catch (ledgerErr) {
      console.warn("stripe payment ledger", ledgerErr);
    }

    await notifyPaymentCreator(ctx.admin, ctx.supabaseUrl, ctx.serviceKey, ctx.requestId, "paid");
  }

  const names = await resolvePaymentPartyNames(ctx.admin, row);

  if (row.reference_type === "staff_tip" && row.reference_id) {
    const { data: tipRow } = await ctx.admin
      .from("staff_tips")
      .select("id, staff_id, guest_id, amount, status")
      .eq("id", row.reference_id)
      .maybeSingle();

    if (tipRow && tipRow.status === "pending") {
      await ctx.admin
        .from("staff_tips")
        .update({
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
          payment_request_id: ctx.requestId,
        })
        .eq("id", tipRow.id);

      const tipAmount = `${Number(tipRow.amount).toFixed(0)} ${String(row.currency).toUpperCase()}`;

      const [{ data: staffRow }, { data: guestRow }] = await Promise.all([
        ctx.admin.from("staff").select("full_name").eq("id", tipRow.staff_id).maybeSingle(),
        ctx.admin.from("guests").select("contract_lang").eq("id", tipRow.guest_id).maybeSingle(),
      ]);

      const tipStaffName = (staffRow?.full_name as string | null)?.trim() || names.staffName;
      const metaLang =
        typeof row.metadata === "object" && row.metadata != null && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>).lang
          : null;
      const guestLang = parseTipNotifLang(
        (typeof metaLang === "string" ? metaLang : null) ??
          (guestRow?.contract_lang as string | null) ??
          null
      );
      const staffNotif = staffTipReceivedNotif("tr", tipAmount);
      const guestNotif = guestTipPaidNotif(guestLang, tipAmount, tipStaffName);

      await ctx.admin.from("notifications").insert({
        staff_id: tipRow.staff_id,
        guest_id: tipRow.guest_id,
        title: staffNotif.title,
        body: staffNotif.body,
        notification_type: "staff_tip",
        category: "staff",
        data: {
          url: "/staff/tips",
          screen: "staff_tips",
          tipId: tipRow.id,
          paymentRequestId: ctx.requestId,
          notificationType: "staff_tip",
        },
      });

      await ctx.admin.from("notifications").insert({
        guest_id: tipRow.guest_id,
        staff_id: tipRow.staff_id,
        title: guestNotif.title,
        body: guestNotif.body,
        notification_type: "guest_tip_paid",
        category: "guest",
        sent_via: "in_app",
        sent_at: new Date().toISOString(),
        data: {
          url: "/customer/tips",
          screen: "guest_tips",
          tipId: tipRow.id,
          paymentRequestId: ctx.requestId,
          notificationType: "guest_tip_paid",
        },
      });
    }

    await notifyAdminsForPaidPayment(ctx, row, names, row.reference_id as string);
  } else {
    await notifyAdminsForPaidPayment(ctx, row, names);
  }

  if (row.reference_type === "guest_service_request" && row.reference_id) {
    await ctx.admin
      .from("guest_service_requests")
      .update({ payment_request_id: ctx.requestId, status: "completed", handled_at: new Date().toISOString() })
      .eq("id", row.reference_id)
      .eq("status", "pending");
  }

  if (row.reference_type === "room_service_order" && row.reference_id) {
    await ctx.admin
      .from("room_service_orders")
      .update({ payment_request_id: ctx.requestId, status: "confirmed" })
      .eq("id", row.reference_id);
  }

  if (row.reference_type === "guest_extra_order" && row.reference_id) {
    await ctx.admin
      .from("guest_extra_orders")
      .update({ status: "paid", paid_at: new Date().toISOString(), payment_request_id: ctx.requestId })
      .eq("id", row.reference_id)
      .in("status", ["pending_payment"]);
  }

  if (row.reference_type === "kitchen_menu_order" && row.reference_id) {
    await ctx.admin
      .from("kitchen_menu_orders")
      .update({ status: "paid", paid_at: new Date().toISOString(), payment_request_id: ctx.requestId })
      .eq("id", row.reference_id)
      .in("status", ["pending_payment"]);
    await notifyKitchenMenuOrderPaid(ctx.admin, ctx.supabaseUrl, row.reference_id as string, ctx.requestId);
  }

  return { processed: true };
}
