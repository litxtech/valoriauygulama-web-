// Stripe webhook — checkout.session.completed → payment_requests paid
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripe, stripeWebhookSecret } from "../_shared/stripeClient.ts";
import {
  applyStaffTipRefund,
  findPaymentRequestForPaymentIntent,
} from "../_shared/staffTipRefund.ts";
import {
  guestTipPaidNotif,
  parseTipNotifLang,
  staffTipReceivedNotif,
} from "../_shared/tipNotificationI18n.ts";
import { notifyPaymentCreator } from "../_shared/notifyPaymentCreator.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

function paymentLane(serviceKind: string): "tips" | "kitchen" | "hotel" {
  if (serviceKind === "staff_tip") return "tips";
  if (serviceKind === "food" || serviceKind === "dining") return "kitchen";
  return "hotel";
}

function laneTitleTr(lane: "tips" | "kitchen" | "hotel"): string {
  if (lane === "tips") return "Bahşiş";
  if (lane === "kitchen") return "Mutfak ödemesi";
  return "Otel ödemesi";
}

async function notifyOrgAdminsPayment(
  admin: ReturnType<typeof createClient>,
  opts: {
    organizationId: string;
    requestId: string;
    amountLabel: string;
    serviceKind: string;
    paymentTitle: string;
    guestName?: string;
    staffName?: string;
    tipId?: string;
  }
) {
  const lane = paymentLane(opts.serviceKind);
  const isTip = lane === "tips";
  let body = opts.paymentTitle.trim() || "Ödeme tamamlandı";
  if (opts.guestName) body += ` · Misafir: ${opts.guestName}`;
  if (opts.staffName) body += ` · Personel: ${opts.staffName}`;

  const { data: admins } = await admin
    .from("staff")
    .select("id")
    .eq("role", "admin")
    .eq("is_active", true)
    .is("deleted_at", null)
    .or(`organization_id.eq.${opts.organizationId},organization_id.is.null`);

  if (!admins?.length) return;

  const title = `${laneTitleTr(lane)} · ${opts.amountLabel}`;
  const rows = admins.map((a: { id: string }) => ({
    staff_id: a.id,
    title,
    body,
    notification_type: isTip ? "admin_tip_payment" : "admin_payment_received",
    category: "admin",
    data: {
      url: `/admin/payments/${opts.requestId}`,
      screen: "admin_payment_detail",
      paymentRequestId: opts.requestId,
      lane,
      serviceKind: opts.serviceKind,
      ...(opts.tipId ? { tipId: opts.tipId } : {}),
    },
  }));

  await admin.from("notifications").insert(rows);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new Response(JSON.stringify({ error: "stripe-signature gerekli" }), { status: 400 });
  }

  const rawBody = await req.text();
  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, sig, stripeWebhookSecret());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: `Webhook imza hatası: ${msg}` }), { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as {
      id: string;
      payment_status?: string;
      payment_intent?: string | { id: string } | null;
      metadata?: Record<string, string>;
      receipt_url?: string | null;
    };

    const requestId = session.metadata?.payment_request_id;
    if (!requestId) {
      return new Response(JSON.stringify({ received: true, skipped: "no payment_request_id" }), { status: 200 });
    }

    if (session.payment_status && session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
      return new Response(JSON.stringify({ received: true, skipped: session.payment_status }), { status: 200 });
    }

    const { data: row } = await admin
      .from("payment_requests")
      .select(
        "id, status, organization_id, created_by_staff_id, guest_id, title, amount, currency, service_kind, reference_type, reference_id, metadata"
      )
      .eq("id", requestId)
      .maybeSingle();

    if (!row || row.status === "paid") {
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    const rawPi = session.payment_intent;
    const paymentIntentId = typeof rawPi === "string" ? rawPi : rawPi?.id ?? null;

    await admin
      .from("payment_requests")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        provider_session_id: session.id,
        provider_payment_intent_id: paymentIntentId,
      })
      .eq("id", requestId);

    const amountLabel = `${Number(row.amount).toFixed(2)} ${String(row.currency).toUpperCase()}`;
    const paymentTitle = (row.title as string)?.trim() || "Ödeme tamamlandı";

    try {
      await admin.rpc("record_stripe_payment_income", { p_request_id: requestId });
    } catch (ledgerErr) {
      console.warn("record_stripe_payment_income", ledgerErr);
    }

    await notifyPaymentCreator(admin, supabaseUrl, serviceKey, requestId, "paid");

    let guestNameForAdmin = "";
    if (row.guest_id) {
      const { data: g } = await admin.from("guests").select("full_name").eq("id", row.guest_id).maybeSingle();
      guestNameForAdmin = ((g?.full_name as string) ?? "").trim();
    }

    // Opsiyonel referans güncellemeleri
    if (row.reference_type === "staff_tip" && row.reference_id) {
      const { data: tipRow } = await admin
        .from("staff_tips")
        .select("id, staff_id, guest_id, amount, status")
        .eq("id", row.reference_id)
        .maybeSingle();

      if (tipRow && tipRow.status === "pending") {
        await admin
          .from("staff_tips")
          .update({
            status: "confirmed",
            confirmed_at: new Date().toISOString(),
            payment_request_id: requestId,
          })
          .eq("id", tipRow.id);

        const tipAmount = `${Number(tipRow.amount).toFixed(0)} ${String(row.currency).toUpperCase()}`;

        const [{ data: staffRow }, { data: guestRow }] = await Promise.all([
          admin.from("staff").select("full_name").eq("id", tipRow.staff_id).maybeSingle(),
          admin.from("guests").select("contract_lang").eq("id", tipRow.guest_id).maybeSingle(),
        ]);

        const staffName = (staffRow?.full_name as string | null)?.trim() || "";
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
            tipId: tipRow.id,
            paymentRequestId: requestId,
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
          sent_at: new Date().toISOString(),
          data: {
            url: "/customer/tips",
            screen: "guest_tips",
            tipId: tipRow.id,
            paymentRequestId: requestId,
            notificationType: "guest_tip_paid",
          },
        });

        if (row.organization_id) {
          await notifyOrgAdminsPayment(admin, {
            organizationId: row.organization_id as string,
            requestId,
            amountLabel: tipAmount,
            serviceKind: row.service_kind as string,
            paymentTitle: (row.title as string)?.trim() || "Misafir bahşişi ödedi",
            guestName: guestNameForAdmin || undefined,
            staffName: staffName || undefined,
            tipId: tipRow.id as string,
          });
        }
      }
    } else if (row.organization_id && row.reference_type !== "guest_extra_order" && row.reference_type !== "kitchen_menu_order") {
      await notifyOrgAdminsPayment(admin, {
        organizationId: row.organization_id as string,
        requestId,
        amountLabel,
        serviceKind: row.service_kind as string,
        paymentTitle,
        guestName: guestNameForAdmin || undefined,
      });
    }
    if (row.reference_type === "guest_service_request" && row.reference_id) {
      await admin
        .from("guest_service_requests")
        .update({ payment_request_id: requestId, status: "completed", handled_at: new Date().toISOString() })
        .eq("id", row.reference_id)
        .eq("status", "pending");
    }
    if (row.reference_type === "room_service_order" && row.reference_id) {
      await admin.from("room_service_orders").update({ payment_request_id: requestId, status: "confirmed" }).eq("id", row.reference_id);
    }
    if (row.reference_type === "guest_extra_order" && row.reference_id) {
      await admin
        .from("guest_extra_orders")
        .update({ status: "paid", paid_at: new Date().toISOString(), payment_request_id: requestId })
        .eq("id", row.reference_id)
        .in("status", ["pending_payment"]);

      const meta =
        typeof row.metadata === "object" && row.metadata != null && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      const roomNo = typeof meta.room_number === "string" ? meta.room_number.trim() : "";
      const itemsSummary = typeof meta.items_summary === "string" ? meta.items_summary.trim() : "";
      let adminBody = paymentTitle;
      if (roomNo) adminBody = `Oda ${roomNo} · ${adminBody}`;
      if (guestNameForAdmin) adminBody += ` · ${guestNameForAdmin}`;
      if (itemsSummary) adminBody += ` · ${itemsSummary}`;

      if (row.organization_id) {
        await notifyOrgAdminsPayment(admin, {
          organizationId: row.organization_id as string,
          requestId,
          amountLabel,
          serviceKind: row.service_kind as string,
          paymentTitle: adminBody,
          guestName: guestNameForAdmin || undefined,
        });
      }
    }
    if (row.reference_type === "kitchen_menu_order" && row.reference_id) {
      await admin
        .from("kitchen_menu_orders")
        .update({ status: "paid", paid_at: new Date().toISOString(), payment_request_id: requestId })
        .eq("id", row.reference_id)
        .in("status", ["pending_payment"]);

      const meta =
        typeof row.metadata === "object" && row.metadata != null && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      const roomNo = typeof meta.room_number === "string" ? meta.room_number.trim() : "";
      const tableNo = typeof meta.table_number === "string" ? meta.table_number.trim() : "";
      const customerName =
        typeof meta.customer_name === "string" ? meta.customer_name.trim() : "";
      const itemsSummary = typeof meta.items_summary === "string" ? meta.items_summary.trim() : "";
      let adminBody = paymentTitle;
      if (roomNo) adminBody = `Room ${roomNo} · ${adminBody}`;
      else if (tableNo) adminBody = `Table ${tableNo} · ${adminBody}`;
      if (customerName) adminBody += ` · ${customerName}`;
      if (itemsSummary) adminBody += ` · ${itemsSummary}`;

      if (row.organization_id) {
        await notifyOrgAdminsPayment(admin, {
          organizationId: row.organization_id as string,
          requestId,
          amountLabel,
          serviceKind: row.service_kind as string,
          paymentTitle: adminBody,
          guestName: customerName || guestNameForAdmin || undefined,
        });
      }
    }
  }

  if (
    event.type === "checkout.session.expired" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    const session = event.data.object as { metadata?: Record<string, string> };
    const requestId = session.metadata?.payment_request_id;
    if (requestId) {
      const { data: payRow } = await admin
        .from("payment_requests")
        .select("reference_type, reference_id, status")
        .eq("id", requestId)
        .maybeSingle();

      const nextStatus = event.type === "checkout.session.expired" ? "expired" : "failed";
      const outcome = event.type === "checkout.session.expired" ? "expired" : "failed";

      await admin
        .from("payment_requests")
        .update({ status: nextStatus })
        .eq("id", requestId)
        .eq("status", "pending");

      if (payRow?.reference_type === "staff_tip" && payRow.reference_id) {
        await admin
          .from("staff_tips")
          .update({ status: "cancelled" })
          .eq("id", payRow.reference_id)
          .eq("status", "pending");
      }
      if (payRow?.reference_type === "guest_extra_order" && payRow.reference_id) {
        await admin
          .from("guest_extra_orders")
          .update({ status: nextStatus === "expired" ? "expired" : "cancelled" })
          .eq("id", payRow.reference_id)
          .eq("status", "pending_payment");
      }
      if (payRow?.reference_type === "kitchen_menu_order" && payRow.reference_id) {
        await admin
          .from("kitchen_menu_orders")
          .update({ status: nextStatus === "expired" ? "expired" : "cancelled" })
          .eq("id", payRow.reference_id)
          .eq("status", "pending_payment");
      }

      if (payRow?.status === "pending") {
        await notifyPaymentCreator(admin, supabaseUrl, serviceKey, requestId, outcome);
      }
    }
  }

  if (event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as {
      metadata?: Record<string, string>;
      payment_intent?: string | { id: string } | null;
      id: string;
    };
    const requestId = session.metadata?.payment_request_id;
    if (requestId) {
      const { data: row } = await admin
        .from("payment_requests")
        .select("id, status")
        .eq("id", requestId)
        .maybeSingle();

      if (row && row.status !== "paid") {
        const rawPi = session.payment_intent;
        const paymentIntentId = typeof rawPi === "string" ? rawPi : rawPi?.id ?? null;
        await admin
          .from("payment_requests")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            provider_session_id: session.id,
            provider_payment_intent_id: paymentIntentId,
          })
          .eq("id", requestId);

        try {
          await admin.rpc("record_stripe_payment_income", { p_request_id: requestId });
        } catch (ledgerErr) {
          console.warn("record_stripe_payment_income async", ledgerErr);
        }

        await notifyPaymentCreator(admin, supabaseUrl, serviceKey, requestId, "paid");
      }
    }
  }

  if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object as { id?: string };
    const paymentIntentId = intent.id;
    if (paymentIntentId) {
      const stripe = getStripe();
      const payRow = await findPaymentRequestForPaymentIntent(admin, stripe, paymentIntentId);
      if (payRow?.id && payRow.status === "pending") {
        await admin
          .from("payment_requests")
          .update({ status: "failed" })
          .eq("id", payRow.id)
          .eq("status", "pending");

        await notifyPaymentCreator(admin, supabaseUrl, serviceKey, payRow.id, "failed");
      }
    }
  }

  if (event.type === "charge.refunded" || event.type === "refund.updated") {
    const stripe = getStripe();
    let paymentIntentId: string | null = null;
    let refundId: string | null = null;

    if (event.type === "charge.refunded") {
      const charge = event.data.object as {
        payment_intent?: string | { id: string } | null;
        refunds?: { data?: Array<{ id?: string }> };
      };
      const rawPi = charge.payment_intent;
      paymentIntentId = typeof rawPi === "string" ? rawPi : rawPi?.id ?? null;
      refundId = charge.refunds?.data?.[0]?.id ?? null;
    } else {
      const refund = event.data.object as {
        status?: string;
        payment_intent?: string | { id: string } | null;
        id?: string;
      };
      if (refund.status !== "succeeded") {
        return new Response(JSON.stringify({ received: true, skipped: refund.status }), { status: 200 });
      }
      const rawPi = refund.payment_intent;
      paymentIntentId = typeof rawPi === "string" ? rawPi : rawPi?.id ?? null;
      refundId = refund.id ?? null;
    }

    if (paymentIntentId) {
      const payRow = await findPaymentRequestForPaymentIntent(admin, stripe, paymentIntentId);
      if (payRow?.reference_type === "staff_tip" && payRow.reference_id && payRow.status === "paid") {
        await applyStaffTipRefund(admin, {
          tipId: payRow.reference_id as string,
          paymentRequestId: payRow.id,
          stripeRefundId: refundId,
        });
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
