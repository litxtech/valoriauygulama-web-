/** Mux API + webhook imza doğrulama (Edge Functions) */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const MUX_API = "https://api.mux.com/video/v1";

export const MUX_CHAT_MAX_BYTES = 600 * 1024 * 1024; // 600 MB
export const MUX_CHAT_UPLOAD_TIMEOUT_SEC = 86_400; // 24 saat

export function muxBasicAuthHeader(): string {
  const id = (Deno.env.get("MUX_TOKEN_ID") ?? "").trim();
  const secret = (Deno.env.get("MUX_TOKEN_SECRET") ?? "").trim();
  if (!id || !secret) throw new Error("MUX_TOKEN_ID / MUX_TOKEN_SECRET yapılandırılmamış");
  return "Basic " + btoa(`${id}:${secret}`);
}

export type MuxDirectUploadResponse = {
  data: {
    id: string;
    url: string;
    status: string;
    timeout: number;
    asset_id?: string | null;
  };
};

export async function muxCreateDirectUpload(
  corsOrigin = "*",
  passthrough?: string,
  maxResolutionTier: "720p" | "1080p" = "1080p",
): Promise<MuxDirectUploadResponse["data"]> {
  const assetSettings: Record<string, unknown> = {
    playback_policies: ["public"],
    video_quality: "basic",
    max_resolution_tier: maxResolutionTier,
  };
  if (passthrough) assetSettings.passthrough = passthrough.slice(0, 255);

  const res = await fetch(`${MUX_API}/uploads`, {
    method: "POST",
    headers: {
      Authorization: muxBasicAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      cors_origin: corsOrigin,
      timeout: MUX_CHAT_UPLOAD_TIMEOUT_SEC,
      new_asset_settings: assetSettings,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as MuxDirectUploadResponse & { error?: { message?: string } };
  if (!res.ok) {
    const msg = json?.error?.message ?? `Mux upload oluşturulamadı (HTTP ${res.status})`;
    throw new Error(msg);
  }
  if (!json?.data?.id || !json?.data?.url) throw new Error("Mux yanıtı geçersiz");
  return json.data;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Mux webhook imzası — https://docs.mux.com/docs/core/verify-webhook-signatures */
export async function verifyMuxWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  toleranceSec = 300,
): Promise<boolean> {
  const secret = (Deno.env.get("MUX_WEBHOOK_SECRET") ?? "").trim();
  if (!secret || !signatureHeader) return false;

  let timestamp = "";
  let signature = "";
  for (const part of signatureHeader.split(",")) {
    const [k, v] = part.trim().split("=");
    if (k === "t") timestamp = v ?? "";
    if (k === "v1") signature = v ?? "";
  }
  if (!timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > toleranceSec) return false;

  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  return timingSafeEqual(expected, signature);
}

export function muxHlsUrl(playbackId: string): string {
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

export function muxThumbnailUrl(playbackId: string, width = 400): string {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?width=${width}&time=1`;
}

type MuxUploadGet = {
  data?: {
    id?: string;
    status?: string;
    asset_id?: string | null;
  };
};

type MuxAssetGet = {
  data?: {
    id?: string;
    status?: string;
    playback_ids?: { id?: string; policy?: string }[];
  };
};

export async function muxGetDirectUpload(uploadId: string): Promise<MuxUploadGet["data"]> {
  const res = await fetch(`${MUX_API}/uploads/${encodeURIComponent(uploadId)}`, {
    headers: { Authorization: muxBasicAuthHeader() },
  });
  const json = (await res.json().catch(() => ({}))) as MuxUploadGet;
  if (!res.ok) throw new Error(`Mux upload okunamadı (${res.status})`);
  return json.data;
}

export async function muxGetAsset(assetId: string): Promise<MuxAssetGet["data"]> {
  const res = await fetch(`${MUX_API}/assets/${encodeURIComponent(assetId)}`, {
    headers: { Authorization: muxBasicAuthHeader() },
  });
  const json = (await res.json().catch(() => ({}))) as MuxAssetGet;
  if (!res.ok) throw new Error(`Mux asset okunamadı (${res.status})`);
  return json.data;
}

/** Mux API’den hazır playback varsa mesajı günceller (webhook beklemeden). */
export async function syncChatMessageFromMux(
  admin: SupabaseClient,
  messageId: string,
): Promise<{ ready: boolean; media_url?: string }> {
  const { data: track } = await admin
    .from("message_mux_uploads")
    .select("mux_upload_id, mux_asset_id, mux_playback_id, status")
    .eq("message_id", messageId)
    .maybeSingle();

  if (!track) return { ready: false };
  if (track.status === "ready" && track.mux_playback_id) {
    const hls = muxHlsUrl(track.mux_playback_id);
    const thumb = muxThumbnailUrl(track.mux_playback_id);
    await admin
      .from("messages")
      .update({
        media_url: hls,
        media_thumbnail: thumb,
        mime_type: "application/x-mpegURL",
      })
      .eq("id", messageId);
    return { ready: true, media_url: hls };
  }

  let assetId = track.mux_asset_id;
  if (!assetId) {
    const upload = await muxGetDirectUpload(track.mux_upload_id);
    assetId = upload?.asset_id ?? null;
    if (assetId) {
      await admin
        .from("message_mux_uploads")
        .update({ mux_asset_id: assetId, status: "processing", updated_at: new Date().toISOString() })
        .eq("message_id", messageId);
    }
  }

  if (!assetId) return { ready: false };

  const asset = await muxGetAsset(assetId);
  if (asset?.status !== "ready") return { ready: false };

  const playbackId = asset.playback_ids?.[0]?.id;
  if (!playbackId) return { ready: false };

  const hls = muxHlsUrl(playbackId);
  const thumb = muxThumbnailUrl(playbackId);

  await admin
    .from("message_mux_uploads")
    .update({
      mux_asset_id: assetId,
      mux_playback_id: playbackId,
      status: "ready",
      updated_at: new Date().toISOString(),
    })
    .eq("message_id", messageId);

  await admin
    .from("messages")
    .update({
      media_url: hls,
      media_thumbnail: thumb,
      mime_type: "application/x-mpegURL",
    })
    .eq("id", messageId);

  return { ready: true, media_url: hls };
}

/** Mux API’den hazır playback varsa story’yi günceller. */
export async function syncStoryFromMux(
  admin: SupabaseClient,
  storyId: string,
): Promise<{ ready: boolean; media_url?: string; thumbnail_url?: string }> {
  const { data: track } = await admin
    .from("feed_story_mux_uploads")
    .select("mux_upload_id, mux_asset_id, mux_playback_id, status")
    .eq("story_id", storyId)
    .maybeSingle();

  if (!track) return { ready: false };
  if (track.status === "ready" && track.mux_playback_id) {
    const hls = muxHlsUrl(track.mux_playback_id);
    const thumb = muxThumbnailUrl(track.mux_playback_id);
    return { ready: true, media_url: hls, thumbnail_url: thumb };
  }

  let assetId = track.mux_asset_id;
  if (!assetId) {
    const upload = await muxGetDirectUpload(track.mux_upload_id);
    assetId = upload?.asset_id ?? null;
    if (assetId) {
      await admin
        .from("feed_story_mux_uploads")
        .update({ mux_asset_id: assetId, status: "processing", updated_at: new Date().toISOString() })
        .eq("story_id", storyId);
    }
  }

  if (!assetId) return { ready: false };

  const asset = await muxGetAsset(assetId);
  if (asset?.status !== "ready") return { ready: false };

  const playbackId = asset.playback_ids?.[0]?.id;
  if (!playbackId) return { ready: false };

  const hls = muxHlsUrl(playbackId);
  const thumb = muxThumbnailUrl(playbackId);

  await admin
    .from("feed_story_mux_uploads")
    .update({
      mux_asset_id: assetId,
      mux_playback_id: playbackId,
      status: "ready",
      updated_at: new Date().toISOString(),
    })
    .eq("story_id", storyId);

  await admin
    .from("feed_stories")
    .update({
      media_url: hls,
      thumbnail_url: thumb,
    })
    .eq("id", storyId);

  return { ready: true, media_url: hls, thumbnail_url: thumb };
}
