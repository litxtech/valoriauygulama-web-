import { Platform } from 'react-native';
import { PUBLIC_COMPLAINT_PATH } from '@/constants/publicWebPaths';

const PUBLIC_WEB_ORIGIN = (
  process.env.EXPO_PUBLIC_PUBLIC_WEB_ORIGIN ?? 'https://valoria.tr'
).replace(/\/$/, '');

function isProductionPublicHost(hostname: string): boolean {
  const h = (hostname || '').toLowerCase();
  return h === 'valoria.tr' || h === 'www.valoria.tr' || h.endsWith('.vercel.app');
}

export function resolveSikayetPortalOrigin(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const origin = window.location.origin.replace(/\/$/, '');
    if (isProductionPublicHost(window.location.hostname || '')) return origin;
  }
  return PUBLIC_WEB_ORIGIN;
}

/** Statik HTML — Expo SPA atlanır, dist/sikayet/index.html yüklenir. */
export function buildPublicSikayetDocumentUrl(opts?: {
  organizationId?: string | null;
  bustCache?: boolean;
  search?: string;
}): string {
  const origin = resolveSikayetPortalOrigin();
  const params = new URLSearchParams();
  if (opts?.search) {
    const incoming = new URLSearchParams(
      opts.search.startsWith('?') ? opts.search.slice(1) : opts.search
    );
    incoming.forEach((v, k) => {
      if (k !== '_doc') params.set(k, v);
    });
  }
  const org = opts?.organizationId?.trim();
  if (org) params.set('org', org);
  if (opts?.bustCache) params.set('_doc', String(Date.now()));
  const q = params.toString();
  return `${origin}/${PUBLIC_COMPLAINT_PATH}/index.html${q ? `?${q}` : ''}`;
}

export function isStaticSikayetDocumentLoaded(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector('script[src*="sikayet-config"]');
}

export function isSikayetPublicPath(pathname: string): boolean {
  const p = (pathname || '').replace(/\/$/, '') || '/';
  return p === `/${PUBLIC_COMPLAINT_PATH}` || p.startsWith(`/${PUBLIC_COMPLAINT_PATH}/`);
}
