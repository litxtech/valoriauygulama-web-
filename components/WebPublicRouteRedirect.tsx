import { Platform } from 'react-native';
import { Redirect, usePathname, type Href } from 'expo-router';
import { usePublicWebRouteRedirect } from '@/components/PublicWebRouteFallback';

/**
 * Web QR yolları (/menü, /sözleşme, /maliye, /guest?token=).
 * Redirect render aşamasında çalışır — Root Layout mount olmadan router.replace hatası önlenir.
 */
export function WebPublicRouteRedirect() {
  const pathname = usePathname();
  const publicRedirect = usePublicWebRouteRedirect();

  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;

  const winPath = window.location.pathname || '';
  const winSearch = window.location.search || '';
  const winNormalized = winPath.replace(/\/$/, '') || '/';

  /** Web: /admin/payments/* doğrudan açılışta unmatched route — personel rotasına taşı */
  if (winNormalized === '/admin/payments' || winNormalized.startsWith('/admin/payments/')) {
    const staffPath = `${winNormalized.replace(/^\/admin\/payments/, '/staff/payments')}${winSearch}`;
    const expoStaffPath = (pathname || '').replace(/^\/admin\/payments/, '/staff/payments');
    if (!expoStaffPath.startsWith('/staff/payments')) {
      return <Redirect href={staffPath as Href} />;
    }
  }

  return publicRedirect;
}
