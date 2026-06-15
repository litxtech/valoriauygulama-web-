import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type PaymentCreatorOutcome = "paid" | "failed" | "expired";

type PaymentRow = {
  id: string;
  created_by_staff_id: string | null;
  title: string | null;
  amount: number | string;
  currency: string | null;
  service_kind: string | null;
  status: string;
};

function amountLabel(amount: number | string, currency: string | null): string {
  const n = Number(amount);
  const cur = (currency ?? "try").toUpperCase();
  if (!Number.isFinite(n)) return cur;
  return `${n.toFixed(2)} ${cur}`;
}

function copyForOutcome(
  outcome: PaymentCreatorOutcome,
  paymentTitle: string,
  label: string
): { title: string; body: string; notificationType: string } {
  const name = paymentTitle.trim() || "Ödeme";
  if (outcome === "paid") {
    return {
      title: `Ödeme tamamlandı · ${label}`,
      body: name,
      notificationType: "payment_received",
    };
  }
  if (outcome === "expired") {
    return {
      title: `Ödeme süresi doldu · ${label}`,
      body: `${name} — link süresi bitti, tahsilat yapılmadı.`,
      notificationType: "payment_failed",
    };
  }
  return {
    title: `Ödeme tamamlanmadı · ${label}`,
    body: `${name} — ödeme başarısız veya iptal edildi.`,
    notificationType: "payment_failed",
  };
}

/** Stripe ile alınan ödemede linki oluşturan personele in-app + push bildirim */
export async function notifyPaymentCreator(
  admin: SupabaseClient,
  supabaseUrl: string,
  serviceKey: string,
  paymentRequestId: string,
  outcome: PaymentCreatorOutcome
): Promise<void> {
  const { data: row } = await admin
    .from("payment_requests")
    .select("id, created_by_staff_id, title, amount, currency, service_kind, status")
    .eq("id", paymentRequestId)
    .maybeSingle();

  if (!row?.created_by_staff_id) return;

  const typed = row as PaymentRow;
  const label = amountLabel(typed.amount, typed.currency);
  const paymentTitle = (typed.title ?? "").trim() || "Ödeme";
  const { title, body, notificationType } = copyForOutcome(outcome, paymentTitle, label);

  const pushData = {
    url: `/staff/payments/${paymentRequestId}`,
    screen: "staff_payment",
    paymentRequestId,
    notificationType,
    feature_key: "payment",
    paymentOutcome: outcome,
    serviceKind: typed.service_kind ?? undefined,
  };

  const { error: insErr } = await admin.from("notifications").insert({
    staff_id: typed.created_by_staff_id,
    title,
    body,
    notification_type: notificationType,
    category: "staff",
    data: pushData,
    sent_via: "both",
    sent_at: new Date().toISOString(),
  });
  if (insErr) {
    console.warn("notifyPaymentCreator insert", insErr.message);
    return;
  }

  try {
    const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-expo-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        staffIds: [typed.created_by_staff_id],
        title,
        body,
        data: pushData,
      }),
    });
    if (!pushRes.ok) {
      const errText = await pushRes.text();
      console.warn("notifyPaymentCreator push", errText.slice(0, 300));
    }
  } catch (e) {
    console.warn("notifyPaymentCreator push exception", e);
  }
}
