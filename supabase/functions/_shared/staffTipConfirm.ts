import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  guestTipPaidNotif,
  parseTipNotifLang,
  staffTipReceivedNotif,
} from "./tipNotificationI18n.ts";

export type PaymentRequestTipRow = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  title: string;
  metadata: unknown;
  reference_type: string | null;
  reference_id: string | null;
  provider_session_id?: string | null;
  provider_payment_intent_id?: string | null;
};

export async function applyStaffTipPaymentConfirmed(
  admin: SupabaseClient,
  params: {
    paymentRequestId: string;
    paymentRow: PaymentRequestTipRow;
    skipNotifications?: boolean;
  }
): Promise<{ ok: boolean; skipped?: string; tipId?: string }> {
  const { paymentRequestId, paymentRow } = params;

  if (paymentRow.reference_type !== "staff_tip" || !paymentRow.reference_id) {
    return { ok: false, skipped: "not_staff_tip" };
  }

  const tipId = paymentRow.reference_id as string;
  const { data: tipRow } = await admin
    .from("staff_tips")
    .select("id, staff_id, guest_id, amount, status")
    .eq("id", tipId)
    .maybeSingle();

  if (!tipRow?.id) return { ok: false, skipped: "tip_not_found" };
  if (tipRow.status === "confirmed") return { ok: true, skipped: "already_confirmed", tipId };
  if (tipRow.status !== "pending") return { ok: false, skipped: "tip_not_pending" };

  const now = new Date().toISOString();

  await admin
    .from("staff_tips")
    .update({
      status: "confirmed",
      confirmed_at: now,
      payment_request_id: paymentRequestId,
    })
    .eq("id", tipId);

  if (!params.skipNotifications) {
    const tipAmount = `${Number(tipRow.amount).toFixed(0)} ${String(paymentRow.currency).toUpperCase()}`;

    const [{ data: staffRow }, { data: guestRow }] = await Promise.all([
      admin.from("staff").select("full_name").eq("id", tipRow.staff_id).maybeSingle(),
      admin.from("guests").select("contract_lang").eq("id", tipRow.guest_id).maybeSingle(),
    ]);

    const staffName = (staffRow?.full_name as string | null)?.trim() || "";
    const metaLang =
      typeof paymentRow.metadata === "object" && paymentRow.metadata != null && !Array.isArray(paymentRow.metadata)
        ? (paymentRow.metadata as Record<string, unknown>).lang
        : null;
    const guestLang = parseTipNotifLang(
      (typeof metaLang === "string" ? metaLang : null) ??
        (guestRow?.contract_lang as string | null) ??
        null
    );
    const staffNotif = staffTipReceivedNotif("tr", tipAmount);
    const guestNotif = guestTipPaidNotif(guestLang, tipAmount, staffName);

    await admin.from("notifications").insert({
      staff_id: tipRow.staff_id,
      guest_id: tipRow.guest_id,
      title: staffNotif.title,
      body: staffNotif.body,
      notification_type: "staff_tip",
      category: "staff",
      data: {
        url: "/staff/tips",
        screen: "staff_tips",
        tipId,
        paymentRequestId,
        notificationType: "staff_tip",
      },
    });

    await admin.from("notifications").insert({
      guest_id: tipRow.guest_id,
      staff_id: tipRow.staff_id,
      title: guestNotif.title,
      body: guestNotif.body,
      notification_type: "guest_tip_paid",
      category: "guest",
      sent_via: "in_app",
      sent_at: now,
      data: {
        url: "/customer/tips",
        screen: "guest_tips",
        tipId,
        paymentRequestId,
        notificationType: "guest_tip_paid",
      },
    });
  }

  return { ok: true, tipId };
}
