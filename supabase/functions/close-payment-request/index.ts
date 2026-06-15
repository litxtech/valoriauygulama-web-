// Ödeme linki: bekleyen → iptal; tahsil edilmiş / bitmiş → arşiv (listeden kaldır)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveStaffCaller } from "../_shared/paymentQrStandAuth.ts";
import { getStripe } from "../_shared/stripeClient.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  payment_request_id: string;
  action: "cancel" | "archive";
};

const ARCHIVABLE = new Set(["paid", "refunded", "failed", "expired", "cancelled"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Yetkisiz" }, 401);

  const caller = await resolveStaffCaller(admin, token, anonKey, supabaseUrl);
  if ("error" in caller) return json({ error: caller.error }, caller.status);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Geçersiz JSON" }, 400);
  }

  const requestId = (body.payment_request_id ?? "").trim();
  const action = body.action === "archive" ? "archive" : body.action === "cancel" ? "cancel" : null;
  if (!requestId || !action) return json({ error: "payment_request_id ve action (cancel|archive) gerekli" }, 400);

  const { data: row } = await admin
    .from("payment_requests")
    .select("id, organization_id, status, archived_at, provider_session_id")
    .eq("id", requestId)
    .maybeSingle();

  if (!row?.id) return json({ error: "Ödeme kaydı bulunamadı" }, 404);

  if (
    caller.staff.role !== "admin" &&
    row.organization_id !== caller.staff.organization_id
  ) {
    return json({ error: "Yetkisiz" }, 403);
  }

  if (row.archived_at) {
    return json({ ok: true, action, status: row.status, skipped: "already_archived" });
  }

  const now = new Date().toISOString();

  if (action === "cancel") {
    if (row.status !== "pending") {
      return json({ error: "Yalnızca bekleyen ödeme linki iptal edilebilir" }, 400);
    }

    if (row.provider_session_id) {
      try {
        const stripe = getStripe();
        await stripe.checkout.sessions.expire(row.provider_session_id);
      } catch {
        /* oturum zaten kapalı olabilir */
      }
    }

    await admin
      .from("payment_requests")
      .update({
        status: "cancelled",
        cancelled_at: now,
        cancelled_by_staff_id: caller.staff.id,
        pay_url: null,
      })
      .eq("id", requestId);

    return json({ ok: true, action: "cancel", status: "cancelled" });
  }

  if (!ARCHIVABLE.has(String(row.status))) {
    return json(
      { error: "Bu durumdaki link arşivlenemez. Bekleyen link için iptal kullanın." },
      400
    );
  }

  await admin
    .from("payment_requests")
    .update({
      archived_at: now,
      archived_by_staff_id: caller.staff.id,
      pay_url: null,
    })
    .eq("id", requestId);

  return json({ ok: true, action: "archive", status: row.status, archived_at: now });
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
