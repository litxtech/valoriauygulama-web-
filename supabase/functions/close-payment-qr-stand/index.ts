// Sabit QR ödeme noktasını kapat
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveStaffCaller } from "../_shared/paymentQrStandAuth.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = { stand_id: string };

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

  const standId = (body.stand_id ?? "").trim();
  if (!standId) return json({ error: "stand_id gerekli" }, 400);

  const { data: stand } = await admin
    .from("payment_qr_stands")
    .select("id, organization_id, status")
    .eq("id", standId)
    .maybeSingle();

  if (!stand?.id) return json({ error: "QR bulunamadı" }, 404);
  if (
    caller.staff.role !== "admin" &&
    stand.organization_id !== caller.staff.organization_id
  ) {
    return json({ error: "Yetkisiz" }, 403);
  }
  if (stand.status === "closed") {
    return json({ ok: true, status: "closed", skipped: "already_closed" });
  }

  await admin
    .from("payment_qr_stands")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      closed_by_staff_id: caller.staff.id,
    })
    .eq("id", standId);

  return json({ ok: true, stand_id: standId, status: "closed" });
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
