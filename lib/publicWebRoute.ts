import type { Router } from 'expo-router';
import {
  LEGACY_CONTRACT_PATH,
  LEGACY_CONTRACT_PATH_TR,
  LEGACY_MENU_PATH,
  LEGACY_MENU_PATH_TR,
  PUBLIC_CONTRACT_PATH,
  PUBLIC_MENU_PATH,
  PUBLIC_MALIYE_PATH,
} from '@/constants/publicWebPaths';

export type PublicWebRoute =
  | { kind: 'menu'; slug: string }
  | { kind: 'contract'; token?: string; lang?: string }
  | { kind: 'maliye'; token?: string }
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

  return false;
}

export function isPublicWebPath(pathname: string): boolean {
  const p = (pathname || '').replace(/\/$/, '') || '/';
  if (p.includes('/guest/sign-one') || p.includes('/guest/success')) return true;
  if (p === '/maliye' || p.startsWith('/maliye/')) return true;
  return resolvePublicWebRoute(pathname) != null;
}
