import { useEffect, useRef } from 'react';
import { usePathname } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { attachAppScreenshotListener, type ScreenshotReportIdentity } from '@/lib/appScreenshotPolicy';
import { AppScreenshotWarningModal } from '@/components/AppScreenshotWarningModal';

function resolveIdentity(): ScreenshotReportIdentity | null {
  const { user, staff } = useAuthStore.getState();
  if (!user) return null;
  if (staff?.id) {
    return {
      kind: staff.role === 'admin' ? 'admin' : 'staff',
      displayName: staff.full_name?.trim() || staff.email?.trim() || 'Personel',
      staffId: staff.id,
    };
  }
  return {
    kind: 'guest',
    displayName: user.email?.trim() || user.phone?.trim() || 'Misafir',
  };
}

/** Giriş yapmış personel / misafir / admin için tek ekran görüntüsü dinleyicisi */
export function AppScreenshotPolicyProvider() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const user = useAuthStore((s) => s.user);
  const staffId = useAuthStore((s) => s.staff?.id);

  useEffect(() => {
    return attachAppScreenshotListener(!!user, () => {
      const identity = resolveIdentity();
      if (!identity) return null;
      return { pathname: pathnameRef.current, identity };
    });
  }, [!!user, staffId]);

  return <AppScreenshotWarningModal />;
}
