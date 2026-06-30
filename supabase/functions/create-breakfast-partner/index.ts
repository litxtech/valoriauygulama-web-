// Kahvaltı partner oteli: admin hesap + cari + partner profili oluşturur.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CreateBreakfastPartnerBody = {
  organization_id: string;
  email: string;
  password: string;
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  tax_id?: string | null;
  unit_price?: number | null;
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

  let body: CreateBreakfastPartnerBody;
  try {
    body = (await req.json()) as CreateBreakfastPartnerBody;
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

  const { data: caller, error: callerErr } = await supabaseAdmin
    .from("staff")
    .select("id, role, organization_id")
    .eq("auth_id", user.id)
    .eq("is_active", true)
    .single();

  if (callerErr || !caller || caller.role !== "admin") {
    return new Response(JSON.stringify({ error: "Sadece admin partner otel oluşturabilir" }), {
      status: 403,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const orgId = body.organization_id?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password?.trim();
  const name = body.name?.trim();

  if (!orgId) {
    return new Response(JSON.stringify({ error: "organization_id gerekli" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  if (!email) {
    return new Response(JSON.stringify({ error: "E-posta gerekli" }), {
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
  if (!name) {
    return new Response(JSON.stringify({ error: "Otel adı gerekli" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: body.contact_name?.trim() || name },
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
      return new Response(
        JSON.stringify({
          error: "Bu e-posta kayıtlı görünüyor ancak hesap bulunamadı. Supabase Auth panelinden kontrol edin.",
        }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    authUserId = existing.id;

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
      password,
      email_confirm: true,
      user_metadata: { full_name: body.contact_name?.trim() || name },
    });
    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: existingPartner } = await supabaseAdmin
      .from("breakfast_partner_users")
      .select("id")
      .eq("auth_id", authUserId)
      .maybeSingle();

    if (existingPartner?.id) {
      return new Response(JSON.stringify({ error: "Bu e-posta zaten bir partner otel hesabına bağlı." }), {
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

  const { data: hotelId, error: rpcErr } = await supabaseUser.rpc("breakfast_partner_register_hotel", {
    p_organization_id: orgId,
    p_auth_id: authUserId,
    p_name: name,
    p_contact_name: body.contact_name?.trim() || null,
    p_email: email,
    p_phone: body.phone?.trim() || null,
    p_city: body.city?.trim() || null,
    p_address: body.address?.trim() || null,
    p_tax_id: body.tax_id?.trim() || null,
    p_unit_price: body.unit_price ?? null,
    p_notes: body.notes?.trim() || null,
  });

  if (rpcErr) {
    if (!createError && newUser.user?.id) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id).catch(() => {});
    }
    return new Response(JSON.stringify({ error: rpcErr.message }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, hotel_id: hotelId, email, auth_id: authUserId }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
  );
});
