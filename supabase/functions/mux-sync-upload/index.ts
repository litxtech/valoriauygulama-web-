/**
 * Mesaj videosu: Mux’ta hazır mı kontrol et, hazırsa mesajı hemen güncelle (webhook gecikmesini kısaltır).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { syncChatMessageFromMux, syncStoryFromMux } from "../_shared/mux.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const admin = createClient(supabaseUrl, serviceKey);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Geçersiz JSON" }, 400);
  }

  const messageId = typeof body.message_id === "string" ? body.message_id.trim() : "";
  const storyId = typeof body.story_id === "string" ? body.story_id.trim() : "";
  const appToken = typeof body.app_token === "string" ? body.app_token.trim() : "";
  if (!messageId && !storyId) return json({ error: "message_id veya story_id gerekli" }, 400);

  if (storyId) {
    const { data: story } = await admin
      .from("feed_stories")
      .select("id, staff_id")
      .eq("id", storyId)
      .maybeSingle();
    if (!story) return json({ error: "Story bulunamadı" }, 404);

    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!bearer || !anonKey) return json({ error: "Oturum gerekli" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await userClient.auth.getUser(bearer);
    const authId = userData?.user?.id;
    if (!authId) return json({ error: "Oturum geçersiz" }, 401);
    const { data: staffRow } = await admin
      .from("staff")
      .select("id")
      .eq("auth_id", authId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!staffRow?.id) return json({ error: "Yetkisiz" }, 403);

    try {
      const result = await syncStoryFromMux(admin, storyId);
      return json(
        {
          ready: result.ready,
          media_url: result.media_url ?? null,
          thumbnail_url: result.thumbnail_url ?? null,
        },
        200,
      );
    } catch (e) {
      console.error("[mux-sync-upload] story", e);
      return json({ error: e instanceof Error ? e.message : "Sync hatası" }, 500);
    }
  }

  const { data: msg } = await admin
    .from("messages")
    .select("id, conversation_id, sender_id, sender_type")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return json({ error: "Mesaj bulunamadı" }, 404);

  let allowed = false;
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (bearer && anonKey) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await userClient.auth.getUser(bearer);
    const authId = userData?.user?.id;
    if (authId) {
      const { data: staffRows } = await admin.from("staff").select("id").eq("auth_id", authId).is("deleted_at", null);
      const staffIds = (staffRows ?? []).map((s) => s.id).filter(Boolean);
      if (staffIds.length > 0) {
        const { data: part } = await admin
          .from("conversation_participants")
          .select("id")
          .eq("conversation_id", msg.conversation_id)
          .in("participant_id", staffIds)
          .in("participant_type", ["staff", "admin"])
          .is("left_at", null)
          .maybeSingle();
        allowed = Boolean(part);
      }
    }
  }
  if (!allowed && appToken) {
    const { data: guest } = await admin.from("guests").select("id").eq("app_token", appToken).maybeSingle();
    if (guest?.id) {
      const { data: part } = await admin
        .from("conversation_participants")
        .select("id")
        .eq("conversation_id", msg.conversation_id)
        .eq("participant_id", guest.id)
        .eq("participant_type", "guest")
        .is("left_at", null)
        .maybeSingle();
      allowed = Boolean(part);
    }
  }
  if (!allowed) return json({ error: "Yetkisiz" }, 403);

  try {
    const result = await syncChatMessageFromMux(admin, messageId);
    return json({ ready: result.ready, media_url: result.media_url ?? null }, 200);
  } catch (e) {
    console.error("[mux-sync-upload]", e);
    return json({ error: e instanceof Error ? e.message : "Sync hatası" }, 500);
  }
});
