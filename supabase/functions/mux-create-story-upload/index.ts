/**
 * Story videosu: Mux direct upload URL (staff JWT).
 * POST { story_id, file_size?, mime_type? }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { MUX_CHAT_MAX_BYTES, muxCreateDirectUpload } from "../_shared/mux.ts";

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

  const storyId = typeof body.story_id === "string" ? body.story_id.trim() : "";
  const fileSize = typeof body.file_size === "number" ? body.file_size : Number(body.file_size) || 0;
  const mimeType = typeof body.mime_type === "string" ? body.mime_type.trim() : "video/mp4";

  if (!storyId) return json({ error: "story_id gerekli" }, 400);
  if (fileSize > MUX_CHAT_MAX_BYTES) {
    return json({ error: "Video çok büyük (üst sınır 600 MB)" }, 413);
  }

  const { data: story, error: storyErr } = await admin
    .from("feed_stories")
    .select("id, staff_id, media_type, deleted_at")
    .eq("id", storyId)
    .single();
  if (storyErr || !story) return json({ error: "Story bulunamadı" }, 404);
  if (story.deleted_at) return json({ error: "Story silinmiş" }, 410);
  if (story.media_type !== "video") return json({ error: "Story video tipinde değil" }, 400);

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
    .eq("id", story.staff_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!staffRow?.id) return json({ error: "Bu story için yükleme yetkisi yok" }, 403);

  try {
    const upload = await muxCreateDirectUpload("*", storyId, "1080p");
    const pendingUrl = `mux://pending/${upload.id}`;

    const { error: trackErr } = await admin.from("feed_story_mux_uploads").upsert(
      {
        story_id: storyId,
        mux_upload_id: upload.id,
        status: "waiting",
        error_message: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "story_id" },
    );
    if (trackErr) {
      console.error("[mux-create-story-upload] track upsert", trackErr.message);
      return json({ error: "upload_track_failed" }, 500);
    }

    await admin
      .from("feed_stories")
      .update({ media_url: pendingUrl })
      .eq("id", storyId);

    return json(
      {
        upload_id: upload.id,
        upload_url: upload.url,
        method: "PUT",
        story_id: storyId,
        pending_media_url: pendingUrl,
        mime_type: mimeType,
      },
      200,
    );
  } catch (e) {
    console.error("[mux-create-story-upload]", e);
    return json({ error: "mux_upload_failed" }, 502);
  }
});
