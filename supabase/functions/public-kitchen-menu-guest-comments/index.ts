/**
 * Public kitchen menu guest book — org-level comments (no login).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

const JSON_HEADERS = { ...CORS, "Content-Type": "application/json; charset=utf-8" };
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 8;

const rateMap = new Map<string, { count: number; resetAt: number }>();

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

function normalizeText(v: unknown, max = 800): string {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

function newDeleteToken(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  }
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

function mapComment(row: Record<string, unknown>) {
  const first = String(row.first_name ?? "").trim();
  const last = String(row.last_name ?? "").trim();
  const initials =
    `${first.charAt(0)}${last.charAt(0)}`.toLocaleUpperCase("tr-TR") || "?";
  return {
    id: String(row.id),
    first_name: first,
    last_name: last,
    display_name: `${first} ${last}`.trim(),
    initials,
    comment: String(row.comment ?? "").trim(),
    rating: Number(row.rating) || 0,
    created_at: String(row.created_at ?? ""),
  };
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
    if (!slug) return json({ error: "slug gerekli" }, 400);
    const org = await resolveOrgBySlug(supabase, slug);
    if (!org) return json({ error: "Menü bulunamadı" }, 404);

    const { data, error } = await supabase
      .from("kitchen_menu_guest_comments")
      .select("id, first_name, last_name, comment, rating, created_at")
      .eq("organization_id", org.id)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) return json({ error: error.message }, 500);

    const comments = (data ?? []).map((r) => mapComment(r as Record<string, unknown>));
    const count = comments.length;
    const rating_avg =
      count > 0
        ? Math.round((comments.reduce((s, c) => s + c.rating, 0) / count) * 10) / 10
        : 0;
    return json({ ok: true, comments, count, rating_avg });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const ip = clientIp(req);
  if (!rateLimit(ip)) {
    return json({ error: "Çok fazla istek. Lütfen bir dakika sonra tekrar deneyin." }, 429);
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = normalizeText(body.action, 40) || "submit";
    const slug = normalizeText(body.slug, 80);
    if (!slug) return json({ error: "slug gerekli" }, 400);

    const org = await resolveOrgBySlug(supabase, slug);
    if (!org) return json({ error: "Menü bulunamadı" }, 404);

    if (action === "delete") {
      const commentId = normalizeText(body.comment_id, 64);
      const deleteToken = normalizeText(body.delete_token, 96);
      if (!/^[0-9a-f-]{36}$/i.test(commentId)) {
        return json({ error: "Geçersiz yorum" }, 400);
      }
      if (deleteToken.length < 16) {
        return json({ error: "Silme yetkisi yok" }, 403);
      }
      const { data: row, error: findErr } = await supabase
        .from("kitchen_menu_guest_comments")
        .select("id, delete_token, status")
        .eq("id", commentId)
        .eq("organization_id", org.id)
        .maybeSingle();
      if (findErr || !row) return json({ error: "Yorum bulunamadı" }, 404);
      const stored = String((row as { delete_token?: string }).delete_token ?? "");
      if (!stored || stored !== deleteToken) {
        return json({ error: "Bu yorumu silme yetkiniz yok" }, 403);
      }
      const { error: updErr } = await supabase
        .from("kitchen_menu_guest_comments")
        .update({ status: "hidden" })
        .eq("id", commentId)
        .eq("organization_id", org.id);
      if (updErr) return json({ error: updErr.message }, 500);
      return json({ ok: true, deleted: true, id: commentId });
    }

    const firstName = normalizeText(body.first_name, 60);
    const lastName = normalizeText(body.last_name, 60);
    const comment = normalizeText(body.comment, 800);
    const rating = Math.min(5, Math.max(1, Math.round(Number(body.rating) || 0)));

    if (firstName.length < 1) return json({ error: "Ad gerekli" }, 400);
    if (lastName.length < 1) return json({ error: "Soyad gerekli" }, 400);
    if (comment.length < 2) return json({ error: "Yorum gerekli" }, 400);
    if (rating < 1 || rating > 5) return json({ error: "Geçersiz puan" }, 400);

    const deleteToken = newDeleteToken();

    const { data, error } = await supabase
      .from("kitchen_menu_guest_comments")
      .insert({
        organization_id: org.id,
        first_name: firstName,
        last_name: lastName,
        comment,
        rating,
        status: "published",
        delete_token: deleteToken,
        client_ip: ip.slice(0, 64),
        user_agent: (req.headers.get("user-agent") || "").slice(0, 240),
      })
      .select("id, first_name, last_name, comment, rating, created_at")
      .single();

    if (error || !data) return json({ error: error?.message || "Kayıt başarısız" }, 500);

    return json({
      ok: true,
      comment: mapComment(data as Record<string, unknown>),
      delete_token: deleteToken,
    });
  } catch (e) {
    return json({ error: (e as Error)?.message || "İstek işlenemedi" }, 500);
  }
});
