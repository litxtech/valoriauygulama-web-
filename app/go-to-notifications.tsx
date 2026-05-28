/**
 * Bildirimlere yönlendirme sayfası (eski push payload uyumluluğu).
 * Doğrudan staff/customer bildirimler sekmesine replace edilir; auth boot bitene kadar bekler.
 */
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { safeRouterReplace } from '@/lib/safeRouter';

export default function GoToNotificationsScreen() {
  const router = useRouter();
  const staffCheckComplete = useAuthStore((s) => s.staffCheckComplete);
  const loading = useAuthStore((s) => s.loading);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await useAuthStore.getState().loadSession();
      await useAuthStore.getState().waitForStaffCheck();
      if (cancelled) return;
      const staff = useAuthStore.getState().staff;
      safeRouterReplace(router, staff ? '/staff/notifications' : '/customer/notifications');
      if (!staff) {
        import('@/stores/guestNotificationStore').then(({ useGuestNotificationStore }) =>
          useGuestNotificationStore.getState().refresh()
        );
      }
    };
    if (!staffCheckComplete && loading) return;
    void run();
    return () => {
      cancelled = true;
    };
  }, [router, staffCheckComplete, loading]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
      <ActivityIndicator size="large" color="#1a365d" />
    </View>
  );
}
