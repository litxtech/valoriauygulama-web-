// Valoria Hotel — DeepSeek ile metin çevirisi (feed + mesajlaşma)
// POST { text: string, targetLang: string, sourceLang?: string }
// Secret: DEEPSEEK_API_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEEPSEEK_TIMEOUT_MS = 28_000;
const SUPPORTED = new Set(["tr", "en", "ar", "de", "fr", "ru", "es"]);

const LANG_NAMES: Record<string, string> = {
  tr: "Turkish",
  en: "English",
  ar: "Arabic",
  de: "German",
  fr: "French",
  ru: "Russian",
  es: "Spanish",
};

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function normalizeLang(raw: string | undefined | null): string {
  const code = (raw ?? "en").toLowerCase().split("-")[0];
  return SUPPORTED.has(code) ? code : "en";
}

const TR_HINT =
  /[ğüşıöçĞÜŞİÖÇ]|\b(merhaba|teşekkür|tesekkur|evet|hayır|hayir|lütfen|lutfen|tamam|nasıl|nasil|günaydın|gunaydin|için|icin|rica|ederim)\b/i;
const EN_HINT =
  /\b(the|hello|hi|thanks|thank|please|room|check|yes|no|help|good|morning|evening)\b/i;
const ARABIC = /[\u0600-\u06FF]/;
const CYRILLIC = /[\u0400-\u04FF]/;

function detectMessageLang(text: string): string | null {
  const t = text.trim();
  if (t.length < 2) return null;
  if (ARABIC.test(t)) return "ar";
  if (CYRILLIC.test(t)) return "ru";
  if (TR_HINT.test(t)) return "tr";
  if (EN_HINT.test(t)) return "en";
  if (/^[a-zA-Z0-9\s.,!?'"\-@#$%&*():;+/=]+$/.test(t)) return "en";
  return null;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function translateWithDeepSeek(
  text: string,
  targetLang: string,
  sourceLang?: string
): Promise<{ translated: string; detectedSourceLang: string | null }> {
  const apiKey = (Deno.env.get("DEEPSEEK_API_KEY") ?? "").trim();
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured in Supabase secrets");
  }

  const targetName = LANG_NAMES[targetLang] ?? targetLang;
  const sourceHint =
    sourceLang && sourceLang !== targetLang
      ? `The source language is likely ${LANG_NAMES[sourceLang] ?? sourceLang}. `
      : "";

  const systemPrompt =
    "You are a professional translator for a hotel guest and staff messaging app. " +
    "Reply with ONLY the translated text — no quotes, labels, or explanations. " +
    "Preserve line breaks. " +
    "Do not fix typos, grammar, or spelling in the source — translate faithfully. " +
    "Do not change names, room numbers, URLs, @mentions, or emoji. " +
    `Translate into ${targetName}.`;

  const userPrompt = `${sourceHint}Translate into ${targetName}:\n\n${text}`;
  const maxTokens = Math.min(2048, Math.max(128, Math.ceil(text.length * 2.5) + 32));

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
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      throw new Error("DeepSeek timeout — try again");
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
  const translated = (data.choices?.[0]?.message?.content ?? "").trim();
  if (!translated) throw new Error("Empty translation response");

  return { translated, detectedSourceLang: sourceLang ?? null };
}

const CACHE_DB_TIMEOUT_MS = 3_000;

async function withDbTimeout<T>(p: PromiseLike<T>, label: string): Promise<T | null> {
  try {
    return await Promise.race([
      Promise.resolve(p),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timeout`)), CACHE_DB_TIMEOUT_MS)
      ),
    ]);
  } catch (e) {
    console.warn(label, (e as Error)?.message ?? e);
    return null;
  }
}

async function readCache(
  admin: ReturnType<typeof createClient>,
  cacheKey: string
): Promise<{ translated_text: string; source_lang: string | null } | null> {
  const res = await withDbTimeout(
    admin
      .from("translation_cache")
      .select("translated_text, source_lang")
      .eq("cache_key", cacheKey)
      .maybeSingle(),
    "translation_cache read"
  );
  if (!res) return null;
  const { data, error } = res;
  if (error) {
    console.warn("translation_cache read:", error.message);
    return null;
  }
  return data as { translated_text: string; source_lang: string | null } | null;
}

function writeCache(admin: ReturnType<typeof createClient>, row: Record<string, unknown>): void {
  void withDbTimeout(
    admin.from("translation_cache").upsert(row, { onConflict: "cache_key" }),
    "translation_cache upsert"
  );
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
    console.warn("translate-text auth:", authErr?.message ?? "no user");
    return json({ error: "Invalid or expired session" }, 401);
  }

  try {
    const body = (await req.json()) as {
      text?: string;
      targetLang?: string;
      sourceLang?: string;
    };

    const text = (body.text ?? "").trim();
    if (!text) {
      return json({ error: "text is required" }, 400);
    }
    if (text.length > 8000) {
      return json({ error: "text too long (max 8000)" }, 400);
    }

    const targetLang = normalizeLang(body.targetLang);
    const sourceLang = body.sourceLang ? normalizeLang(body.sourceLang) : undefined;
    const detectedSource = sourceLang ?? detectMessageLang(text);

    if (detectedSource && detectedSource === targetLang) {
      return json({
        translated: text,
        targetLang,
        sourceLang: detectedSource,
        cached: false,
        skipped: true,
      }, 200);
    }

    const cacheKey = await sha256Hex(`v2::${targetLang}::${text}`);

    const cached = await readCache(admin, cacheKey);
    if (cached?.translated_text) {
      return json({
        translated: cached.translated_text,
        targetLang,
        sourceLang: cached.source_lang ?? sourceLang ?? null,
        cached: true,
      }, 200);
    }

    const { translated, detectedSourceLang } = await translateWithDeepSeek(
      text,
      targetLang,
      detectedSource ?? sourceLang
    );

    writeCache(admin, {
      cache_key: cacheKey,
      source_text: text.slice(0, 500),
      source_lang: detectedSourceLang ?? sourceLang ?? null,
      target_lang: targetLang,
      translated_text: translated,
    });

    return json({
      translated,
      targetLang,
      sourceLang: detectedSourceLang ?? sourceLang ?? null,
      cached: false,
    }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Translation failed";
    console.error("translate-text", message);
    const isTimeout = message.includes("timeout");
    const isConfig = message.includes("DEEPSEEK_API_KEY");
    const status = isConfig ? 503 : isTimeout ? 504 : 500;
    return json({ error: message }, status);
  }
});
