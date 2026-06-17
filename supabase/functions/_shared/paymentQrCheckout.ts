import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  defaultPaymentCurrency,
  getStripe,
  paymentCancelUrl,
  paymentSuccessUrl,
  toStripeMinorUnits,
} from "./stripeClient.ts";
import { stripeProductName } from "./paymentLinkPage.ts";

type OrgBrand = { name?: string | null; finance_report_brand?: string | null } | null;

export type QrStandRow = {
  id: string;
  organization_id: string;
  amount: number | null;
  currency: string | null;
  title: string;
  description: string | null;
  service_kind: string | null;
  public_token: string;
  amount_mode?: string | null;
  created_by_staff_id?: string | null;
  organizations?: OrgBrand;
};

export const QR_VARIABLE_MIN_AMOUNT = 10;
export const QR_VARIABLE_MAX_AMOUNT = 500000;

export function parseQrPaymentAmount(raw: unknown): number | null {
  const amount = Number(raw);
  if (!Number.isFinite(amount)) return null;
  const rounded = Math.round(amount * 100) / 100;
  if (rounded < QR_VARIABLE_MIN_AMOUNT || rounded > QR_VARIABLE_MAX_AMOUNT) return null;
  return rounded;
}

export async function createQrStandCheckout(
  admin: SupabaseClient,
  stand: QrStandRow,
  amount: number
): Promise<{ payUrl: string; paymentId: string } | { error: string }> {
  const currency = (stand.currency ?? defaultPaymentCurrency()).toLowerCase();
  const title = String(stand.title);
  const serviceKind = String(stand.service_kind ?? "generic");
  const org = stand.organizations ?? null;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const amountMode = stand.amount_mode === "variable" ? "standing_variable" : "standing";

  const { data: paymentRow, error: payErr } = await admin
    .from("payment_requests")
    .insert({
      organization_id: stand.organization_id,
      amount: Math.round(amount * 100) / 100,
      currency,
      title,
      description: stand.description,
      service_kind: serviceKind,
      reference_type: "qr_stand",
      reference_id: stand.id,
      created_by_staff_id: stand.created_by_staff_id ?? null,
      metadata: {
        qr_stand_id: stand.id,
        qr_stand_token: stand.public_token,
        qr_mode: amountMode,
        customer_entered_amount: stand.amount_mode === "variable",
      },
      expires_at: expiresAt,
      status: "pending",
      provider: "stripe",
    })
    .select("id, public_token")
    .single();

  if (payErr || !paymentRow?.id) {
    return { error: payErr?.message ?? "Ödeme başlatılamadı" };
  }

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
            unit_amount: toStripeMinorUnits(amount, currency),
            product_data: {
              name: stripeProductName(title, org),
              description: (stand.description ?? serviceKind).slice(0, 500),
            },
          },
        },
      ],
      metadata: {
        payment_request_id: paymentRow.id,
        organization_id: stand.organization_id,
        service_kind: serviceKind,
        qr_stand_id: stand.id,
        public_token: paymentRow.public_token,
      },
      expires_at: Math.floor(new Date(expiresAt).getTime() / 1000),
    });

    const payUrl = session.url;
    if (!payUrl) {
      await admin.from("payment_requests").update({ status: "failed" }).eq("id", paymentRow.id);
      return { error: "Stripe oturumu oluşturulamadı" };
    }

    await admin
      .from("payment_requests")
      .update({ provider_session_id: session.id, pay_url: payUrl })
      .eq("id", paymentRow.id);

    return { payUrl, paymentId: paymentRow.id };
  } catch (e) {
    await admin.from("payment_requests").update({ status: "failed" }).eq("id", paymentRow.id);
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg };
  }
}
