import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type Stripe from "npm:stripe@14.25.0";
import {
  guestTipRefundedNotif,
  parseTipNotifLang,
  staffTipRefundedNotif,
} from "./tipNotificationI18n.ts";

export type ApplyStaffTipRefundParams = {
  tipId?: string;
  paymentRequestId?: string;
  stripeRefundId?: string | null;
  refundedByStaffId?: string | null;
  skipNotifications?: boolean;
};

export type ApplyStaffTipRefundResult = {
  ok: boolean;
  skipped?: string;
  tipId?: string;
  paymentRequestId?: string;
};

export async function applyStaffTipRefund(
  admin: SupabaseClient,
  params: ApplyStaffTipRefundParams
): Promise<ApplyStaffTipRefundResult> {
  let tipId = params.tipId?.trim() || null;
  let paymentRequestId = params.paymentRequestId?.trim() || null;

  if (!tipId && !paymentRequestId) {
    return { ok: false, skipped: "missing_ids" };
  }

  if (!tipId && paymentRequestId) {
    const { data: payRow } = await admin
      .from("payment_requests")
      .select("reference_type, reference_id")
      .eq("id", paymentRequestId)
      .maybeSingle();
    if (payRow?.reference_type === "staff_tip" && payRow.reference_id) {
      tipId = payRow.reference_id as string;
    }
  }

  if (!tipId) {
    return { ok: false, skipped: "tip_not_found" };
  }

  const { data: tipRow } = await admin
    .from("staff_tips")
    .select("id, staff_id, guest_id, amount, currency, status, payment_method, payment_request_id, stripe_refund_id")
    .eq("id", tipId)
    .maybeSingle();

  if (!tipRow?.id) {
    return { ok: false, skipped: "tip_not_found" };
  }

  if (tipRow.status === "refunded") {
    return { ok: true, skipped: "already_refunded", tipId, paymentRequestId: paymentRequestId ?? tipRow.payment_request_id };
  }

  if (tipRow.status !== "confirmed" || tipRow.payment_method !== "stripe_card") {
    return { ok: false, skipped: "not_refundable" };
  }

  paymentRequestId = paymentRequestId ?? (tipRow.payment_request_id as string | null);
  if (!paymentRequestId) {
    return { ok: false, skipped: "payment_request_missing" };
  }

  const { data: payRow } = await admin
    .from("payment_requests")
    .select("id, status, amount, currency, metadata, title")
    .eq("id", paymentRequestId)
    .maybeSingle();

  if (!payRow?.id || payRow.status === "refunded") {
    if (payRow?.status === "refunded" && tipRow.status !== "refunded") {
      await admin
        .from("staff_tips")
        .update({
          status: "refunded",
          refunded_at: new Date().toISOString(),
          stripe_refund_id: params.stripeRefundId ?? tipRow.stripe_refund_id,
          refunded_by_staff_id: params.refundedByStaffId ?? null,
        })
        .eq("id", tipId);
    }
    return { ok: true, skipped: payRow?.status === "refunded" ? "already_refunded" : "payment_not_paid", tipId, paymentRequestId };
  }

  if (payRow.status !== "paid") {
    return { ok: false, skipped: "payment_not_paid" };
  }

  const now = new Date().toISOString();
  const refundId = params.stripeRefundId?.trim() || tipRow.stripe_refund_id || null;

  await admin
    .from("staff_tips")
    .update({
      status: "refunded",
      refunded_at: now,
      stripe_refund_id: refundId,
      refunded_by_staff_id: params.refundedByStaffId ?? null,
    })
    .eq("id", tipId);

  await admin
    .from("payment_requests")
    .update({
      status: "refunded",
      refunded_at: now,
      stripe_refund_id: refundId,
    })
    .eq("id", paymentRequestId);

  if (!params.skipNotifications) {
    const tipAmount = `${Number(tipRow.amount).toFixed(0)} ${String(tipRow.currency ?? payRow.currency ?? "TRY").toUpperCase()}`;

    const [{ data: staffRow }, { data: guestRow }] = await Promise.all([
      admin.from("staff").select("full_name").eq("id", tipRow.staff_id).maybeSingle(),
      admin.from("guests").select("contract_lang, full_name").eq("id", tipRow.guest_id).maybeSingle(),
    ]);

    const staffName = (staffRow?.full_name as string | null)?.trim() || "";
    const metaLang =
      typeof payRow.metadata === "object" && payRow.metadata != null && !Array.isArray(payRow.metadata)
        ? (payRow.metadata as Record<string, unknown>).lang
        : null;
    const guestLang = parseTipNotifLang(
      (typeof metaLang === "string" ? metaLang : null) ??
        (guestRow?.contract_lang as string | null) ??
        null
    );

    const staffNotif = staffTipRefundedNotif("tr", tipAmount);
    const guestNotif = guestTipRefundedNotif(guestLang, tipAmount, staffName);

    await admin.from("notifications").insert({
      staff_id: tipRow.staff_id,
      guest_id: tipRow.guest_id,
      title: staffNotif.title,
      body: staffNotif.body,
      notification_type: "staff_tip_refunded",
      category: "staff",
      data: {
        url: "/staff/tips",
        screen: "staff_tips",
        tipId,
        paymentRequestId,
        notificationType: "staff_tip_refunded",
      },
    });

    await admin.from("notifications").insert({
      guest_id: tipRow.guest_id,
      staff_id: tipRow.staff_id,
      title: guestNotif.title,
      body: guestNotif.body,
      notification_type: "guest_tip_refunded",
      category: "guest",
      sent_via: "in_app",
      sent_at: now,
      data: {
        url: "/customer/tips",
        screen: "guest_tips",
        tipId,
        paymentRequestId,
        notificationType: "guest_tip_refunded",
      },
    });

    await admin.from("notifications").insert(
      (
        await admin
          .from("staff")
          .select("id")
          .eq("role", "admin")
          .eq("is_active", true)
          .is("deleted_at", null)
      ).data?.map((a: { id: string }) => ({
        staff_id: a.id,
        title: `Bahşiş iadesi · ${tipAmount}`,
        body: (payRow.title as string)?.trim() || "Stripe bahşiş iadesi tamamlandı",
        notification_type: "staff_tip_refunded",
        category: "admin",
        data: { url: "/admin/tips", screen: "admin_tips", tipId, paymentRequestId },
      })) ?? []
    );
  }

  return { ok: true, tipId, paymentRequestId };
}

type PaymentRequestRefundRow = {
  id: string;
  reference_type: string | null;
  reference_id: string | null;
  status: string;
};

export async function findPaymentRequestForPaymentIntent(
  admin: SupabaseClient,
  stripe: Stripe,
  paymentIntentId: string
): Promise<PaymentRequestRefundRow | null> {
  const { data: direct } = await admin
    .from("payment_requests")
    .select("id, reference_type, reference_id, status")
    .eq("provider_payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (direct?.id) return direct as PaymentRequestRefundRow;

  const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
  const sessionId = sessions.data[0]?.id;
  if (!sessionId) return null;

  const { data: bySession } = await admin
    .from("payment_requests")
    .select("id, reference_type, reference_id, status")
    .eq("provider_session_id", sessionId)
    .maybeSingle();

  if (bySession?.id) {
    await admin
      .from("payment_requests")
      .update({ provider_payment_intent_id: paymentIntentId })
      .eq("id", bySession.id);
    return bySession as PaymentRequestRefundRow;
  }

  return null;
}
