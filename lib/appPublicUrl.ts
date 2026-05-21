import { supabase } from '@/lib/supabase';
import {
  APP_PUBLIC_BASE_URL_SETTING_KEY,
  DEFAULT_PUBLIC_APP_ORIGIN,
} from '@/constants/appOrigin';
import {
  DEFAULT_CONTRACT_QR_LANG,
  DEFAULT_CONTRACT_QR_TOKEN,
  PUBLIC_CONTRACT_PATH,
  PUBLIC_MENU_PATH,
  PUBLIC_MALIYE_PATH,
} from '@/constants/publicWebPaths';
import { FIXED_MALIYE_QR_TOKEN } from '@/constants/maliyeQr';

function settingValueToString(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw.trim();
  try {
    const parsed = JSON.parse(String(raw));
    if (typeof parsed === 'string') return parsed.trim();
  } catch {
    // jsonb string primitive
  }
  return String(raw).replace(/^"|"$/g, '').trim();
}

/** Tarayıcı / env / varsayılan — anlık (önbellek yok) */
export function resolvePublicAppOrigin(override?: string | null): string {
  if (override?.trim()) return override.trim().replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    const o = window.location.origin.replace(/\/$/, '');
    if (!o.includes('localhost') && !o.includes('127.0.0.1')) return o;
  }
  const env = process.env.EXPO_PUBLIC_APP_URL?.trim().replace(/\/$/, '');
  if (env) return env;
  return DEFAULT_PUBLIC_APP_ORIGIN;
}

let cachedOrigin: { value: string; at: number } | null = null;
const CACHE_MS = 60_000;

export async function fetchPublicAppOriginFromSettings(force?: boolean): Promise<string> {
  if (!force && cachedOrigin && Date.now() - cachedOrigin.at < CACHE_MS) {
    return cachedOrigin.value;
  }
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', APP_PUBLIC_BASE_URL_SETTING_KEY)
    .maybeSingle();
  const fromDb = settingValueToString((data as { value?: unknown } | null)?.value);
  const resolved = resolvePublicAppOrigin(fromDb || null);
  cachedOrigin = { value: resolved, at: Date.now() };
  return resolved;
}

export function invalidatePublicAppOriginCache(): void {
  cachedOrigin = null;
}

export function buildPublicMenuUrl(orgSlug: string, baseOverride?: string | null): string {
  const slug = orgSlug.trim().toLowerCase();
  const base = resolvePublicAppOrigin(baseOverride);
  return `${base}/${PUBLIC_MENU_PATH}/${encodeURIComponent(slug)}`;
}

export function buildPublicContractUrl(
  opts?: { token?: string; lang?: string },
  baseOverride?: string | null
): string {
  const base = resolvePublicAppOrigin(baseOverride);
  const params = new URLSearchParams();
  params.set('t', (opts?.token ?? DEFAULT_CONTRACT_QR_TOKEN).trim());
  params.set('l', (opts?.lang ?? DEFAULT_CONTRACT_QR_LANG).trim());
  return `${base}/${PUBLIC_CONTRACT_PATH}?${params.toString()}`;
}

export function buildPublicMaliyeUrl(
  token: string = FIXED_MALIYE_QR_TOKEN,
  baseOverride?: string | null
): string {
  const base = resolvePublicAppOrigin(baseOverride);
  const params = new URLSearchParams();
  params.set('token', token.trim());
  return `${base}/${PUBLIC_MALIYE_PATH}?${params.toString()}`;
}

/** @deprecated buildPublicMenuUrl kullanın */
export function buildPublicKitchenMenuUrl(orgSlug: string, baseOverride?: string | null): string {
  return buildPublicMenuUrl(orgSlug, baseOverride);
}
