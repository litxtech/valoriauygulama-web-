/**
 * Uygulama medyası: Storage RLS sorunlarında service role ile yükleme (RLS bypass).
 * Bearer JWT ile kullanıcı doğrulanır; yol {uid}/... veya misafir için guest_{guestId}/...
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BASE64_LEN = 4_500_000; // ~3MB dosya

const ALLOWED_BUCKETS = new Set([
  "expense-receipts",
  "stock-proofs",
  "profiles",
  "feed-media",
  "message-media",
  "contract-media",
  "staff-task-media",
  "carbon-evidence",
  "tech-assets",
  "finance-checks",
  "staff-personnel-warnings",
  "lost-found-media",
  "hotel-kitchen-menu",
  "facility-journal",
  "passport-private",
  "passport-thumbs",
]);

function json(obj: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function decodeBase64(b64: string): Uint8Array {
  const clean = b64.replace(/\s/g, "");
  const bin = atob(clean);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: "Sunucu yapılandırma hatası" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Yetkisiz: oturum gerekli" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user?.id) {
    return json({ error: "Geçersiz veya süresi dolmuş oturum" }, 401);
  }

  let body: {
    bucket?: string;
    base64?: string;
    content_type?: string;
    extension?: string;
    subfolder?: string;
    guest_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Geçersiz JSON" }, 400);
  }

  const bucket = typeof body.bucket === "string" ? body.bucket.trim() : "";
  if (!ALLOWED_BUCKETS.has(bucket)) {
    return json({ error: "Bu bucket için yükleme kapalı" }, 400);
  }

  const b64 = typeof body.base64 === "string" ? body.base64 : "";
  if (!b64.length || b64.length > MAX_BASE64_LEN) {
    return json({ error: "Dosya boş veya çok büyük (üst sınır ~3MB)" }, 400);
  }

  const contentType =
    typeof body.content_type === "string" && body.content_type.length < 120
      ? body.content_type
      : "application/octet-stream";

  const ext =
    typeof body.extension === "string" && /^[a-z0-9]{2,8}$/i.test(body.extension)
      ? body.extension.toLowerCase()
      : "jpg";

  const subfolder =
    typeof body.subfolder === "string"
      ? body.subfolder.replace(/^\/+|\/+$/g, "").slice(0, 240)
      : "";

  const guestId =
    typeof body.guest_id === "string" && /^[0-9a-f-]{36}$/i.test(body.guest_id.trim())
      ? body.guest_id.trim()
      : undefined;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const unique = `${Date.now()}-${crypto.randomUUID().slice(0, 10)}`;
  let objectPath: string;

  if (guestId) {
    const { data: guestRow } = await admin
      .from("guests")
      .select("id, auth_user_id, email")
      .eq("id", guestId)
      .maybeSingle();

    if (!guestRow) return json({ error: "Misafir kaydı bulunamadı" }, 403);

    const emailMatch =
      user.email &&
      guestRow.email &&
      user.email.toLowerCase().trim() === String(guestRow.email).toLowerCase().trim();
    const authMatch = guestRow.auth_user_id === user.id;

    if (!authMatch && !emailMatch) {
      return json({ error: "Bu misafir kaydı için yetkiniz yok" }, 403);
    }
    objectPath = `guest_${guestId}/${unique}.${ext}`;
  } else {
    objectPath = subfolder
      ? `${user.id}/${subfolder}/${unique}.${ext}`
      : `${user.id}/${unique}.${ext}`;
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(b64);
  } catch {
    return json({ error: "Base64 çözülemedi" }, 400);
  }

  if (!bytes.byteLength) return json({ error: "Boş dosya" }, 400);

  const { error: upErr } = await admin.storage.from(bucket).upload(objectPath, bytes, {
    contentType,
    upsert: false,
  });

  if (upErr) {
    console.error("[upload-app-storage]", upErr.message);
    return json({ error: upErr.message || "Storage yükleme hatası" }, 400);
  }

  const { data: pub } = admin.storage.from(bucket).getPublicUrl(objectPath);
  return json({ public_url: pub.publicUrl, path: objectPath }, 200);
});
