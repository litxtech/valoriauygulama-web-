import { Platform } from 'react-native';
import { Redirect, usePathname } from 'expo-router';
import { MaliyeWebPortalRedirect } from '@/components/MaliyeWebPortalRedirect';
import { PaymentWebPortalRedirect } from '@/components/PaymentWebPortalRedirect';
import { resolvePublicWebRoute } from '@/lib/publicWebRoute';
import { isPaymentPublicPath } from '@/lib/paymentPortalUrl';

/**
 * Web QR yolları (/menü, /sözleşme, /maliye, /guest/sign-one).
 * Redirect render aşamasında çalışır — Root Layout mount olmadan router.replace hatası önlenir.
 */
const EXPO_GUEST_CONTRACT_PATHS = ['/guest/sign-one', '/guest/success', '/guest/contract', '/guest/form'];

export function WebPublicRouteRedirect() {
  const pathname = usePathname();

  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;

  const winPath = window.location.pathname || '';
  const winSearch = window.location.search || '';
  const winNormalized = winPath.replace(/\/$/, '') || '/';

  if (isPaymentPublicPath(winNormalized)) {
    return <PaymentWebPortalRedirect />;
  }

  if (winPath.includes('/guest/success')) {
    return null;
  }

  const winRoute = resolvePublicWebRoute(winPath, winSearch);

  // Maliye: adres çubuğu /maliye ise doğrudan canlı Edge portalı (iframe/Expo rota gerekmez)
  if (winRoute?.kind === 'maliye') {
    return <MaliyeWebPortalRedirect token={winRoute.token} />;
  }

  const expoPath = (pathname || '').replace(/\/$/, '') || '/';

  if (EXPO_GUEST_CONTRACT_PATHS.some((p) => expoPath === p || expoPath.startsWith(`${p}/`))) {
    return null;
  }

  const route = resolvePublicWebRoute(winPath, winSearch);
  if (!route || route.kind === 'maliye') return null;

  if (
    expoPath === '/sözleşme' ||
    expoPath === '/sozlesme' ||
    expoPath === '/maliye' ||
    expoPath.startsWith('/menü/') ||
    expoPath.startsWith('/menu/') ||
    expoPath.startsWith('/maliye/')
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

  return null;
}
