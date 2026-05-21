/**
 * Mux webhook: video.asset.ready → mesaj media_url güncelle
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { syncChatMessageFromMux, syncStoryFromMux, verifyMuxWebhookSignature } from "../_shared/mux.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, mux-signature",
};

function ok() {
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  const rawBody = await req.text();
  const sig = req.headers.get("Mux-Signature") ?? req.headers.get("mux-signature");
  const valid = await verifyMuxWebhookSignature(rawBody, sig);
  if (!valid) {
    console.warn("[mux-webhook] Geçersiz imza");
    return new Response("Invalid signature", { status: 401, headers: CORS });
  }

  let event: {
    type?: string;
    data?: Record<string, unknown>;
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: CORS });
  }

  const type = event?.type ?? "";
  const data = event?.data ?? {};
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    if (type === "video.upload.asset_created") {
      const uploadId = typeof data.id === "string" ? data.id : "";
      const assetId = typeof data.asset_id === "string" ? data.asset_id : "";
      if (uploadId && assetId) {
        await admin
          .from("message_mux_uploads")
          .update({
            mux_asset_id: assetId,
            status: "processing",
            updated_at: new Date().toISOString(),
          })
          .eq("mux_upload_id", uploadId);
        await admin
          .from("feed_story_mux_uploads")
          .update({
            mux_asset_id: assetId,
            status: "processing",
            updated_at: new Date().toISOString(),
          })
          .eq("mux_upload_id", uploadId);
      }
      return ok();
    }

    if (type === "video.asset.ready") {
      const assetId = typeof data.id === "string" ? data.id : "";
      const passthrough = typeof data.passthrough === "string" ? data.passthrough.trim() : "";
      if (!assetId) return ok();

      let messageId: string | undefined;
      const { data: row } = await admin
        .from("message_mux_uploads")
        .select("message_id")
        .eq("mux_asset_id", assetId)
        .maybeSingle();
      messageId = row?.message_id ?? undefined;

      if (messageId) {
        await syncChatMessageFromMux(admin, messageId);
        return ok();
      }

      const { data: storyRow } = await admin
        .from("feed_story_mux_uploads")
        .select("story_id")
        .eq("mux_asset_id", assetId)
        .maybeSingle();
      const storyId = storyRow?.story_id ?? (passthrough || undefined);
      if (storyId) {
        await syncStoryFromMux(admin, storyId);
      }
      return ok();
    }

    if (type === "video.upload.errored" || type === "video.asset.errored") {
      const uploadId = typeof data.id === "string" ? data.id : "";
      const assetId = typeof data.id === "string" && type === "video.asset.errored" ? data.id : "";
      const errMsg =
        (data.errors as { messages?: string[] } | undefined)?.messages?.join("; ") ??
        "Video işlenemedi";

      if (uploadId) {
        const { data: track } = await admin
          .from("message_mux_uploads")
          .select("message_id")
          .eq("mux_upload_id", uploadId)
          .maybeSingle();
        await admin
          .from("message_mux_uploads")
          .update({ status: "errored", error_message: errMsg, updated_at: new Date().toISOString() })
          .eq("mux_upload_id", uploadId);
        if (track?.message_id) {
          await admin
            .from("messages")
            .update({ content: "Video yüklenemedi", media_url: null })
            .eq("id", track.message_id);
        }
        const { data: storyTrack } = await admin
          .from("feed_story_mux_uploads")
          .select("story_id")
          .eq("mux_upload_id", uploadId)
          .maybeSingle();
        await admin
          .from("feed_story_mux_uploads")
          .update({ status: "errored", error_message: errMsg, updated_at: new Date().toISOString() })
          .eq("mux_upload_id", uploadId);
        if (storyTrack?.story_id) {
          await admin.from("feed_stories").delete().eq("id", storyTrack.story_id);
        }
      } else if (assetId) {
        const { data: track } = await admin
          .from("message_mux_uploads")
          .select("message_id")
          .eq("mux_asset_id", assetId)
          .maybeSingle();
        await admin
          .from("message_mux_uploads")
          .update({ status: "errored", error_message: errMsg, updated_at: new Date().toISOString() })
          .eq("mux_asset_id", assetId);
        if (track?.message_id) {
          await admin
            .from("messages")
            .update({ content: "Video işlenemedi", media_url: null })
            .eq("id", track.message_id);
        }
      }
      return ok();
    }

    return ok();
  } catch (e) {
    console.error("[mux-webhook]", e);
    return new Response("Webhook handler error", { status: 500, headers: CORS });
  }
});
