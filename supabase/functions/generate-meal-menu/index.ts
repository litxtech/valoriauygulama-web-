// Valoria Hotel — DeepSeek ile personel yemek listesi oluşturma
// POST { prompt, organizationId, periodMonth, editableDates, todayYmd, organizationName?, existingDays? }
// Secret: DEEPSEEK_API_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEEPSEEK_TIMEOUT_MS = 55_000;

type MealDay = {
  date: string;
  breakfast: string;
  lunch: string;
  dinner: string;
};

type ExistingDay = {
  date: string;
  breakfast?: string | null;
  lunch?: string | null;
  dinner?: string | null;
};

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function staffCanManageMealMenu(staff: {
  role?: string | null;
  app_permissions?: Record<string, boolean> | null;
}): boolean {
  const perms = staff.app_permissions ?? {};
  return staff.role === "admin" || perms.super_admin === true || perms.yemek_listesi_olustur === true;
}

function staffCanAccessOrg(
  staff: { role?: string | null; organization_id?: string | null; app_permissions?: Record<string, boolean> | null },
  orgId: string,
): boolean {
  if (staff.app_permissions?.super_admin === true) return true;
  if (staff.role === "admin") return true;
  return staff.organization_id === orgId;
}

function isValidYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function extractJsonObject(raw: string): { days?: MealDay[] } {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("AI yanıtı JSON değil");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as { days?: MealDay[] };
}

