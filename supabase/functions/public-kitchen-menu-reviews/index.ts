/**
 * Public kitchen menu dish reviews — list + media upload + submit (no login).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

const JSON_HEADERS = { ...CORS, "Content-Type": "application/json; charset=utf-8" };
const BUCKET = "kitchen-menu-reviews";
const MAX_FILES = 4;
const MAX_FILE_BYTES = 40 * 1024 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/3gpp",
]);

const rateMap = new Map<string, { count: number; resetAt: number }>();

type MediaItem = { url: string; type: "image" | "video"; mime: string; name?: string };

function json(obj: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
}

function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const row = rateMap.get(ip);
  if (!row || now > row.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (row.count >= RATE_MAX) return false;
  row.count += 1;
  return true;
}

function extForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic" || mime === "image/heif") return "heic";
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/quicktime") return "mov";
  if (mime === "video/webm") return "webm";
  if (mime === "video/3gpp") return "3gp";
  return "jpg";
}

function mediaKind(mime: string): "image" | "video" {
  return mime.startsWith("video/") ? "video" : "image";
}

function normalizeText(v: unknown, max = 2000): string {
  return String(v ?? "")
    .trim()
    .slice(0, max);
}

function isUuid(v: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(v);
}

async function resolveOrgBySlug(
  supabase: ReturnType<typeof createClient>,
  slug: string
): Promise<{ id: string; name: string } | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, public_kitchen_menu_enabled")
    .eq("slug", normalized)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; name: string; public_kitchen_menu_enabled?: boolean };
  if (row.public_kitchen_menu_enabled === false) return null;
  return { id: row.id, name: row.name };
}

async function assertItemInOrg(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  itemId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("hotel_kitchen_menu_items")
    .select("id")
    .eq("id", itemId)
    .eq("organization_id", orgId)
    .eq("is_available", true)
    .maybeSingle();
  return !!data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Sunucu yapılandırma hatası" }, 500);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (req.method === "GET") {
    const url = new URL(req.url);
    const slug = normalizeText(url.searchParams.get("slug"), 80);
    const itemId = normalizeText(url.searchParams.get("item_id"), 64);
    if (!slug || !isUuid(itemId)) {
      return json({ error: "slug ve item_id gerekli" }, 400);
    }
    const org = await resolveOrgBySlug(supabase, slug);
    if (!org) return json({ error: "Menü bulunamadı" }, 404);
    if (!(await assertItemInOrg(supabase, org.id, itemId))) {
      return json({ error: "Ürün bulunamadı" }, 404);
    }
    const { data, error } = await supabase
      .from("kitchen_menu_item_reviews")
      .select("id, rating, comment, display_name, media_urls, created_at")
      .eq("menu_item_id", itemId)
      .eq("organization_id", org.id)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, reviews: data ?? [] });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const ip = clientIp(req);
  if (!rateLimit(ip)) {
    return json({ error: "Çok fazla istek. Lütfen bir dakika sonra tekrar deneyin." }, 429);
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let body: Record<string, unknown> = {};

    if (contentType.includes("application/json")) {
      body = (await req.json()) as Record<string, unknown>;
    } else if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      body = {
        action: form.get("action"),
        slug: form.get("slug"),
        item_id: form.get("item_id"),
        rating: form.get("rating"),
        comment: form.get("comment"),
        display_name: form.get("display_name"),
      };
      const media: MediaItem[] = [];
      for (const [key, value] of form.entries()) {
        if (key !== "file" && key !== "files") continue;
        if (!(value instanceof File)) continue;
        if (media.length >= MAX_FILES) break;
        const mime = (value.type || "image/jpeg").toLowerCase();
        if (!ALLOWED_MIME.has(mime)) continue;
        if (value.size > MAX_FILE_BYTES) continue;
        const bytes = new Uint8Array(await value.arrayBuffer());
        const id = crypto.randomUUID();
        const path = `public/${new Date().toISOString().slice(0, 10)}/${id}.${extForMime(mime)}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
          contentType: mime,
          upsert: false,
        });
        if (error) continue;
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
        media.push({
          url: urlData.publicUrl || `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`,
          type: mediaKind(mime),
          mime,
          name: value.name,
        });
      }
      body.media_urls = media;
      body.action = body.action || "submit";
    } else {
      return json({ error: "JSON veya multipart bekleniyor" }, 400);
    }

    const action = normalizeText(body.action, 40) || "submit";

    if (action === "list") {
      const slug = normalizeText(body.slug, 80);
      const itemId = normalizeText(body.item_id, 64);
      if (!slug || !isUuid(itemId)) return json({ error: "slug ve item_id gerekli" }, 400);
      const org = await resolveOrgBySlug(supabase, slug);
      if (!org) return json({ error: "Menü bulunamadı" }, 404);
      if (!(await assertItemInOrg(supabase, org.id, itemId))) {
        return json({ error: "Ürün bulunamadı" }, 404);
      }
      const { data, error } = await supabase
        .from("kitchen_menu_item_reviews")
        .select("id, rating, comment, display_name, media_urls, created_at")
        .eq("menu_item_id", itemId)
        .eq("organization_id", org.id)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, reviews: data ?? [] });
    }

    if (action === "signed-upload") {
      const mime = normalizeText(body.mime, 80).toLowerCase() || "image/jpeg";
      if (!ALLOWED_MIME.has(mime)) {
        return json({ error: `Desteklenmeyen dosya türü: ${mime}` }, 400);
      }
      const id = crypto.randomUUID();
      const path = `public/${new Date().toISOString().slice(0, 10)}/${id}.${extForMime(mime)}`;
      const { data: signedData, error: signedErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUploadUrl(path);
      if (signedErr || !signedData?.token) {
        return json({ error: signedErr?.message || "Yükleme linki oluşturulamadı" }, 500);
      }
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      return json({
        ok: true,
        path,
        token: signedData.token,
        signedUrl: signedData.signedUrl ?? null,
        publicUrl: urlData.publicUrl,
        type: mediaKind(mime),
        mime,
      });
    }

    if (action !== "submit") {
      return json({ error: "Bilinmeyen action" }, 400);
    }

    const slug = normalizeText(body.slug, 80);
    const itemId = normalizeText(body.item_id, 64);
    const displayName = normalizeText(body.display_name, 80);
    const comment = normalizeText(body.comment, 2000);
    const ratingRaw = Number(body.rating);
    const rating = Number.isFinite(ratingRaw) ? Math.round(ratingRaw) : 0;

    if (!slug || !isUuid(itemId)) return json({ error: "slug ve item_id gerekli" }, 400);
    if (rating < 1 || rating > 5) return json({ error: "Puan 1–5 olmalı" }, 400);
    if (displayName.length < 2) return json({ error: "Lütfen adınızı yazın" }, 400);

    const media: MediaItem[] = [];
    const existing = Array.isArray(body.media_urls) ? body.media_urls : [];
    for (const item of existing.slice(0, MAX_FILES)) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const url = normalizeText(row.url, 2000);
      if (!url.startsWith("http")) continue;
      const mime = normalizeText(row.mime, 80) || "image/jpeg";
      media.push({
        url,
        type: mediaKind(mime),
        mime,
        name: normalizeText(row.name, 120) || undefined,
      });
    }

    if (!comment && media.length === 0) {
      return json({ error: "Yorum metni veya en az bir fotoğraf/video gerekli" }, 400);
    }

    const org = await resolveOrgBySlug(supabase, slug);
    if (!org) return json({ error: "Menü bulunamadı" }, 404);
    if (!(await assertItemInOrg(supabase, org.id, itemId))) {
      return json({ error: "Ürün bulunamadı" }, 404);
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("kitchen_menu_item_reviews")
      .insert({
        organization_id: org.id,
        menu_item_id: itemId,
        rating,
        comment: comment || null,
        display_name: displayName,
        media_urls: media,
        status: "published",
        client_ip: ip,
        user_agent: normalizeText(req.headers.get("user-agent"), 300) || null,
      })
      .select("id, rating, comment, display_name, media_urls, created_at")
      .single();

    if (insertErr) return json({ error: insertErr.message || "Kayıt başarısız" }, 500);

    const { data: itemStats } = await supabase
      .from("hotel_kitchen_menu_items")
      .select("review_count, rating_avg")
      .eq("id", itemId)
      .maybeSingle();

    return json({
      ok: true,
      review: inserted,
      review_count: Number((itemStats as { review_count?: number } | null)?.review_count ?? 0),
      rating_avg: Number((itemStats as { rating_avg?: number } | null)?.rating_avg ?? 0),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Beklenmeyen hata";
    return json({ error: msg }, 500);
  }
});
