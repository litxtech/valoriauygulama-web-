// Online rezervasyon — oda ödemesi Stripe Checkout (misafire "Kredi Kartı ile Öde")
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

type Body = {
  booking_id: string;
  org_slug?: string | null;
  lang?: string | null;
};

function publicBookingBaseUrl(): string {
  return (Deno.env.get("PAYMENT_PUBLIC_BASE_URL") ?? "https://valoria.tr").replace(/\/$/, "");
}

function bookingPaymentUrls(bookingId: string, requestId: string, token: string) {
  const base = publicBookingBaseUrl();
  const successQ = new URLSearchParams({
    payment: "success",
    id: bookingId,
    payId: requestId,
    token,
  });
  const cancelQ = new URLSearchParams({
    payment: "cancel",
    id: bookingId,
    payId: requestId,
    token,
  });
  return {
    success: `${base}/booking/success?${successQ.toString()}`,
    cancel: `${base}/booking/success?${cancelQ.toString()}`,
  };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Geçersiz JSON", error_code: "INVALID_JSON" }, 400);
  }

  const bookingId = (body.booking_id ?? "").trim();
  if (!bookingId) {
    return json({ error: "Rezervasyon gerekli", error_code: "BOOKING_REQUIRED" }, 400);
  }

  const { data: booking, error: bookErr } = await admin
    .from("online_bookings")
    .select(
      "id, organization_id, room_id, status, guest_full_name, guest_email, guest_phone, capacity_label, display_title, check_in_date, check_out_date, nights_count, quoted_total, currency, payment_request_id, paid_at"
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bookErr) {
    return json({ error: bookErr.message, error_code: "BOOKING_LOOKUP" }, 500);
  }
  if (!booking?.id) {
    return json({ error: "Rezervasyon bulunamadı", error_code: "BOOKING_NOT_FOUND" }, 404);
  }
  if (booking.paid_at || booking.status === "confirmed") {
    return json({ error: "Rezervasyon zaten ödendi", error_code: "ALREADY_PAID" }, 400);
  }
  if (booking.status === "cancelled" || booking.status === "expired") {
    return json({ error: "Rezervasyon geçersiz", error_code: "BOOKING_INVALID" }, 400);
  }

  // Ödeme başlarken oda başka onaylı rezervasyonda mı?
  if (booking.room_id && booking.check_in_date && booking.check_out_date) {
    const { data: conflicts } = await admin
      .from("online_bookings")
      .select("id")
      .eq("room_id", booking.room_id)
      .in("status", ["confirmed", "converted"])
      .lt("check_in_date", booking.check_out_date)
      .gt("check_out_date", booking.check_in_date)
      .neq("id", bookingId)
      .limit(1);
    if (conflicts?.length) {
      return json(
        { error: "Bu oda seçtiğiniz tarihlerde artık müsait değil", error_code: "ROOM_UNAVAILABLE" },
        409
      );
    }
  }

  const amount = Number(booking.quoted_total);
  if (!Number.isFinite(amount) || amount <= 0) {
    return json({ error: "Ödenecek tutar yok", error_code: "AMOUNT_MISSING" }, 400);
  }

  const currency = ((booking.currency as string) || defaultPaymentCurrency()).trim().toLowerCase();
  const roomLabel =
    (booking.display_title as string | null)?.trim() ||
    (booking.capacity_label as string | null)?.trim() ||
    "Oda";
  const title = `Oda rezervasyonu · ${roomLabel}`.slice(0, 120);
  const description = [
    booking.check_in_date,
    "→",
    booking.check_out_date,
    `· ${booking.nights_count} gece`,
    booking.guest_full_name ? `· ${booking.guest_full_name}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 500);

  // Önceki bekleyen ödeme varsa Stripe oturumunu yeniden kullan
  if (booking.payment_request_id) {
    const { data: existing } = await admin
      .from("payment_requests")
      .select("id, public_token, pay_url, status, amount, currency, expires_at")
      .eq("id", booking.payment_request_id)
      .maybeSingle();
    if (
      existing?.status === "pending" &&
      existing.pay_url &&
      (!existing.expires_at || new Date(existing.expires_at).getTime() > Date.now() + 60_000)
    ) {
      return json({
        booking_id: bookingId,
        payment_request_id: existing.id,
        pay_url: existing.pay_url,
        amount: existing.amount,
        currency: existing.currency,
        status: "pending",
      });
    }
  }

  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const orgSlug = (body.org_slug ?? "valoria").toString().trim().toLowerCase() || "valoria";
  const lang = (body.lang ?? "tr").toString().slice(0, 8);

  const { data: paymentRow, error: payInsertErr } = await admin
    .from("payment_requests")
    .insert({
      organization_id: booking.organization_id,
      amount: Math.round(amount * 100) / 100,
      currency,
      title,
      description,
      service_kind: "amenity",
      reference_type: "online_booking",
      reference_id: bookingId,
      guest_id: null,
      created_by_staff_id: null,
      metadata: {
        online_booking_id: bookingId,
        guest_name: booking.guest_full_name,
        guest_phone: booking.guest_phone,
        guest_email: booking.guest_email,
        room_label: roomLabel,
        check_in: booking.check_in_date,
        check_out: booking.check_out_date,
        nights: booking.nights_count,
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
    return json({ error: payInsertErr?.message ?? "Ödeme kaydı oluşturulamadı", error_code: "PAYMENT_INSERT" }, 500);
  }

  await admin
    .from("online_bookings")
    .update({ payment_request_id: paymentRow.id, updated_at: new Date().toISOString() })
    .eq("id", bookingId);

  const urls = bookingPaymentUrls(bookingId, paymentRow.id, paymentRow.public_token);
  const guestEmail = typeof booking.guest_email === "string" ? booking.guest_email.trim() : "";

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ...(isValidEmail(guestEmail) ? { customer_email: guestEmail } : {}),
      success_url: urls.success,
      cancel_url: urls.cancel,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: toStripeMinorUnits(amount, currency),
            product_data: {
              name: title,
              description,
            },
          },
        },
      ],
      metadata: {
        payment_request_id: paymentRow.id,
        organization_id: booking.organization_id as string,
        service_kind: "amenity",
        online_booking_id: bookingId,
        public_token: paymentRow.public_token,
        org_slug: orgSlug,
      },
      expires_at: Math.floor(new Date(expiresAt).getTime() / 1000),
    });

    const payUrl = session.url;
    if (!payUrl) {
      await admin.from("payment_requests").update({ status: "failed" }).eq("id", paymentRow.id);
      return json({ error: "Ödeme oturumu oluşturulamadı", error_code: "STRIPE_SESSION" }, 500);
    }

    await admin
      .from("payment_requests")
      .update({ provider_session_id: session.id, pay_url: payUrl })
      .eq("id", paymentRow.id);

    return json({
      booking_id: bookingId,
      payment_request_id: paymentRow.id,
      pay_url: payUrl,
      amount: Math.round(amount * 100) / 100,
      currency,
      status: "pending",
    });
  } catch (e) {
    await admin.from("payment_requests").update({ status: "failed" }).eq("id", paymentRow.id);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Ödeme hatası", error_code: "STRIPE_ERROR" }, 500);
  }
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
