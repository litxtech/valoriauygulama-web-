// Partner otel: kendi kaydı (admin onayı ile aktif)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RegisterBody = {
  email: string;
  password: string;
  name: string;
  contact_name: string;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  tax_id?: string | null;
  notes?: string | null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    return new Response(JSON.stringify({ error: "Geçersiz JSON" }), {
      status: 400,
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

  const email = body.email?.trim().toLowerCase();
  const password = body.password?.trim();
  const name = body.name?.trim();
  const contactName = body.contact_name?.trim();

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
  if (!contactName) {
    return new Response(JSON.stringify({ error: "Yetkili adı gerekli" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: contactName },
  });

  if (createError) {
    const msg =
      createError.message.includes("already been registered") || createError.message.includes("already exists")
        ? "Bu e-posta adresi zaten kayıtlı. Giriş yapmayı deneyin."
        : createError.message;
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  if (!newUser.user) {
    return new Response(JSON.stringify({ error: "Hesap oluşturulamadı" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabaseAsUser = createClient(supabaseUrl, anonKey);
  const { data: signInData, error: signInErr } = await supabaseAsUser.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr || !signInData.session) {
    await supabaseAdmin.auth.admin.deleteUser(newUser.user.id).catch(() => {});
    return new Response(JSON.stringify({ error: signInErr?.message ?? "Oturum açılamadı" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
  });

  const { data: hotelId, error: rpcErr } = await userClient.rpc("breakfast_partner_self_register", {
    p_name: name,
    p_contact_name: contactName,
    p_email: email,
    p_phone: body.phone?.trim() || null,
    p_city: body.city?.trim() || null,
    p_address: body.address?.trim() || null,
    p_tax_id: body.tax_id?.trim() || null,
    p_notes: body.notes?.trim() || null,
  });

  if (rpcErr) {
    await supabaseAdmin.auth.admin.deleteUser(newUser.user.id).catch(() => {});
    return new Response(JSON.stringify({ error: rpcErr.message }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      hotel_id: hotelId,
      email,
      status: "pending",
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
    }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
  );
});
