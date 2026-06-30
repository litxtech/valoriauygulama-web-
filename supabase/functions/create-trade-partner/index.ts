// Partner Ticaret: admin hesap + partner profili oluşturur (Kahvaltı modülünden bağımsız).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CreateTradePartnerBody = {
  organization_id: string;
  category_id: string;
  email: string;
  password: string;
  company_name: string;
  contact_name?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  access_token?: string | null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let body: CreateTradePartnerBody;
  try {
    body = (await req.json()) as CreateTradePartnerBody;
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return new Response(JSON.stringify({ error: "Sunucu yapılandırma hatası" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  const bearerHeader = tokenFromHeader && authHeader?.startsWith("Bearer ") ? authHeader : `Bearer ${token}`;
  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: bearerHeader } },
  });

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: userError?.message ?? "Geçersiz oturum" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { data: staffRows, error: callerErr } = await supabaseAdmin
    .from("staff")
    .select("id, role, organization_id")
    .eq("auth_id", user.id)
    .eq("is_active", true)
    .is("deleted_at", null);

  const caller = (staffRows ?? []).find((s) => s.role === "admin") ?? null;

  if (callerErr || !caller) {
    return new Response(JSON.stringify({ error: "Sadece admin partner oluşturabilir (personel kaydı bulunamadı)" }), {
      status: 403,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const orgId = body.organization_id?.trim();
  const categoryId = body.category_id?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password?.trim();
  const companyName = body.company_name?.trim();

  if (!orgId || !categoryId || !email || !companyName) {
    return new Response(JSON.stringify({ error: "organization_id, category_id, email ve company_name gerekli" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  if (!password || password.length < 6) {
    return new Response(JSON.stringify({ error: "Şifre en az 6 karakter olmalı" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: body.contact_name?.trim() || companyName },
  });

  let authUserId: string | null = newUser.user?.id ?? null;

  if (createError) {
    const alreadyRegistered =
      createError.message.includes("already been registered") ||
      createError.message.includes("already exists") ||
      createError.message.includes("duplicate");

    if (!alreadyRegistered) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: listed, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) {
      return new Response(JSON.stringify({ error: listErr.message }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const existing = listed.users.find((u) => u.email?.trim().toLowerCase() === email);
    if (!existing?.id) {
      return new Response(JSON.stringify({ error: "Bu e-posta kayıtlı ancak hesap bulunamadı." }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    authUserId = existing.id;

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
      password,
      email_confirm: true,
      user_metadata: { full_name: body.contact_name?.trim() || companyName },
    });
    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: existingPartner } = await supabaseAdmin
      .from("partner_trade_partners")
      .select("id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (existingPartner?.id) {
      return new Response(JSON.stringify({ error: "Bu e-posta zaten bir Partner Ticaret hesabına bağlı." }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  }

  if (!authUserId) {
    return new Response(JSON.stringify({ error: "Kullanıcı oluşturulamadı" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { data: partnerId, error: rpcErr } = await supabaseUser.rpc("partner_trade_register_partner", {
    p_organization_id: orgId,
    p_auth_id: authUserId,
    p_category_id: categoryId,
    p_company_name: companyName,
    p_contact_name: body.contact_name?.trim() || null,
    p_email: email,
    p_phone: body.phone?.trim() || null,
    p_address: body.address?.trim() || null,
    p_notes: body.notes?.trim() || null,
  });

  if (rpcErr) {
    if (!createError && newUser.user?.id) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id).catch(() => {});
    }
    const rpcMsg = rpcErr.message ?? "Partner kaydı oluşturulamadı";
    const friendly =
      rpcMsg === "Yetkisiz"
        ? "Yetkisiz: Admin hesabınız bu işlem için yetkilendirilmemiş. Personel kaydınızın admin rolünde olduğundan emin olun."
        : rpcMsg.includes("partner_trade")
          ? "Veritabanı güncel değil. Migration 491/494 uygulanmalı."
          : rpcMsg;
    return new Response(JSON.stringify({ error: friendly }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, partner_id: partnerId, email, auth_id: authUserId }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
  );
});
