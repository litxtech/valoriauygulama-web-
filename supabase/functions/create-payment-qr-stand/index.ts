// Sabit QR ödeme noktası oluştur — QR kapatılana kadar tekrar kullanılır
// amount_mode=variable → serbest tutar; müşteri taradıktan sonra tutar girer
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { paymentQrStandOpenUrl, resolveStaffCaller } from "../_shared/paymentQrStandAuth.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SERVICE_KINDS = new Set(["food", "amenity", "room_service", "transfer", "dining", "generic", "other"]);

type Body = {
  amount?: number | null;
  amount_mode?: string;
  currency?: string;
  title: string;
  description?: string | null;
  service_kind?: string;
};

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

  const amountMode = (body.amount_mode ?? "fixed").trim().toLowerCase() === "variable" ? "variable" : "fixed";

  let amount: number | null = null;
  if (amountMode === "fixed") {
    const parsed = Number(body.amount);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 500000) {
      return json({ error: "Geçersiz tutar (0–500.000)" }, 400);
    }
    amount = Math.round(parsed * 100) / 100;
  }

  const title = (body.title ?? "").trim();
  if (title.length < 2) return json({ error: "Başlık en az 2 karakter olmalı" }, 400);

  const currency = (body.currency ?? "try").trim().toLowerCase();
  const serviceKind = (body.service_kind ?? "generic").trim().toLowerCase();
  if (!SERVICE_KINDS.has(serviceKind)) return json({ error: "Geçersiz service_kind" }, 400);

  const orgId = caller.staff.organization_id;
  if (!orgId) return json({ error: "Admin için otel seçimi gerekli" }, 400);

  const { data: inserted, error: insertErr } = await admin
    .from("payment_qr_stands")
    .insert({
      organization_id: orgId,
      amount,
      amount_mode: amountMode,
      currency,
      title,
      description: body.description?.trim() || null,
      service_kind: serviceKind,
      status: "active",
      created_by_staff_id: caller.staff.id,
      metadata: {
        staff_name: caller.staff.full_name ?? null,
        qr_mode: amountMode === "variable" ? "standing_variable" : "standing",
      },
    })
    .select("id, public_token, amount, amount_mode, currency, title, description, service_kind, status, created_at")
    .single();

  if (insertErr || !inserted) {
    return json({ error: insertErr?.message ?? "Kayıt oluşturulamadı" }, 500);
  }

  const openUrl = paymentQrStandOpenUrl(inserted.public_token as string);

  return json({
    id: inserted.id,
    public_token: inserted.public_token,
    open_url: openUrl,
    amount: inserted.amount,
    amount_mode: inserted.amount_mode,
    currency: inserted.currency,
    title: inserted.title,
    description: inserted.description,
    service_kind: inserted.service_kind,
    status: inserted.status,
    qr_mode: amountMode === "variable" ? "standing_variable" : "standing",
  });
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
