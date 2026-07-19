/**
 * QR şikayet hattı — anonim web formu.
 * POST multipart: metin + isteğe bağlı görsel/video
 * veya JSON: { action: "submit", ... } + önceden yüklenmiş media_urls
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

const JSON_HEADERS = { ...CORS, "Content-Type": "application/json; charset=utf-8" };
const BUCKET = "qr-complaints";
const MAX_FILES = 4;
const MAX_FILE_BYTES = 40 * 1024 * 1024; // 40MB / dosya
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 8;

const TOPIC_TYPES = new Set(["complaint", "suggestion", "thanks"]);
const CATEGORIES = new Set([
  "personnel",
  "room_issue",
  "payment",
  "reception_checkin_checkout",
  "passport",
  "noise",
  "breakfast",
  "food",
  "other",
]);

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
const SOLE_ADMIN_AUTH_ID = "8eabcee5-44bb-47c9-b05c-c98d9503b171";
const DEEPSEEK_TIMEOUT_MS = 28_000;
const META_SETTING_KEY = "qr_complaint_public_meta";

const DEFAULT_META = {
  title: "Valoria Hotel & Bavulsuite Sorumlusu",
  brands: "Valoria Hotel · Bavulsuite",
  note:
    "Anlık şikayet değerlendirilir. Mesajınız doğrudan sorumlu yöneticiye iletilir — giriş yapmanız gerekmez.",
};

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

type MediaItem = { url: string; type: "image" | "video"; mime: string; name?: string };

type PublicMeta = {
  name: string;
  title: string;
  brands: string;
  note: string;
  photoUrl: string | null;
  staffId: string | null;
};

async function loadPublicMeta(
  supabase: ReturnType<typeof createClient>
): Promise<PublicMeta> {
  const { data: setting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", META_SETTING_KEY)
    .maybeSingle();

  const raw = (setting?.value ?? {}) as Record<string, unknown>;
  const staffId =
    typeof raw.staff_id === "string" && /^[0-9a-f-]{36}$/i.test(raw.staff_id)
      ? raw.staff_id
      : null;
  const title =
    typeof raw.title === "string" && raw.title.trim()
      ? raw.title.trim()
      : DEFAULT_META.title;
  const brands =
    typeof raw.brands === "string" && raw.brands.trim()
      ? raw.brands.trim()
      : DEFAULT_META.brands;
  const note =
    typeof raw.note === "string" && raw.note.trim()
      ? raw.note.trim()
      : DEFAULT_META.note;
  const nameOverride =
    typeof raw.name_override === "string" && raw.name_override.trim()
      ? raw.name_override.trim()
      : null;
  const photoOverride =
    typeof raw.photo_override === "string" && raw.photo_override.trim()
      ? raw.photo_override.trim()
      : null;

  let staff: { id: string; full_name: string | null; profile_image: string | null } | null = null;
  if (staffId) {
    const { data } = await supabase
      .from("staff")
      .select("id, full_name, profile_image")
      .eq("id", staffId)
      .maybeSingle();
    staff = data as typeof staff;
  }
  if (!staff) {
    const { data } = await supabase
      .from("staff")
      .select("id, full_name, profile_image")
      .eq("auth_id", SOLE_ADMIN_AUTH_ID)
      .maybeSingle();
    staff = data as typeof staff;
  }
  if (!staff) {
    const { data } = await supabase
      .from("staff")
      .select("id, full_name, profile_image")
      .eq("role", "admin")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    staff = data as typeof staff;
  }

  return {
    name: nameOverride || staff?.full_name?.trim() || "Soner",
    title,
    brands,
    note,
    photoUrl: photoOverride || staff?.profile_image || null,
    staffId: staff?.id ?? null,
  };
}

async function improveComplaintText(params: {
  text: string;
  topicType: string;
  category: string;
  lang?: string;
}): Promise<string> {
  const apiKey = (Deno.env.get("DEEPSEEK_API_KEY") ?? "").trim();
  if (!apiKey) throw new Error("AI support is not configured");

  const lang = ["tr", "en", "ar"].includes(params.lang || "") ? (params.lang as string) : "tr";
  const langName = lang === "en" ? "English" : lang === "ar" ? "Arabic" : "Turkish";

  const topicLabel =
    params.topicType === "suggestion"
      ? "suggestion"
      : params.topicType === "thanks"
      ? "thanks"
      : "complaint";

  const systemPrompt =
    `You are a hotel guest communication assistant (Valoria Hotel / Bavulsuite). ` +
    `Rewrite the guest's draft into polite, clear, professional ${langName}. ` +
    `Do not change meaning, exaggerate, or invent details. ` +
    `Keep it short (max 2-3 paragraphs). Return ONLY the rewritten text — no quotes, markdown, or commentary.`;

  const userPrompt =
    `Type: ${topicLabel}\nCategory: ${params.category}\nLanguage: ${langName}\n\nGuest draft:\n${params.text}\n\n` +
    `Rewrite for hotel management in ${langName}.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.35,
        max_tokens: 1200,
      }),
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      throw new Error("AI timeout — try again");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const rawBody = await res.text();
  if (!res.ok) {
    throw new Error(`AI error (${res.status})`);
  }
  const data = JSON.parse(rawBody) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = (data.choices?.[0]?.message?.content ?? "").trim();
  if (!content) throw new Error("Empty AI response");
  return content.replace(/^["']|["']$/g, "").trim();
}

async function notifyAdminsQrComplaint(
  supabaseUrl: string,
  serviceKey: string,
  payload: {
    id: string;
    topicType: string;
    category: string;
    description: string;
    roomNumber: string | null;
  }
) {
  const topicLabel =
    payload.topicType === "suggestion"
      ? "Öneri"
      : payload.topicType === "thanks"
      ? "Teşekkür"
      : "Şikayet";
  const roomBit = payload.roomNumber ? ` · Oda ${payload.roomNumber}` : "";
  const body = `${topicLabel}${roomBit}: ${payload.description.slice(0, 140)}`;
  try {
    await fetch(`${supabaseUrl}/functions/v1/notify-admins`, {
      method: "POST",
      signal: AbortSignal.timeout(6000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        title: "QR Şikayet Hattı",
        body,
        data: {
          url: "/admin/qr-complaints",
          screen: "admin/qr-complaints",
          notificationType: "qr_complaint_new",
          complaintId: payload.id,
          category: payload.category,
          topicType: payload.topicType,
          timestamp: new Date().toISOString(),
        },
      }),
    });
  } catch {
    // Push hatası gönderimi bozmasın
  }
}

async function uploadBytes(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  bytes: Uint8Array,
  mime: string,
  originalName?: string
): Promise<MediaItem> {
  if (!ALLOWED_MIME.has(mime)) {
    throw new Error(`Desteklenmeyen dosya türü: ${mime}`);
  }
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new Error("Dosya 40MB sınırını aşıyor");
  }
  const id = crypto.randomUUID();
  const path = `public/${new Date().toISOString().slice(0, 10)}/${id}.${extForMime(mime)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw new Error(error.message || "Yükleme başarısız");
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return {
    url: data.publicUrl || `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`,
    type: mediaKind(mime),
    mime,
    name: originalName,
  };
}

function normalizeText(v: unknown, max = 2000): string {
  return String(v ?? "")
    .trim()
    .slice(0, max);
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
    const meta = await loadPublicMeta(supabase);
    return json({
      ok: true,
      service: "public-complaint",
      loginRequired: false,
      topics: [...TOPIC_TYPES],
      categories: [...CATEGORIES],
      maxFiles: MAX_FILES,
      maxFileBytes: MAX_FILE_BYTES,
      requiredFields: ["contact_name", "phone", "room_number", "description"],
      responsible: meta,
    });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const ip = clientIp(req);
  if (!rateLimit(ip)) {
    return json({ error: "Çok fazla istek. Lütfen bir dakika sonra tekrar deneyin." }, 429);
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let topicType = "complaint";
    let category = "other";
    let description = "";
    let contactName = "";
    let phone = "";
    let roomNumber = "";
    let organizationId: string | null = null;
    const media: MediaItem[] = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      topicType = normalizeText(form.get("topic_type"), 32) || "complaint";
      category = normalizeText(form.get("category"), 64) || "other";
      description = normalizeText(form.get("description"), 4000);
      contactName = normalizeText(form.get("contact_name"), 120);
      phone = normalizeText(form.get("phone"), 40);
      roomNumber = normalizeText(form.get("room_number"), 40);
      const orgRaw = normalizeText(form.get("organization_id"), 64);
      if (orgRaw && /^[0-9a-f-]{36}$/i.test(orgRaw)) organizationId = orgRaw;

      const files: File[] = [];
      for (const [key, value] of form.entries()) {
        if (value instanceof File && value.size > 0 && (key === "media" || key.startsWith("file"))) {
          files.push(value);
        }
      }
      if (files.length > MAX_FILES) {
        return json({ error: `En fazla ${MAX_FILES} medya ekleyebilirsiniz` }, 400);
      }
      for (const file of files) {
        const mime = (file.type || "application/octet-stream").toLowerCase();
        const buf = new Uint8Array(await file.arrayBuffer());
        media.push(await uploadBytes(supabase, supabaseUrl, buf, mime, file.name));
      }
    } else {
      const body = await req.json() as Record<string, unknown>;
      const action = normalizeText(body.action, 40);

      if (action === "meta") {
        const meta = await loadPublicMeta(supabase);
        return json({ ok: true, loginRequired: false, responsible: meta });
      }

      if (action === "improve-text") {
        const text = normalizeText(body.text, 4000);
        if (text.length < 3) {
          return json({ error: "Önce kısa bir taslak yazın (en az birkaç kelime)." }, 400);
        }
        let tt = normalizeText(body.topic_type, 32) || "complaint";
        let cat = normalizeText(body.category, 64) || "other";
        if (!TOPIC_TYPES.has(tt)) tt = "complaint";
        if (!CATEGORIES.has(cat)) cat = "other";
        const improved = await improveComplaintText({
          text,
          topicType: tt,
          category: cat,
          lang: normalizeText(body.lang, 8) || "tr",
        });
        return json({ ok: true, text: improved });
      }

      // Büyük video/fotoğraf: imzalı yükleme URL’si (Edge gövde limitini aşmamak için)
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

      topicType = normalizeText(body.topic_type, 32) || "complaint";
      category = normalizeText(body.category, 64) || "other";
      description = normalizeText(body.description, 4000);
      contactName = normalizeText(body.contact_name, 120);
      phone = normalizeText(body.phone, 40);
      roomNumber = normalizeText(body.room_number, 40);
      const orgRaw = normalizeText(body.organization_id, 64);
      if (orgRaw && /^[0-9a-f-]{36}$/i.test(orgRaw)) organizationId = orgRaw;

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

      // Opsiyonel base64 medya (küçük görseller)
      const b64List = Array.isArray(body.media_base64) ? body.media_base64 : [];
      for (const item of b64List.slice(0, MAX_FILES - media.length)) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        const b64 = String(row.data ?? "").replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
        if (!b64 || b64.length > 6_000_000) continue;
        const mime = normalizeText(row.mime, 80) || "image/jpeg";
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        media.push(await uploadBytes(supabase, supabaseUrl, bytes, mime));
      }
    }

    if (!TOPIC_TYPES.has(topicType)) topicType = "complaint";
    if (!CATEGORIES.has(category)) category = "other";
    if (contactName.length < 2) {
      return json({ error: "Lütfen adınızı ve soyadınızı yazın." }, 400);
    }
    if (phone.length < 7) {
      return json({ error: "Lütfen geçerli bir telefon numarası yazın." }, 400);
    }
    if (roomNumber.length < 1) {
      return json({ error: "Lütfen oda numaranızı yazın." }, 400);
    }
    if (description.length < 1) {
      return json({ error: "Lütfen açıklamanızı yazın." }, 400);
    }

    const { data: row, error } = await supabase
      .from("qr_complaints")
      .insert({
        organization_id: organizationId,
        topic_type: topicType,
        category,
        description,
        contact_name: contactName || null,
        phone: phone || null,
        room_number: roomNumber || null,
        media_urls: media,
        source: "qr_web",
        client_ip: ip,
        user_agent: (req.headers.get("user-agent") || "").slice(0, 400) || null,
      })
      .select("id")
      .single();

    if (error || !row?.id) {
      return json({ error: error?.message || "Kayıt oluşturulamadı" }, 500);
    }

    await notifyAdminsQrComplaint(supabaseUrl, serviceKey, {
      id: row.id,
      topicType,
      category,
      description,
      roomNumber: roomNumber || null,
    });

    return json({
      ok: true,
      id: row.id,
      mediaCount: media.length,
      message: "Mesajınız iletildi. Teşekkür ederiz.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Beklenmeyen hata";
    return json({ error: msg }, 500);
  }
});
