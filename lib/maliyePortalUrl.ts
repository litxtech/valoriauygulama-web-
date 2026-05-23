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

/** Supabase Edge public-maliye (JSON API + doğrudan HTML yedek) */
export function buildPublicMaliyeEdgeUrl(token?: string): string {
  const base = (supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!base) return '';
  const t = resolveMaliyeToken(token);
  return `${base}/functions/v1/public-maliye?token=${encodeURIComponent(t)}`;
}

/** @deprecated use buildPublicMaliyeEdgeUrl */
export const buildPublicMaliyePortalUrl = buildPublicMaliyeEdgeUrl;

/** valoria.tr/maliye — statik portal (Vercel dist/maliye, maliye-config.js ile API) */
export function buildPublicMaliyeWebUrl(token?: string): string {
  const t = resolveMaliyeToken(token);
  const origin =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin.replace(/\/$/, '')
      : PUBLIC_WEB_ORIGIN;
  return `${origin}/${PUBLIC_MALIYE_PATH}?token=${encodeURIComponent(t)}`;
}

/** Platforma göre tercih edilen portal adresi */
export function buildMaliyePortalUrlForPlatform(token?: string): string {
  return buildPublicMaliyeWebUrl(token);
}

export function isMaliyeWebPortalPath(pathname: string): boolean {
  const p = (pathname || '').replace(/\/$/, '') || '/';
  return p === `/${PUBLIC_MALIYE_PATH}` || p.startsWith(`/${PUBLIC_MALIYE_PATH}/`);
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
