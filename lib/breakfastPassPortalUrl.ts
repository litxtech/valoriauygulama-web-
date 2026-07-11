import { Platform } from 'react-native';
import { PUBLIC_BREAKFAST_PASS_PATH } from '@/constants/publicWebPaths';

const PUBLIC_WEB_ORIGIN = (
  process.env.EXPO_PUBLIC_PUBLIC_WEB_ORIGIN ?? 'https://valoria.tr'
).replace(/\/$/, '');

function isProductionPublicHost(hostname: string): boolean {
  const h = (hostname || '').toLowerCase();
  return h === 'valoria.tr' || h === 'www.valoria.tr' || h.endsWith('.vercel.app');
}

export function resolveBreakfastPassPortalOrigin(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const origin = window.location.origin.replace(/\/$/, '');
    if (isProductionPublicHost(window.location.hostname || '')) return origin;
  }
  return PUBLIC_WEB_ORIGIN;
}

/** Statik HTML — Expo SPA atlanır, dist/breakfast-pass/index.html yüklenir. */
export function buildPublicBreakfastPassDocumentUrl(
  token: string,
  opts?: { bustCache?: boolean }
): string {
  const t = token.trim();
  const origin = resolveBreakfastPassPortalOrigin();
  const params = new URLSearchParams();
  params.set('token', t);
  if (opts?.bustCache) params.set('_doc', String(Date.now()));
  return `${origin}/${PUBLIC_BREAKFAST_PASS_PATH}/index.html?${params.toString()}`;
}

export function isStaticBreakfastPassDocumentLoaded(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector('script[src*="breakfast-pass-config"]');
}
