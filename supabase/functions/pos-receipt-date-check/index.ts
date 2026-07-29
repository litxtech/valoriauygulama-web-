// Valoria Hotel — POS fiş tarihlerini AI ile kontrol / düzelt
// POST { items: [{ key, rawText?, currentDate?, batchConsensusDate? }], batchConsensusDate? }
// Secret: DEEPSEEK_API_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEEPSEEK_TIMEOUT_MS = 55_000;
const CHUNK = 10;

type InItem = {
  key: string;
  rawText?: string | null;
  currentDate?: string | null;
  batchConsensusDate?: string | null;
};

type OutItem = {
  key: string;
  date: string | null;
  time: string | null;
  confidence: "high" | "medium" | "low";
  action: "keep" | "fix" | "fill" | "flag";
  reason: string;
  flags: string[];
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function ymdOk(s: string | null | undefined): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const cand = new Date(y, m - 1, d, 12, 0, 0);
  const diff = Math.round((cand.getTime() - today.getTime()) / 86400000);
  if (diff > 5 || diff < -1500) return null;
  return s;
}

function timeOk(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (hh > 23 || mm > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}:${(m[3] ?? "00").padStart(2, "0")}`;
}

function extractJsonArray(raw: string): unknown[] | null {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence?.[1]?.trim() ?? trimmed;
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(body.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function deepSeekDateAudit(
  items: InItem[],
  batchConsensusDate: string | null
): Promise<OutItem[]> {
  const apiKey = (Deno.env.get("DEEPSEEK_API_KEY") ?? "").trim();
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured in Supabase secrets");

  const payload = items.map((it) => ({
    key: it.key,
    currentDate: it.currentDate ?? null,
    batchConsensusDate: it.batchConsensusDate ?? batchConsensusDate,
    ocrText: (it.rawText ?? "").slice(0, 3500),
  }));

  const systemPrompt =
    "You are an expert at reading Turkish POS / bank slip / market receipt OCR text. " +
    "OCR may be noisy (TAR1H, TAR!H, glued digits, swapped day/month). " +
    "Extract the receipt TRANSACTION date (TARIH / İŞLEM TARİHİ / FIS TARIHI), not expiry or promo dates. " +
    "Return ONLY a JSON array. Each element: " +
    '{"key":"...","date":"YYYY-MM-DD"|null,"time":"HH:MM:SS"|null,' +
    '"confidence":"high"|"medium"|"low","action":"keep"|"fix"|"fill"|"flag",' +
    '"reason":"short Turkish","flags":["missing"|"wrong"|"ambiguous"|"low_ocr"]}. ' +
    "Rules: action=keep if currentDate is correct; fix if wrong; fill if missing but found; flag if unsure. " +
    "Prefer labeled TARIH lines. If OCR empty/useless, use batchConsensusDate only with confidence=low and action=flag unless strongly implied. " +
    "Dates must be plausible (not far future).";

  const userPrompt =
    `Today (Europe/Istanbul context): ${new Date().toISOString().slice(0, 10)}\n` +
    `Batch consensus date hint: ${batchConsensusDate ?? "null"}\n` +
    `Items:\n${JSON.stringify(payload)}`;

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
        temperature: 0.05,
        max_tokens: 4096,
      }),
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw new Error("DeepSeek timeout — try again");
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
      /* keep */
    }
    throw new Error(`DeepSeek ${res.status}: ${detail}`);
  }

  const data = JSON.parse(rawBody) as { choices?: { message?: { content?: string } }[] };
  const content = (data.choices?.[0]?.message?.content ?? "").trim();
  const arr = extractJsonArray(content);
  if (!arr) throw new Error("AI yanıtı ayrıştırılamadı");

  const byKey = new Map(items.map((it) => [it.key, it]));
  const out: OutItem[] = [];

  for (const row of arr) {
    const r = row as Record<string, unknown>;
    const key = String(r.key ?? "");
    if (!key || !byKey.has(key)) continue;
    const cur = byKey.get(key)!;
    const date = ymdOk(r.date != null ? String(r.date) : null);
    const time = timeOk(r.time != null ? String(r.time) : null);
    let confidence = String(r.confidence ?? "low") as OutItem["confidence"];
    if (confidence !== "high" && confidence !== "medium" && confidence !== "low") confidence = "low";
    let action = String(r.action ?? "flag") as OutItem["action"];
    if (!["keep", "fix", "fill", "flag"].includes(action)) action = "flag";

    // Güvenlik: yüksek güven olmadan yanlışlıkla silme / rastgele tarih yok
    if (!date && (action === "fix" || action === "fill")) action = "flag";
    if (date && cur.currentDate === date && action !== "flag") action = "keep";
    if (date && !cur.currentDate && action === "keep") action = "fill";
    if (date && cur.currentDate && cur.currentDate !== date && action === "keep") action = "fix";
    if (confidence === "low" && (action === "fix" || action === "fill")) action = "flag";

    const flags = Array.isArray(r.flags)
      ? r.flags.map((x) => String(x)).filter(Boolean).slice(0, 6)
      : [];
    out.push({
      key,
      date,
      time,
      confidence,
      action,
      reason: String(r.reason ?? "").slice(0, 200) || "AI tarih kontrolü",
      flags,
    });
  }

  // Eksik key'ler için flag
  for (const it of items) {
    if (out.some((o) => o.key === it.key)) continue;
    out.push({
      key: it.key,
      date: ymdOk(it.currentDate),
      time: null,
      confidence: "low",
      action: it.currentDate ? "keep" : "flag",
      reason: "AI bu fişi döndürmedi",
      flags: it.currentDate ? [] : ["missing"],
    });
  }

  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return json({ ok: false, error: { code: "AUTH", message: "Oturum gerekli" } }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !anonKey) {
      return json({ ok: false, error: { code: "CONFIG", message: "Supabase yapılandırması eksik" } }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user) {
      return json({ ok: false, error: { code: "AUTH", message: "Geçersiz oturum" } }, 401);
    }

    let body: { items?: InItem[]; batchConsensusDate?: string | null };
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: { code: "BODY", message: "Geçersiz JSON" } }, 400);
    }

    const items = Array.isArray(body.items) ? body.items.filter((x) => x?.key) : [];
    if (!items.length) {
      return json({ ok: false, error: { code: "BODY", message: "items gerekli" } }, 400);
    }
    if (items.length > 80) {
      return json({ ok: false, error: { code: "BODY", message: "En fazla 80 fiş" } }, 400);
    }

    const consensus = ymdOk(body.batchConsensusDate ?? null);
    const results: OutItem[] = [];
    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK);
      const part = await deepSeekDateAudit(chunk, consensus);
      results.push(...part);
    }

    const fixed = results.filter((r) => r.action === "fix" || r.action === "fill").length;
    const flagged = results.filter((r) => r.action === "flag" || r.flags.length > 0).length;

    return json({
      ok: true,
      results,
      summary: { total: results.length, fixed, flagged },
    });
  } catch (e) {
    const message = (e as Error)?.message ?? String(e);
    console.error("pos-receipt-date-check", message);
    const isConfig = message.includes("DEEPSEEK_API_KEY");
    return json(
      {
        ok: false,
        error: {
          code: isConfig ? "CONFIG" : "AI",
          message: isConfig
            ? "DeepSeek API anahtarı yapılandırılmamış"
            : message.slice(0, 240),
        },
      },
      isConfig ? 503 : 500
    );
  }
});
