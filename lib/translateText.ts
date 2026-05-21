import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '@/i18n';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/supabaseTransientErrors';
import { runInTranslateQueue } from '@/lib/translateQueue';
import { detectMessageLang, isSameLanguageMessage } from '@/lib/detectMessageLang';

const MEMORY_CACHE = new Map<string, string>();
const IN_FLIGHT = new Map<string, Promise<TranslateResult>>();
const STORAGE_PREFIX = 'valoria_translate_v2:';
const CACHE_LISTENERS = new Set<() => void>();
const INVOKE_TIMEOUT_MS = 22_000;
const PREFETCH_MAX = 8;
const PREFETCH_STAGGER_MS = 350;

export type TranslateResult = {
  translated: string;
  targetLang: string;
  cached?: boolean;
};

function notifyCacheListeners(): void {
  CACHE_LISTENERS.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore
    }
  });
}

export function subscribeTranslationCache(listener: () => void): () => void {
  CACHE_LISTENERS.add(listener);
  return () => CACHE_LISTENERS.delete(listener);
}

export function appLangCode(): string {
  const raw = (i18n.language || 'tr').toLowerCase();
  const code = raw.split('-')[0];
  const supported = new Set(['tr', 'en', 'ar', 'de', 'fr', 'ru', 'es']);
  return supported.has(code) ? code : 'en';
}

function cacheKey(text: string, targetLang: string): string {
  return `v2::${targetLang}::${text}`;
}

function normalizeForCompare(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function shouldShowTranslation(original: string, translated: string): boolean {
  const a = normalizeForCompare(original);
  const b = normalizeForCompare(translated);
  if (!a || !b) return false;
  return a !== b;
}

export function getCachedTranslation(text: string, targetLang?: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const lang = targetLang ?? appLangCode();
  if (isSameLanguageMessage(trimmed, lang)) return null;
  return MEMORY_CACHE.get(cacheKey(trimmed, lang)) ?? null;
}

async function readStorage(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(`${STORAGE_PREFIX}${key}`);
  } catch {
    return null;
  }
}

async function writeStorage(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${STORAGE_PREFIX}${key}`, value);
  } catch {
    // ignore quota errors
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Oturum gerekli — çeviri için giriş yapın');
  }
  return { Authorization: `Bearer ${token}` };
}

async function invokeTranslate(
  trimmed: string,
  targetLang: string,
  sourceLang?: string
): Promise<TranslateResult> {
  const headers = await authHeaders();
  const { data, error } = await withTimeout(
    supabase.functions.invoke('translate-text', {
      body: { text: trimmed, targetLang, sourceLang },
      headers,
    }),
    INVOKE_TIMEOUT_MS,
    'translate-text'
  );

  const payload = (data ?? {}) as {
    translated?: string;
    error?: string;
    targetLang?: string;
  };

  if (payload?.translated?.trim()) {
    return {
      translated: payload.translated.trim(),
      targetLang: payload.targetLang ?? targetLang,
      cached: Boolean((payload as { cached?: boolean }).cached),
    };
  }

  if (error) {
    const ctx = error as { message?: string; context?: { json?: () => Promise<unknown> } };
    let detail = payload?.error || ctx.message || 'Translation request failed';
    try {
      const body = await ctx.context?.json?.();
      if (body && typeof body === 'object' && 'error' in body) {
        detail = String((body as { error?: string }).error ?? detail);
      }
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  if (payload?.error) throw new Error(payload.error);
  throw new Error('Empty translation');
}

/** Uygulama diline metin çevir (DeepSeek edge function). */
export async function translateText(
  text: string,
  options?: { targetLang?: string; sourceLang?: string }
): Promise<TranslateResult> {
  const trimmed = text.trim();
  const targetLang = options?.targetLang ?? appLangCode();
  if (!trimmed) {
    return { translated: '', targetLang };
  }

  if (isSameLanguageMessage(trimmed, targetLang)) {
    return { translated: trimmed, targetLang, cached: true };
  }

  const key = cacheKey(trimmed, targetLang);
  const mem = MEMORY_CACHE.get(key);
  if (mem) return { translated: mem, targetLang, cached: true };

  const inflight = IN_FLIGHT.get(key);
  if (inflight) return inflight;

  const work = runInTranslateQueue(async (): Promise<TranslateResult> => {
    const stored = await readStorage(key);
    if (stored) {
      MEMORY_CACHE.set(key, stored);
      notifyCacheListeners();
      return { translated: stored, targetLang, cached: true };
    }

    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const sourceLang = options?.sourceLang ?? detectMessageLang(trimmed) ?? undefined;
        const result = await invokeTranslate(trimmed, targetLang, sourceLang);
        MEMORY_CACHE.set(key, result.translated);
        void writeStorage(key, result.translated);
        notifyCacheListeners();
        return result;
      } catch (e) {
        lastErr = e as Error;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
      }
    }
    throw lastErr ?? new Error('Translation failed');
  });

  IN_FLIGHT.set(key, work);
  try {
    return await work;
  } finally {
    IN_FLIGHT.delete(key);
  }
}

/** Son N gelen mesajı kademeli önceden çevir (ağ tıkanmasını önler). */
export function prefetchTranslations(texts: string[], targetLang?: string): void {
  const lang = targetLang ?? appLangCode();
  const unique = [...new Set(texts.map((t) => t.trim()).filter((t) => t.length >= 2))].slice(-PREFETCH_MAX);
  unique.forEach((text, index) => {
    if (!likelyNeedsTranslation(text, lang)) return;
    const key = cacheKey(text, lang);
    if (MEMORY_CACHE.has(key) || IN_FLIGHT.has(key)) return;
    setTimeout(() => {
      void translateText(text, { targetLang: lang }).catch(() => {});
    }, index * PREFETCH_STAGGER_MS);
  });
}

export function likelyNeedsTranslation(text: string, targetLang?: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  const lang = targetLang ?? appLangCode();
  return !isSameLanguageMessage(trimmed, lang);
}
