import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { adminTheme } from '@/constants/adminTheme';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import {
  AdminStackBackButton,
  adminStackGestureForNavigation,
} from '@/lib/adminStackBack';

export default function AccountingLayout() {
  const staff = useAuthStore((s) => s.staff);
  const enterAccountingScope = useAdminOrgStore((s) => s.enterAccountingScope);
  const leaveAccountingScope = useAdminOrgStore((s) => s.leaveAccountingScope);

  useEffect(() => {
    const canUseAll = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
    void enterAccountingScope({
      canUseAll,
      ownOrganizationId: staff?.organization_id,
    });
    return () => {
      leaveAccountingScope();
    };
  }, [staff?.id, staff?.role, staff?.organization_id, staff?.app_permissions?.super_admin, enterAccountingScope, leaveAccountingScope]);

  return (
    <Stack
      screenOptions={({ navigation }) => ({
        ...adminStackGestureForNavigation(navigation),
        headerStyle: { backgroundColor: adminTheme.colors.surface },
        headerTintColor: adminTheme.colors.text,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerBackVisible: false,
        headerLeft: () => <AdminStackBackButton />,
      })}
    >
      <Stack.Screen
        name="index"
        options={{ title: 'Muhasebe', headerLeft: () => <AdminStackBackButton fallback="/admin" /> }}
      />
      <Stack.Screen name="movements/index" options={{ title: 'Tüm ödemeler' }} />
      <Stack.Screen name="movements/new" options={{ title: 'Yeni kayıt' }} />
      <Stack.Screen name="movements/[id]" options={{ title: 'Hareket detayı' }} />
      <Stack.Screen name="movements/edit" options={{ title: 'Kayıt düzenle' }} />
      <Stack.Screen name="quick-pay" options={{ headerShown: false }} />
      <Stack.Screen name="counterparties/index" options={{ title: 'Kişi ödemeleri' }} />
      <Stack.Screen name="counterparties/new" options={{ title: 'Yeni kişi' }} />
      <Stack.Screen name="counterparties/[id]" options={{ title: 'Kişi detayı' }} />
      <Stack.Screen name="counterparties/edit" options={{ title: 'Kişi düzenle' }} />
      <Stack.Screen name="categories/index" options={{ title: 'Kategoriler' }} />
      <Stack.Screen name="activity/index" options={{ title: 'Son işlemler' }} />
    </Stack>
  );
}
