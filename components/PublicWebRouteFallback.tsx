import { Redirect, usePathname } from 'expo-router';
import type { ReactElement } from 'react';
import { Platform } from 'react-native';
import { MaliyeWebPortalRedirect } from '@/components/MaliyeWebPortalRedirect';
import { BreakfastPassWebPortalRedirect } from '@/components/BreakfastPassWebPortalRedirect';
import { PaymentWebPortalRedirect } from '@/components/PaymentWebPortalRedirect';
import { SikayetWebPortalRedirect } from '@/components/SikayetWebPortalRedirect';
import { parseCheckinUrl } from '@/lib/checkinDeepLink';
import { isBreakfastPassPublicPath } from '@/lib/breakfastGuestPass';
import { isPaymentPublicPath } from '@/lib/paymentPortalUrl';
import { isSikayetPublicPath } from '@/lib/sikayetPortalUrl';
import { resolvePublicWebRoute } from '@/lib/publicWebRoute';

const EXPO_GUEST_CONTRACT_PATHS = ['/guest/sign-one', '/guest/success', '/guest/contract', '/guest/form'];

/** Web QR yolları — Unmatched Route / +not-found önlemi */
export function usePublicWebRouteRedirect(): ReactElement | null {
  const pathname = usePathname();

  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;

  const winPath = window.location.pathname || '';
  const winSearch = window.location.search || '';
  const winNormalized = winPath.replace(/\/$/, '') || '/';
  const expoPath = (pathname || '').replace(/\/$/, '') || '/';

  if (isPaymentPublicPath(winNormalized)) {
    return <PaymentWebPortalRedirect />;
  }

  if (isSikayetPublicPath(winNormalized)) {
    return <SikayetWebPortalRedirect />;
  }

  if (isBreakfastPassPublicPath(winNormalized)) {
    const winRoute = resolvePublicWebRoute(winPath, winSearch);
    if (winRoute?.kind === 'breakfast-pass') {
      return <BreakfastPassWebPortalRedirect token={winRoute.token} />;
    }
    return null;
  }

  const checkin = parseCheckinUrl(`${winNormalized}${winSearch}`);
  if (
    checkin?.type === 'token' &&
    checkin.token &&
    (winNormalized === '/guest' || winNormalized.endsWith('/guest')) &&
    expoPath !== '/guest/language' &&
    !EXPO_GUEST_CONTRACT_PATHS.some((p) => expoPath === p || expoPath.startsWith(`${p}/`))
  ) {
    return <Redirect href={{ pathname: '/guest', params: { token: checkin.token } }} />;
  }

  const winRoute = resolvePublicWebRoute(winPath, winSearch);
  if (winRoute?.kind === 'maliye') {
    return <MaliyeWebPortalRedirect token={winRoute.token} />;
  }

  if (EXPO_GUEST_CONTRACT_PATHS.some((p) => expoPath === p || expoPath.startsWith(`${p}/`))) {
    return null;
  }

  const route = winRoute;
  if (!route || route.kind === 'maliye') return null;

  if (
    expoPath === '/sözleşme' ||
    expoPath === '/sozlesme' ||
    expoPath === '/maliye' ||
    expoPath.startsWith('/menü/') ||
    expoPath.startsWith('/menu/') ||
    expoPath.startsWith('/maliye/') ||
    expoPath === '/breakfast-pass' ||
    expoPath.startsWith('/breakfast-pass/') ||
    expoPath.startsWith('/profil/') ||
    expoPath === '/guest' ||
    expoPath.startsWith('/guest/')
  ) {
    return null;
  }

  if (route.kind === 'menu') {
    const target = `/menu/${route.slug}`;
    if (pathname === target || pathname.startsWith(`${target}/`)) return null;
    return <Redirect href={{ pathname: '/menu/[slug]', params: { slug: route.slug } }} />;
  }

  if (route.kind === 'contract') {
    if (expoPath === '/guest/sign-one' || expoPath.startsWith('/guest/sign-one/')) return null;
    return (
      <Redirect
        href={{
          pathname: '/guest/sign-one',
          params: { t: route.token ?? '', l: route.lang ?? 'tr' },
        }}
      />
    );
  }

  if (route.kind === 'profil') {
    if (expoPath === `/profil/${route.staffId}` || expoPath.startsWith(`/profil/${route.staffId}/`)) {
      return null;
    }
    return <Redirect href={{ pathname: '/profil/[id]', params: { id: route.staffId } }} />;
  }

  return null;
}

export function PublicWebRouteFallback() {
  return usePublicWebRouteRedirect();
}
