import type { Router } from 'expo-router';
import {
  LEGACY_CONTRACT_PATH,
  LEGACY_CONTRACT_PATH_TR,
  LEGACY_MENU_PATH,
  LEGACY_MENU_PATH_TR,
  PUBLIC_BREAKFAST_PASS_PATH,
  PUBLIC_CONTRACT_PATH,
  PUBLIC_MENU_PATH,
  PUBLIC_MALIYE_PATH,
  PUBLIC_COMPLAINT_PATH,
} from '@/constants/publicWebPaths';
import { isPaymentPublicPath } from '@/lib/paymentPortalUrl';

export type PublicWebRoute =
  | { kind: 'menu'; slug: string }
  | { kind: 'contract'; token?: string; lang?: string }
  | { kind: 'maliye'; token?: string }
  | { kind: 'breakfast-pass'; token: string }
  | { kind: 'sikayet' }
  | null;

/** Path eşleştirme: menü/menu, sözleşme/sozlesme/guest/sign-one, maliye */
function foldTrPathSegment(segment: string): string {
  return decodeURIComponent(segment)
    .trim()
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/\u0307/g, '')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c');
}

function parseQuery(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!search) return out;
  const q = search.startsWith('?') ? search.slice(1) : search;
  for (const part of q.split('&')) {
    if (!part) continue;
    const [k, v] = part.split('=');
    if (k) out[decodeURIComponent(k)] = decodeURIComponent((v ?? '').replace(/\+/g, ' '));
  }
  return out;
}

export function resolvePublicWebRoute(pathname: string, search?: string): PublicWebRoute {
  const path = (pathname || '').replace(/\/$/, '').replace(/^\//, '');
  if (!path) return null;

  const query = parseQuery(search ?? '');
  const token = query.t || query.token;
  const lang = query.l || query.lang || query.language;

  const parts = path.split('/').filter(Boolean);
  const head = parts[0] ? foldTrPathSegment(parts[0]) : '';

  if (
    head === foldTrPathSegment(PUBLIC_MENU_PATH) ||
    head === foldTrPathSegment(LEGACY_MENU_PATH_TR) ||
    head === LEGACY_MENU_PATH
  ) {
    const slug = parts[1]?.trim();
    if (slug) return { kind: 'menu', slug: decodeURIComponent(slug) };
    return null;
  }

  if (
    head === foldTrPathSegment(PUBLIC_CONTRACT_PATH) ||
    head === foldTrPathSegment(LEGACY_CONTRACT_PATH_TR) ||
    head === 'sozlesme' ||
    path === LEGACY_CONTRACT_PATH ||
    path.startsWith(`${LEGACY_CONTRACT_PATH}/`)
  ) {
    return { kind: 'contract', token: token || undefined, lang: lang || undefined };
  }

  if (head === PUBLIC_MALIYE_PATH || head === 'maliye') {
    return { kind: 'maliye', token: token || undefined };
  }

  if (head === PUBLIC_BREAKFAST_PASS_PATH || head === 'breakfast-pass') {
    if (token?.trim()) return { kind: 'breakfast-pass', token: token.trim() };
    return null;
  }

  if (head === PUBLIC_COMPLAINT_PATH || head === 'sikayet') {
    return { kind: 'sikayet' };
  }

  return null;
}

/** Web açılışında doğru Expo rotasına yönlendir */
export function applyPublicWebRoute(
  router: Pick<Router, 'replace'>,
  pathname: string,
  search?: string
): boolean {
  const route = resolvePublicWebRoute(pathname, search);
  if (!route) return false;

  if (route.kind === 'menu') {
    router.replace({ pathname: '/menu/[slug]', params: { slug: route.slug } });
    return true;
  }

  if (route.kind === 'contract') {
    router.replace({
      pathname: '/guest/sign-one',
      params: {
        t: route.token ?? '',
        l: route.lang ?? 'tr',
      },
    });
    return true;
  }

  if (route.kind === 'maliye') {
    router.replace({
      pathname: '/maliye',
      params: route.token ? { token: route.token } : {},
    });
    return true;
  }

  if (route.kind === 'breakfast-pass') {
    router.replace({
      pathname: '/breakfast-pass',
      params: { token: route.token },
    });
    return true;
  }

  // Statik portal — PublicWebRouteFallback / SikayetWebPortalRedirect yönlendirir
  if (route.kind === 'sikayet') {
    return true;
  }

  return false;
}

export function isPublicWebPath(pathname: string, search?: string): boolean {
  const p = (pathname || '').replace(/\/$/, '') || '/';
  if (p === '/guest' || p.startsWith('/guest/')) return true;
  if (p === '/sozlesme' || p === '/sözleşme') return true;
  if (p.includes('/guest/sign-one') || p.includes('/guest/success')) return true;
  if (p === '/maliye' || p.startsWith('/maliye/')) return true;
  if (p === '/breakfast-pass' || p.startsWith('/breakfast-pass/')) return true;
  if (p === '/sikayet' || p.startsWith('/sikayet/')) return true;
  if (isPaymentPublicPath(p)) return true;
  if (search?.includes('token=') && p === '/guest') return true;
  return resolvePublicWebRoute(pathname, search) != null;
}

/** Vercel statik export: expo-router bazen [slug] paramını boş bırakır; adres çubuğundan oku. */
export function parsePublicMenuSlugFromLocation(
  pathname?: string | null,
  search?: string | null
): string {
  const route = resolvePublicWebRoute(pathname ?? '', search ?? '');
  if (route?.kind !== 'menu') return '';
  return route.slug.trim().toLowerCase();
}
