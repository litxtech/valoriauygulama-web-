import { supabase } from '@/lib/supabase';
import { appSettingToString, appSettingsRowsToMap } from '@/lib/appSettings';
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
  PUBLIC_COMPLAINT_PATH,
  normalizePublicContractBaseUrl,
} from '@/constants/publicWebPaths';
import { FIXED_MALIYE_QR_TOKEN } from '@/constants/maliyeQr';
import { paymentQrStandOpenUrl, paymentRequestOpenUrl } from '@/lib/paymentOpenUrl';

export type PublicQrSettings = {
  origin: string;
  checkinBase: string;
  contractBase: string;
  maliyeBase: string;
  contractQrUrl: string;
  paymentBase: string;
  samplePaymentQrUrl: string;
  samplePaymentUrl: string;
};

const QR_SETTING_KEYS = [
  'contract_qr_base_url',
  'checkin_qr_base_url',
  'maliye_qr_base_url',
] as const;

let cachedQrSettings: { value: PublicQrSettings; at: number } | null = null;

/** Yerel ağ / geliştirme adresi — misafire paylaşılan QR ve linklerde kullanılmaz. */
export function isLocalOrPrivateOrigin(origin: string): boolean {
  const raw = origin.trim().toLowerCase();
  if (!raw) return true;
  if (raw.startsWith('exp://') || raw.startsWith('exps://')) return true;
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const host = url.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^10\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    if (host.endsWith('.local')) return true;
  } catch {
    return true;
  }
  return false;
}

/** Tarayıcı / env / varsayılan — anlık (önbellek yok) */
export function resolvePublicAppOrigin(override?: string | null): string {
  if (override?.trim() && !isLocalOrPrivateOrigin(override)) {
    return override.trim().replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    const o = window.location.origin.replace(/\/$/, '');
    if (!isLocalOrPrivateOrigin(o)) return o;
  }
  const env = process.env.EXPO_PUBLIC_APP_URL?.trim().replace(/\/$/, '');
  if (env && !isLocalOrPrivateOrigin(env)) return env;
  return DEFAULT_PUBLIC_APP_ORIGIN;
}

/** Önbellekteki canlı kök — fetchPublicAppOriginFromSettings sonrası tüm linkler aynı origin kullanır */
export function getShareablePublicOrigin(override?: string | null): string {
  if (override?.trim() && !isLocalOrPrivateOrigin(override)) {
    return override.trim().replace(/\/$/, '');
  }
  if (cachedOrigin?.value) return cachedOrigin.value;
  return resolveShareablePublicOrigin(null);
}

/** Supabase / eski Edge / localhost URL → güvenli canlı adres */
export function sanitizePublicOriginUrl(url: string, fallback = DEFAULT_PUBLIC_APP_ORIGIN): string {
  const u = (url ?? '').trim();
  if (!u) return fallback.replace(/\/$/, '');
  if (u.includes('supabase.co') || u.includes('/functions/v1/')) return fallback.replace(/\/$/, '');
  try {
    const parsed = new URL(u.includes('://') ? u : `https://${u}`);
    if (isLocalOrPrivateOrigin(parsed.origin)) return fallback.replace(/\/$/, '');
    return u.replace(/\/$/, '');
  } catch {
    return fallback.replace(/\/$/, '');
  }
}

/** @deprecated getShareablePublicOrigin kullanın — env/varsayılan, önbellek yok */
export function resolveShareablePublicOrigin(override?: string | null): string {
  if (override?.trim() && !isLocalOrPrivateOrigin(override)) {
    return override.trim().replace(/\/$/, '');
  }
  const env = process.env.EXPO_PUBLIC_APP_URL?.trim().replace(/\/$/, '');
  if (env && !isLocalOrPrivateOrigin(env)) return env;
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
  const fromDb = appSettingToString((data as { value?: unknown } | null)?.value);
  const resolved = resolveShareablePublicOrigin(fromDb || null);
  cachedOrigin = { value: resolved, at: Date.now() };
  return resolved;
}

export function invalidatePublicAppOriginCache(): void {
  cachedOrigin = null;
  cachedQrSettings = null;
}

function defaultContractBase(origin: string): string {
  return `${origin.replace(/\/$/, '')}/${PUBLIC_CONTRACT_PATH}`;
}

function defaultMaliyeBase(origin: string): string {
  return `${origin.replace(/\/$/, '')}/${PUBLIC_MALIYE_PATH}`;
}

