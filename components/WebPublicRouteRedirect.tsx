import { Platform } from 'react-native';
import { Redirect, usePathname } from 'expo-router';
import { resolvePublicWebRoute } from '@/lib/publicWebRoute';

/**
 * Web QR yolları (/menü, /sözleşme, /maliye, /guest/sign-one).
 * Redirect render aşamasında çalışır — Root Layout mount olmadan router.replace hatası önlenir.
 */
export function WebPublicRouteRedirect() {
  const pathname = usePathname();

  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;

  const route = resolvePublicWebRoute(
    window.location.pathname || '',
    window.location.search || ''
  );
  if (!route) return null;

  const normalized = (pathname || '').replace(/\/$/, '') || '/';

  // Alias / hedef rotalar (çift yönlendirme önlenir)
  if (
    normalized === '/sözleşme' ||
    normalized === '/sozlesme' ||
    normalized === '/maliye' ||
    normalized.startsWith('/menü/') ||
    normalized.startsWith('/menu/') ||
    normalized.startsWith('/maliye/')
  ) {
    return null;
  }

  if (route.kind === 'menu') {
    const target = `/menu/${route.slug}`;
    if (pathname === target || pathname.startsWith(`${target}/`)) return null;
    return <Redirect href={{ pathname: '/menu/[slug]', params: { slug: route.slug } }} />;
  }

  if (route.kind === 'contract') {
    if (pathname === '/guest/sign-one' || pathname.startsWith('/guest/sign-one/')) return null;
    return (
      <Redirect
        href={{
          pathname: '/guest/sign-one',
          params: { t: route.token ?? '', l: route.lang ?? 'tr' },
        }}
      />
    );
  }

  if (route.kind === 'maliye') {
    if (pathname === '/maliye' || pathname.startsWith('/maliye/')) return null;
    return (
      <Redirect
        href={{
          pathname: '/maliye',
          params: route.token ? { token: route.token } : {},
        }}
      />
    );
  }

  return null;
}
