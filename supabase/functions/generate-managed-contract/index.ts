// Valoria Hotel — DeepSeek ile yönetilen sözleşme taslağı oluşturma
// POST { prompt, organizationId, contractType?, context? }
// Secret: DEEPSEEK_API_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEEPSEEK_TIMEOUT_MS = 55_000;
const CONTRACT_TYPES = new Set([
  "kitchen_operation",
  "staff_employment",
  "cleaning_service",
  "supplier",
  "lease",
  "subcontractor",
  "other",
]);

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  kitchen_operation: "Mutfak İşletme Sözleşmesi",
  staff_employment: "Personel Sözleşmesi",
  cleaning_service: "Temizlik Hizmet Sözleşmesi",
  supplier: "Tedarikçi Sözleşmesi",
  lease: "Kira Sözleşmesi",
  subcontractor: "Taşeron Sözleşmesi",
  other: "Diğer",
};

type PartyContext = {
  role?: string;
  company?: string;
  fullName?: string;
  authorityTitle?: string;
  taxOrId?: string;
  phone?: string;
  email?: string;
  address?: string;
};

type RequestContext = {
  title?: string;
  startDate?: string;
  endDate?: string;
  bodyText?: string;
  specialClauses?: string;
  party1?: PartyContext;
  party2?: PartyContext;
  organizationName?: string;
};

type GeneratedContract = {
  title?: string;
  contractType?: string;
  startDate?: string | null;
  endDate?: string | null;
  bodyText?: string;
  specialClauses?: string | null;
  party1?: PartyContext | null;
  party2?: PartyContext | null;
};

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function staffCanManageContracts(staff: {
  role?: string | null;
  app_permissions?: Record<string, boolean> | null;
}): boolean {
  const perms = staff.app_permissions ?? {};
  return (
    staff.role === "admin" ||
    perms.super_admin === true ||
    perms.sozlesme_yonetimi === true
  );
}

function staffCanAccessOrg(
  staff: { role?: string | null; organization_id?: string | null; app_permissions?: Record<string, boolean> | null },
  orgId: string,
): boolean {
  if (staff.app_permissions?.super_admin === true) return true;
  if (staff.role === "admin") return true;
  return staff.organization_id === orgId;
}

function extractJsonObject(raw: string): GeneratedContract {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("AI yanıtı JSON formatında değil");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as GeneratedContract;
}

function sanitizeDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function sanitizeParty(raw: unknown): PartyContext | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const pick = (key: keyof PartyContext) => {
    const v = p[key];
    return typeof v === "string" ? v.trim() : "";
  };
  const party: PartyContext = {
    role: pick("role"),
    company: pick("company"),
    fullName: pick("fullName"),
    authorityTitle: pick("authorityTitle"),
    taxOrId: pick("taxOrId"),
    phone: pick("phone"),
    email: pick("email"),
    address: pick("address"),
  };
  const hasValue = Object.values(party).some((v) => !!v);
  return hasValue ? party : null;
}

function normalizeGenerated(raw: GeneratedContract): GeneratedContract {
  const contractType =
    typeof raw.contractType === "string" && CONTRACT_TYPES.has(raw.contractType)
      ? raw.contractType
      : undefined;

  return {
    title: typeof raw.title === "string" ? raw.title.trim() : undefined,
    contractType,
    startDate: sanitizeDate(raw.startDate),
    endDate: sanitizeDate(raw.endDate),
    bodyText: typeof raw.bodyText === "string" ? raw.bodyText.trim() : undefined,
    specialClauses:
      typeof raw.specialClauses === "string" ? raw.specialClauses.trim() : raw.specialClauses === null ? null : undefined,
    party1: sanitizeParty(raw.party1),
    party2: sanitizeParty(raw.party2),
  };
}

async function generateWithDeepSeek(
  prompt: string,
  contractType: string,
  context: RequestContext,
): Promise<GeneratedContract> {
  const apiKey = (Deno.env.get("DEEPSEEK_API_KEY") ?? "").trim();
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured in Supabase secrets");
  }

  const typeLabel = CONTRACT_TYPE_LABELS[contractType] ?? contractType;
  const contextJson = JSON.stringify(context, null, 2);

  const systemPrompt =
    "Sen Türkiye'deki otel ve turizm işletmeleri için profesyonel sözleşme metni hazırlayan bir hukuk asistanısın. " +
    "Kullanıcının doğal dildeki talebine göre resmi, anlaşılır ve uygulanabilir bir sözleşme taslağı oluştur. " +
    "Yalnızca geçerli JSON döndür — markdown, açıklama veya kod bloğu ekleme. " +
    'JSON şeması: {"title":"string","contractType":"kitchen_operation|staff_employment|cleaning_service|supplier|lease|subcontractor|other","startDate":"YYYY-MM-DD veya null","endDate":"YYYY-MM-DD veya null","bodyText":"tam sözleşme metni (madde madde, Türkçe)","specialClauses":"ek maddeler veya null","party1":{"role":"","company":"","fullName":"","authorityTitle":"","taxOrId":"","phone":"","email":"","address":""} veya null,"party2": aynı yapı veya null}. ' +
    "bodyText en az 8 madde içermeli; taraflar, konu, süre, ücret/ödeme (varsa), yükümlülükler, gizlilik, fesih, uyuşmazlık ve imza bölümü olsun. " +
    "Mevcut form bilgilerini koru ve eksikleri tamamla; kullanıcı açıkça değiştirmeni istemedikçe dolu alanları boşaltma. " +
    "Tarih bilmiyorsan null bırak. Uydurma kanun maddesi numarası verme.";

  const userPrompt =
    `Sözleşme türü etiketi: ${typeLabel} (${contractType})\n\n` +
    `Mevcut form bağlamı:\n${contextJson}\n\n` +
    `Kullanıcı talebi:\n${prompt}\n\n` +
    "Yukarıdaki talebe göre sözleşme taslağını JSON olarak üret.";

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
  const normalized = normalizeGenerated(parsed);
  if (!normalized.title?.trim()) {
    throw new Error("AI başlık üretemedi");
  }
  if (!normalized.bodyText?.trim()) {
    throw new Error("AI sözleşme metni üretemedi");
  }
  return normalized;
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
      contractType?: string;
      context?: RequestContext;
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

    const contractType =
      typeof body.contractType === "string" && CONTRACT_TYPES.has(body.contractType)
        ? body.contractType
        : "other";

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
    if (!staffCanManageContracts(staff)) {
      return json({ error: "Sözleşme oluşturma yetkiniz yok" }, 403);
    }
    if (!staffCanAccessOrg(staff, organizationId)) {
      return json({ error: "Bu organizasyon için yetkiniz yok" }, 403);
    }

    const context = body.context ?? {};
    const generated = await generateWithDeepSeek(prompt, contractType, context);

    return json({ contract: generated }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Contract generation failed";
    console.error("generate-managed-contract", message);
    const isTimeout = message.includes("zaman aşımı") || message.includes("timeout");
    const isConfig = message.includes("DEEPSEEK_API_KEY");
    const status = isConfig ? 503 : isTimeout ? 504 : 500;
    return json({ error: message }, status);
  }
});