/** Menü, check-in, sözleşme, maliye QR — Supabase app_settings (60 sn önbellek) */
export async function fetchPublicQrSettings(force?: boolean): Promise<PublicQrSettings> {
  if (!force && cachedQrSettings && Date.now() - cachedQrSettings.at < CACHE_MS) {
    return cachedQrSettings.value;
  }
  const origin = await fetchPublicAppOriginFromSettings(force);
  const { data } = await supabase.from('app_settings').select('key, value').in('key', [...QR_SETTING_KEYS]);
  const map = appSettingsRowsToMap(data as { key: string; value: unknown }[] | null);
  const checkinBase = sanitizePublicOriginUrl(map.checkin_qr_base_url || origin, origin);
  const contractBase = normalizePublicContractBaseUrl(
    sanitizePublicOriginUrl(map.contract_qr_base_url || defaultContractBase(origin), defaultContractBase(origin))
  );
  const maliyeBase =
    sanitizePublicOriginUrl(
      map.maliye_qr_base_url?.replace(/\/functions\/v1\/public-maliye\/?$/i, '')?.replace(/\?.*$/, '') || '',
      defaultMaliyeBase(origin)
    ) || defaultMaliyeBase(origin);
  const paymentBase = origin;
  const value: PublicQrSettings = {
    origin,
    checkinBase,
    contractBase,
    maliyeBase,
    contractQrUrl: buildPublicContractUrl(undefined, contractBase),
    paymentBase,
    samplePaymentQrUrl: paymentQrStandOpenUrl('ORNEK-TOKEN'),
    samplePaymentUrl: paymentRequestOpenUrl('ORNEK-TOKEN'),
  };
  cachedQrSettings = { value, at: Date.now() };
  return value;
}

/** Oda check-in QR tam URL — Supabase checkin_qr_base_url */
export function buildCheckinQrUrl(token: string, checkinBase: string): string {
  const base = checkinBase.trim().replace(/\/$/, '') || DEFAULT_PUBLIC_APP_ORIGIN;
  const isAppScheme = base === 'valoria://' || base === 'valoria' || base.startsWith('valoria://');
  const encoded = encodeURIComponent(token.trim());
  return isAppScheme ? `valoria://guest?token=${encoded}` : `${base}/guest?token=${encoded}`;
}

export function buildPublicMenuUrl(orgSlug: string, baseOverride?: string | null): string {
  const slug = orgSlug.trim().toLowerCase();
  const base = getShareablePublicOrigin(baseOverride);
  return `${base}/${PUBLIC_MENU_PATH}/${encodeURIComponent(slug)}`;
}

export function buildPublicContractUrl(
  opts?: { token?: string; lang?: string },
  baseOverride?: string | null
): string {
  const params = new URLSearchParams();
  params.set('t', (opts?.token ?? DEFAULT_CONTRACT_QR_TOKEN).trim());
  params.set('l', (opts?.lang ?? DEFAULT_CONTRACT_QR_LANG).trim());
  const query = params.toString();

  const raw = (baseOverride ?? '').trim();
  if (raw) {
    const normalized = normalizePublicContractBaseUrl(raw);
    if (
      /\/sozlesme$/iu.test(normalized) ||
      /\/sözleşme$/iu.test(normalized) ||
      normalized.includes('/guest/sign-one')
    ) {
      return `${normalized.replace(/\/$/, '')}?${query}`;
    }
  }

  const origin = getShareablePublicOrigin(raw || null);
  return `${origin}/${PUBLIC_CONTRACT_PATH}?${query}`;
}

export function buildPublicMaliyeUrl(
  token: string = FIXED_MALIYE_QR_TOKEN,
  baseOverride?: string | null
): string {
  const params = new URLSearchParams();
  params.set('token', token.trim());
  const query = params.toString();

  const raw = (baseOverride ?? '').trim().replace(/\?.*$/, '').replace(/\/$/, '');
  if (raw && (raw.endsWith(`/${PUBLIC_MALIYE_PATH}`) || raw.includes('/maliye'))) {
    return `${raw}?${query}`;
  }

  const origin = getShareablePublicOrigin(raw || null);
  return `${origin}/${PUBLIC_MALIYE_PATH}?${query}`;
}

/** QR şikayet hattı — valoria.tr/sikayet (?org=… isteğe bağlı) */
export function buildPublicComplaintUrl(
  opts?: { organizationId?: string | null },
  baseOverride?: string | null
): string {
  const origin = getShareablePublicOrigin(baseOverride);
  const params = new URLSearchParams();
  const org = opts?.organizationId?.trim();
  if (org) params.set('org', org);
  const q = params.toString();
  return `${origin}/${PUBLIC_COMPLAINT_PATH}${q ? `?${q}` : ''}`;
}

/** @deprecated buildPublicMenuUrl kullanın */
export function buildPublicKitchenMenuUrl(orgSlug: string, baseOverride?: string | null): string {
  return buildPublicMenuUrl(orgSlug, baseOverride);
}

/** Tüm sözleşme QR kodları — modül sonunda (constants/contractQr döngüsü yok). */
export const FIXED_CONTRACT_QR_URL = buildPublicContractUrl();