function normalizeDays(raw: MealDay[], allowedSet: Set<string>): MealDay[] {
  const out: MealDay[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const date = (row.date ?? "").slice(0, 10);
    if (!isValidYmd(date) || !allowedSet.has(date) || seen.has(date)) continue;
    seen.add(date);
    out.push({
      date,
      breakfast: String(row.breakfast ?? "").trim(),
      lunch: String(row.lunch ?? "").trim(),
      dinner: String(row.dinner ?? "").trim(),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

async function generateWithDeepSeek(
  prompt: string,
  context: {
    organizationName?: string;
    periodMonth: string;
    editableDates: string[];
    todayYmd: string;
    existingDays: ExistingDay[];
  },
): Promise<MealDay[]> {
  const apiKey = (Deno.env.get("DEEPSEEK_API_KEY") ?? "").trim();
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured in Supabase secrets");
  }

  const hotel = context.organizationName?.trim() || "Otel";
  const dateList = context.editableDates.join(", ");
  const existingSample = context.existingDays
    .filter((d) => (d.breakfast?.trim() || d.lunch?.trim() || d.dinner?.trim()))
    .slice(0, 8)
    .map((d) => ({
      date: d.date,
      breakfast: d.breakfast ?? "",
      lunch: d.lunch ?? "",
      dinner: d.dinner ?? "",
    }));

  const systemPrompt =
    "Sen Türkiye'deki otel personel mutfağı için yemek listesi planlayan uzman bir asistansın. " +
    "Kullanıcının Türkçe doğal dil talebini anla: tarih aralıkları, hafta içi/sonu kuralları, " +
    "sabit kahvaltı/öğle/akşam menüleri, çeşitlilik istekleri. " +
    "SADECE geçerli JSON döndür, başka metin yazma. Şema: " +
    '{"days":[{"date":"YYYY-MM-DD","breakfast":"...","lunch":"...","dinner":"..."}]} ' +
    "Her gün için breakfast (kahvaltı), lunch (öğle yemeği), dinner (akşam yemeği) alanları zorunlu. " +
    "Menüler gerçekçi Türk otel mutfağı olsun; kısa ama somut (ör. Peynir, zeytin, yumurta, çay). " +
    "Sadece verilen düzenlenebilir tarihler listesindeki günleri kullan; geçmiş veya listede olmayan tarih üretme. " +
    "Bugün ve sonrası için plan yap; kullanıcı açıkça geçmiş tarih istemezse geçmişe yazma.";

  const userPrompt =
    `Otel: ${hotel}\n` +
    `Ay: ${context.periodMonth}\n` +
    `Bugün: ${context.todayYmd}\n` +
    `Düzenlenebilir tarihler (${context.editableDates.length} gün): ${dateList}\n` +
    (existingSample.length
      ? `Mevcut örnek günler (stil için): ${JSON.stringify(existingSample)}\n`
      : "") +
    `Kullanıcı talebi: ${prompt}\n` +
    "Talep edilen tüm günleri kapsayan days dizisini üret. Eksik gün bırakma.";

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
        temperature: 0.45,
        max_tokens: 8192,
        response_format: { type: "json_object" },
      }),
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      throw new Error("DeepSeek zaman aşımı — tekrar deneyin");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const rawBody = await res.text();
  if (!res.ok) {
    let detail = rawBody.slice(0, 300);
    try {
      const parsed = JSON.parse(rawBody) as { error?: { message?: string } };
      detail = parsed?.error?.message ?? detail;
    } catch {
      // keep raw slice
    }
    throw new Error(`DeepSeek ${res.status}: ${detail}`);
  }

  const data = JSON.parse(rawBody) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = (data.choices?.[0]?.message?.content ?? "").trim();
  if (!content) throw new Error("Boş AI yanıtı");

  const parsed = extractJsonObject(content);
  const allowedSet = new Set(context.editableDates);
  const days = normalizeDays(parsed.days ?? [], allowedSet);
  if (!days.length) {
    throw new Error("AI geçerli gün üretemedi — tarihleri kontrol edin");
  }
  return days;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: "Server configuration error" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt || jwt === anonKey) {
    return json({ error: "Authorization required (signed-in user)" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !userData?.user?.id) {
    return json({ error: "Invalid or expired session" }, 401);
  }

  try {
    const body = (await req.json()) as {
      prompt?: string;
      organizationId?: string;
      periodMonth?: string;
      editableDates?: string[];
      todayYmd?: string;
      organizationName?: string;
      existingDays?: ExistingDay[];
    };

    const prompt = (body.prompt ?? "").trim();
    if (!prompt) {
      return json({ error: "prompt is required" }, 400);
    }
    if (prompt.length > 4000) {
      return json({ error: "prompt too long (max 4000)" }, 400);
    }

    const organizationId = (body.organizationId ?? "").trim();
    if (!organizationId) {
      return json({ error: "organizationId is required" }, 400);
    }

    const periodMonth = (body.periodMonth ?? "").slice(0, 10);
    if (!isValidYmd(periodMonth)) {
      return json({ error: "periodMonth must be YYYY-MM-DD" }, 400);
    }

    const todayYmd = (body.todayYmd ?? "").slice(0, 10);
    if (!isValidYmd(todayYmd)) {
      return json({ error: "todayYmd must be YYYY-MM-DD" }, 400);
    }

    const editableDates = (body.editableDates ?? [])
      .map((d) => d.slice(0, 10))
      .filter((d) => isValidYmd(d) && d >= todayYmd);
    if (!editableDates.length) {
      return json({ error: "editableDates is empty" }, 400);
    }
    if (editableDates.length > 62) {
      return json({ error: "editableDates too large (max 62)" }, 400);
    }

    const { data: staff, error: staffErr } = await admin
      .from("staff")
      .select("id, role, organization_id, app_permissions")
      .eq("auth_id", userData.user.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (staffErr || !staff) {
      return json({ error: "Staff profile not found" }, 403);
    }
    if (!staffCanManageMealMenu(staff)) {
      return json({ error: "Yemek listesi düzenleme yetkiniz yok" }, 403);
    }
    if (!staffCanAccessOrg(staff, organizationId)) {
      return json({ error: "Bu organizasyon için yetkiniz yok" }, 403);
    }

    const existingDays = (body.existingDays ?? []).map((d) => ({
      date: (d.date ?? "").slice(0, 10),
      breakfast: d.breakfast ?? null,
      lunch: d.lunch ?? null,
      dinner: d.dinner ?? null,
    }));

    const days = await generateWithDeepSeek(prompt, {
      organizationName: body.organizationName,
      periodMonth,
      editableDates,
      todayYmd,
      existingDays,
    });

    return json({ days }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Meal menu generation failed";
    console.error("generate-meal-menu", message);
    const isTimeout = message.includes("zaman aşımı") || message.includes("timeout");
    const isConfig = message.includes("DEEPSEEK_API_KEY");
    const status = isConfig ? 503 : isTimeout ? 504 : 500;
    return json({ error: message }, status);
  }
});
