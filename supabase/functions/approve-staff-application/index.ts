// Valoria Hotel - Çalışan başvurusunu onaylama (Yöntem 2)
// Auth kullanıcısı oluşturur, staff satırı ekler, başvuruyu approved yapar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONTRACT_TYPES = ["full_time", "fixed_term", "seasonal", "intern", "other"] as const;
function normalizeContractType(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  return CONTRACT_TYPES.includes(s as (typeof CONTRACT_TYPES)[number]) ? s : null;
}

function randomPassword(length = 16): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let s = "";
  for (let i = 0; i < length; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

type ApproveBody = {
  application_id: string;
  access_token?: string | null;
  password?: string; // Yoksa rastgele atanır (çalışan şifre sıfırlama ile girebilir)
  position?: string | null;
  department?: string | null;
  role?: string | null;
  personnel_no?: string | null;
  hire_date?: string | null;
  app_permissions?: Record<string, boolean> | null;
  work_days?: number[] | null;
  shift_type?: string | null;
  organization_id?: string | null;
  contract_type?: string | null;
  termination_date?: string | null;
  internal_extension?: string | null;
  certifications_summary?: string | null;
  kvkk_consent_at?: string | null;
  drives_vehicle?: boolean | null;
  tips_enabled?: boolean | null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let body: ApproveBody;
  try {
    body = (await req.json()) as ApproveBody;
  } catch {
    return new Response(JSON.stringify({ error: "Geçersiz JSON" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const tokenFromHeader = authHeader?.replace(/^Bearer\s+/i, "").trim();
  const token = tokenFromHeader || (body.access_token && String(body.access_token).trim()) || null;
  if (!token) {
    return new Response(JSON.stringify({ error: "Yetkisiz: Token gönderilmedi" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  const supabaseUser = createClient(supabaseUrl, anonKey);

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Geçersiz oturum veya token süresi dolmuş" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  const { data: caller } = await supabaseAdmin
    .from("staff")
    .select("id, role")
    .eq("auth_id", user.id)
    .eq("is_active", true)
    .single();
  if (!caller || caller.role !== "admin") {
    return new Response(JSON.stringify({ error: "Sadece admin başvuru onaylayabilir" }), {
      status: 403,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const {
      application_id,
      password: givenPassword,
      position,
      department,
      role,
      personnel_no,
      hire_date,
      app_permissions,
      work_days,
      shift_type,
      organization_id,
      contract_type,
      termination_date,
      internal_extension,
      certifications_summary,
      kvkk_consent_at,
      drives_vehicle,
      tips_enabled,
    } = body;

    if (!application_id) {
      return new Response(
        JSON.stringify({ error: "application_id gerekli" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const { data: app, error: appError } = await supabaseAdmin
      .from("staff_applications")
      .select("*")
      .eq("id", application_id)
      .eq("status", "pending")
      .single();
    if (appError || !app) {
      return new Response(
        JSON.stringify({ error: "Başvuru bulunamadı veya zaten işlenmiş" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const orgId = typeof organization_id === "string" && organization_id.trim() ? organization_id.trim() : null;
    if (!orgId) {
      return new Response(
        JSON.stringify({ error: "İşletme (organization_id) seçimi zorunludur." }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }
    const { data: orgRow, error: orgErr } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("id", orgId)
      .maybeSingle();
    if (orgErr || !orgRow?.id) {
      return new Response(
        JSON.stringify({ error: "Geçersiz işletme seçimi." }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const email = app.email.trim().toLowerCase();
    const finalPassword = givenPassword?.trim() || randomPassword(14);
    const finalRole = role?.trim() && ["reception_chief", "receptionist", "housekeeping", "technical", "security"].includes(role.trim())
      ? role.trim()
      : "receptionist";
    const finalDepartment = department?.trim() || app.applied_department || null;
    const finalPosition = position?.trim() || app.approved_position?.trim() || null;
    const finalPersonnelNo = personnel_no?.trim() || app.approved_personnel_no?.trim() || null;

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: true,
      user_metadata: { full_name: app.full_name },
    });
    if (createError) {
      return new Response(
        JSON.stringify({ error: "Hesap oluşturulamadı: " + createError.message }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }
    if (!newUser.user) {
      return new Response(
        JSON.stringify({ error: "Kullanıcı oluşturulamadı" }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const { error: insertError } = await supabaseAdmin.from("staff").insert({
      auth_id: newUser.user.id,
      email: newUser.user.email!,
      full_name: app.full_name,
      role: finalRole,
      department: finalDepartment,
      position: finalPosition,
      phone: app.phone?.trim() || null,
      profile_image: app.profile_image_url?.trim() || null,
      hire_date: hire_date || new Date().toISOString().slice(0, 10),
      personnel_no: finalPersonnelNo,
      app_permissions: app_permissions ?? {},
      work_days: work_days ?? [1, 2, 3, 4, 5],
      shift_type: shift_type?.trim() || null,
      is_active: true,
      organization_id: orgId,
      contract_type: normalizeContractType(contract_type),
      termination_date: termination_date && String(termination_date).trim() ? String(termination_date).trim().slice(0, 10) : null,
      internal_extension: internal_extension?.trim() || null,
      certifications_summary: certifications_summary?.trim() || null,
      kvkk_consent_at: kvkk_consent_at && String(kvkk_consent_at).trim() ? String(kvkk_consent_at).trim().slice(0, 10) : null,
      drives_vehicle: drives_vehicle === true,
      tips_enabled:
        tips_enabled === false
          ? false
          : app_permissions?.bahsis_alabilir === false
            ? false
            : true,
    });
    if (insertError) {
      return new Response(
        JSON.stringify({ error: "Staff kaydı eklenemedi: " + insertError.message }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    await supabaseAdmin
      .from("staff_applications")
      .update({
        status: "approved",
        reviewed_by: caller.id,
        reviewed_at: new Date().toISOString(),
        approved_department: finalDepartment,
        approved_position: finalPosition,
        approved_personnel_no: finalPersonnelNo,
        approved_role: finalRole,
      })
      .eq("id", application_id);

    const { data: inserted } = await supabaseAdmin
      .from("staff")
      .select("id")
      .eq("auth_id", newUser.user.id)
      .single();

    return new Response(
      JSON.stringify({
        staff_id: inserted?.id,
        email: newUser.user.email,
        temporary_password: givenPassword ? undefined : finalPassword,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Sunucu hatası" }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
