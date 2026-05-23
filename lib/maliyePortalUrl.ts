import { Platform } from 'react-native';
import { supabaseUrl } from '@/lib/supabase';
import { FIXED_MALIYE_QR_TOKEN } from '@/constants/maliyeQr';
import { PUBLIC_MALIYE_PATH } from '@/constants/publicWebPaths';

const PUBLIC_WEB_ORIGIN = (
  process.env.EXPO_PUBLIC_PUBLIC_WEB_ORIGIN ?? 'https://valoria.tr'
).replace(/\/$/, '');

function resolveMaliyeToken(token?: string): string {
  return (token?.trim() || FIXED_MALIYE_QR_TOKEN).trim();
}

function isProductionPublicHost(hostname: string): boolean {
  const h = (hostname || '').toLowerCase();
  return h === 'valoria.tr' || h === 'www.valoria.tr' || h.endsWith('.vercel.app');
}

/** Canlı web kökü — yerel Metro’da valoria.tr kullanılır */
export function resolveMaliyePortalOrigin(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const origin = window.location.origin.replace(/\/$/, '');
    if (isProductionPublicHost(window.location.hostname || '')) return origin;
  }
  return PUBLIC_WEB_ORIGIN;
}

/** Supabase Edge public-maliye (JSON API + doğrudan HTML yedek) */
export function buildPublicMaliyeEdgeUrl(token?: string): string {
  const base = (supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!base) return '';
  const t = resolveMaliyeToken(token);
  return `${base}/functions/v1/public-maliye?token=${encodeURIComponent(t)}`;
}

/** @deprecated use buildPublicMaliyeEdgeUrl */
export const buildPublicMaliyePortalUrl = buildPublicMaliyeEdgeUrl;

/** Kısa yol: /maliye?token=… */
export function buildPublicMaliyeWebUrl(token?: string): string {
  const t = resolveMaliyeToken(token);
  return `${resolveMaliyePortalOrigin()}/${PUBLIC_MALIYE_PATH}?token=${encodeURIComponent(t)}`;
}

/**
 * Statik HTML belgesi — Expo SPA’yı atlar, Vercel dist/maliye/index.html yüklenir.
 * Web’de tam sayfa yenileme için cache-bust eklenir.
 */
export function buildPublicMaliyeDocumentUrl(token?: string, opts?: { bustCache?: boolean }): string {
  const t = resolveMaliyeToken(token);
  const origin = resolveMaliyePortalOrigin();
  const params = new URLSearchParams();
  params.set('token', t);
  if (opts?.bustCache) params.set('_doc', String(Date.now()));
  return `${origin}/${PUBLIC_MALIYE_PATH}/index.html?${params.toString()}`;
}

/** Platforma göre tercih edilen portal adresi */
export function buildMaliyePortalUrlForPlatform(token?: string): string {
  return buildPublicMaliyeDocumentUrl(token);
}

export function isMaliyeWebPortalPath(pathname: string): boolean {
  const p = (pathname || '').replace(/\/$/, '') || '/';
  return (
    p === `/${PUBLIC_MALIYE_PATH}` ||
    p === `/${PUBLIC_MALIYE_PATH}/index.html` ||
    p.startsWith(`/${PUBLIC_MALIYE_PATH}/`)
  );
}

export function isMaliyePortalUrl(href: string): boolean {
  try {
    const u = new URL(href, PUBLIC_WEB_ORIGIN);
    if (isMaliyeWebPortalPath(u.pathname)) return true;
  } catch {
    /* ignore */
  }
  return href.includes('/functions/v1/public-maliye');
}

export function isStaticMaliyeDocumentLoaded(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector('script[src*="maliye-config"]');
}
