/**
 * Staff JWT → LiveKit PTT access token (üyelik tabanlı oda).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function buildLiveKitRoomName(roomId: string): string {
  const id = roomId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return `ptt_room_${id}`;
}

function b64urlJson(obj: unknown): string {
  const s = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlBytes(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  return btoa(bin).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function createLiveKitJwt(opts: {
  apiKey: string;
  apiSecret: string;
  identity: string;
  name: string;
  room: string;
  metadata: string;
  ttlSec?: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const ttl = opts.ttlSec ?? 7200;
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: opts.apiKey,
    sub: opts.identity,
    name: opts.name,
    metadata: opts.metadata,
    nbf: now - 10,
    exp: now + ttl,
    video: {
      roomJoin: true,
      room: opts.room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canPublishSources: ["microphone"],
      canUpdateOwnMetadata: true,
    },
  };
  const data = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(opts.apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return `${data}.${b64urlBytes(sig)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const livekitUrl = Deno.env.get("LIVEKIT_URL")?.trim() || "";
    const apiKey = Deno.env.get("LIVEKIT_API_KEY")?.trim() || "";
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET")?.trim() || "";
    if (!livekitUrl || !apiKey || !apiSecret) {
      return json({ error: "LiveKit yapılandırması eksik (LIVEKIT_* secrets)." }, 500);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const admin = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!bearer || !anonKey) return json({ error: "Oturum gerekli." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(bearer);
    if (userErr || !userData?.user?.id) return json({ error: "Oturum geçersiz." }, 401);

    const { data: staffRows, error: staffErr } = await admin
      .from("staff")
      .select("id, full_name, organization_id, is_active, deleted_at, role")
      .eq("auth_id", userData.user.id)
      .is("deleted_at", null)
      .order("is_active", { ascending: false })
      .limit(1);

    const staff = staffRows?.[0];
    if (staffErr || !staff?.id) {
      return json({ error: "Personel kaydı bulunamadı.", detail: staffErr?.message ?? null }, 403);
    }
    if (!staff.is_active) return json({ error: "Personel hesabı pasif." }, 403);

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    let roomId =
      typeof body.roomId === "string"
        ? body.roomId.trim()
        : typeof body.room_id === "string"
          ? body.room_id.trim()
          : "";

    // Eski istemci: channel all_staff → default oda
    if (!roomId || !UUID_RE.test(roomId)) {
      const { data: def } = await admin
        .from("staff_ptt_rooms")
        .select("id")
        .eq("is_default", true)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      roomId = (def?.id as string) || "";
      if (roomId) {
        await admin.from("staff_ptt_room_members").upsert(
          { room_id: roomId, staff_id: staff.id },
          { onConflict: "room_id,staff_id" },
        );
      }
    }

    if (!roomId || !UUID_RE.test(roomId)) {
      return json({ error: "PTT odası bulunamadı." }, 404);
    }

    const { data: roomRow, error: roomErr } = await admin
      .from("staff_ptt_rooms")
      .select("id, slug, name, is_active")
      .eq("id", roomId)
      .maybeSingle();

    if (roomErr || !roomRow?.id || !roomRow.is_active) {
      return json({ error: "PTT odası aktif değil." }, 404);
    }

    const { data: membership } = await admin
      .from("staff_ptt_room_members")
      .select("staff_id")
      .eq("room_id", roomId)
      .eq("staff_id", staff.id)
      .maybeSingle();

    if (!membership?.staff_id) {
      return json({ error: "Bu odanın üyesi değilsiniz." }, 403);
    }

    const room = buildLiveKitRoomName(roomId);
    const identity = `staff_${staff.id}`;
    const displayName =
      (typeof staff.full_name === "string" && staff.full_name.trim()) ||
      (typeof staff.role === "string" ? staff.role : "Personel");

    const token = await createLiveKitJwt({
      apiKey,
      apiSecret,
      identity,
      name: displayName,
      room,
      metadata: JSON.stringify({
        staffId: staff.id,
        roomId,
        slug: roomRow.slug,
        organizationId: staff.organization_id ?? null,
      }),
    });

    return json({
      token,
      url: livekitUrl,
      room,
      roomId,
      channel: roomRow.slug,
      identity,
      displayName,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: "Token üretilemedi.", detail: msg }, 500);
  }
});
