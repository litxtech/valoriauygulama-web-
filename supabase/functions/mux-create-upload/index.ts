/**
 * Mesaj videosu: Mux direct upload URL (staff JWT veya misafir app_token).
 * POST { conversation_id, message_id, file_size?, mime_type?, app_token? }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  MUX_CHAT_MAX_BYTES,
  muxCreateDirectUpload,
} from "../_shared/mux.ts";

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

  const conversationId = typeof body.conversation_id === "string" ? body.conversation_id.trim() : "";
  const messageId = typeof body.message_id === "string" ? body.message_id.trim() : "";
  const fileSize = typeof body.file_size === "number" ? body.file_size : Number(body.file_size) || 0;
  const mimeType = typeof body.mime_type === "string" ? body.mime_type.trim() : "video/mp4";
  const appToken = typeof body.app_token === "string" ? body.app_token.trim() : "";

  if (!conversationId || !messageId) {
    return json({ error: "conversation_id ve message_id gerekli" }, 400);
  }
  if (fileSize > MUX_CHAT_MAX_BYTES) {
    return json({ error: "Video çok büyük (üst sınır 600 MB)" }, 413);
  }

  const { data: msg, error: msgErr } = await admin
    .from("messages")
    .select("id, conversation_id, sender_id, sender_type, message_type")
    .eq("id", messageId)
    .single();
  if (msgErr || !msg) return json({ error: "Mesaj bulunamadı" }, 404);
  if (msg.conversation_id !== conversationId) return json({ error: "Mesaj bu sohbete ait değil" }, 403);
  if (msg.message_type !== "video") return json({ error: "Mesaj video tipinde değil" }, 400);

  let actorOk = false;

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const bearer = authHeader?.replace(/^Bearer\s+/i, "").trim();

  if (bearer && anonKey) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await userClient.auth.getUser(bearer);
    const authId = userData?.user?.id;
    if (authId) {
      const { data: staffRows } = await admin
        .from("staff")
        .select("id")
        .eq("auth_id", authId)
        .is("deleted_at", null);
      const ownsMessage =
        (msg.sender_type === "staff" || msg.sender_type === "admin") &&
        (staffRows ?? []).some((s) => s.id === msg.sender_id);
      if (ownsMessage) {
        const { data: part } = await admin
          .from("conversation_participants")
          .select("id")
          .eq("conversation_id", conversationId)
          .eq("participant_id", msg.sender_id)
          .in("participant_type", ["staff", "admin"])
          .is("left_at", null)
          .maybeSingle();
        actorOk = Boolean(part);
      }

      if (!actorOk) {
        const { data: partnerRow } = await admin
          .from("breakfast_partner_users")
          .select("id")
          .eq("auth_id", authId)
          .maybeSingle();
        const partnerOwns =
          msg.sender_type === "partner" && partnerRow?.id === msg.sender_id;
        if (partnerOwns) {
          const { data: part } = await admin
            .from("conversation_participants")
            .select("id")
            .eq("conversation_id", conversationId)
            .eq("participant_id", msg.sender_id)
            .eq("participant_type", "partner")
            .is("left_at", null)
            .maybeSingle();
          actorOk = Boolean(part);
        }
      }
    }
  }

  if (!actorOk && appToken) {
    const { data: guest } = await admin.from("guests").select("id").eq("app_token", appToken).maybeSingle();
    if (guest?.id && guest.id === msg.sender_id && msg.sender_type === "guest") {
      const { data: part } = await admin
        .from("conversation_participants")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("participant_id", guest.id)
        .eq("participant_type", "guest")
        .is("left_at", null)
        .maybeSingle();
      actorOk = Boolean(part);
    }
  }

  if (!actorOk) return json({ error: "Bu mesaj için yükleme yetkisi yok" }, 403);

  try {
    const upload = await muxCreateDirectUpload("*", messageId);
    const pendingUrl = `mux://pending/${upload.id}`;

    const { error: trackErr } = await admin.from("message_mux_uploads").insert({
      message_id: messageId,
      conversation_id: conversationId,
      mux_upload_id: upload.id,
      status: "waiting",
    });
    if (trackErr) {
      console.error("[mux-create-upload] track insert", trackErr.message);
      return json({ error: "Upload kaydı oluşturulamadı" }, 500);
    }

    await admin
      .from("messages")
      .update({
        media_url: pendingUrl,
        mime_type: mimeType,
        file_size: fileSize > 0 ? fileSize : null,
      })
      .eq("id", messageId);

    return json(
      {
        upload_id: upload.id,
        upload_url: upload.url,
        method: "PUT",
        message_id: messageId,
        pending_media_url: pendingUrl,
      },
      200,
    );
  } catch (e) {
    console.error("[mux-create-upload]", e);
    return json({ error: e instanceof Error ? e.message : "Mux hatası" }, 500);
  }
});
