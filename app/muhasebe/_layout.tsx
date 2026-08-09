import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { canAccessMuhasebeWeb } from '@/lib/muhasebeAccess';
import { safeRouterReplace } from '@/lib/safeRouter';
import { adminTheme } from '@/constants/adminTheme';

export default function MuhasebeLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const staff = useAuthStore((s) => s.staff);
  const staffCheckComplete = useAuthStore((s) => s.staffCheckComplete);
  const loading = useAuthStore((s) => s.loading);
  const enterAccountingScope = useAdminOrgStore((s) => s.enterAccountingScope);
  const leaveAccountingScope = useAdminOrgStore((s) => s.leaveAccountingScope);

  const normalizedPath = (pathname || '').replace(/\/+/g, '/');
  const isLogin = normalizedPath === '/muhasebe/login' || normalizedPath.endsWith('/muhasebe/login');

  useEffect(() => {
    if (isLogin) return;
    if (loading || !staffCheckComplete) return;
    if (!user || !staff) {
      safeRouterReplace(router, '/muhasebe/login');
      return;
    }
    if (!canAccessMuhasebeWeb(staff)) {
      void useAuthStore.getState().signOut().finally(() => {
        safeRouterReplace(router, '/muhasebe/login');
      });
    }
  }, [isLogin, loading, staffCheckComplete, user, staff, router]);

  useEffect(() => {
    if (!staff || !canAccessMuhasebeWeb(staff)) return;
    const canUseAll = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
    void enterAccountingScope({
      canUseAll,
      ownOrganizationId: staff?.organization_id,
    });
    return () => {
      leaveAccountingScope();
    };
  }, [
    staff?.id,
    staff?.role,
    staff?.organization_id,
    staff?.app_permissions?.super_admin,
    enterAccountingScope,
    leaveAccountingScope,
  ]);

  if (!isLogin && (loading || !staffCheckComplete)) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  if (!isLogin && (!user || !staff || !canAccessMuhasebeWeb(staff))) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: adminTheme.colors.surfaceSecondary } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="index" />
      <Stack.Screen name="payments" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
});
