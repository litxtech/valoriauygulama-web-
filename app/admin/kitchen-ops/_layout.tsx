import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { adminTheme } from '@/constants/adminTheme';
import {
  AdminStackBackButton,
  ADMIN_KITCHEN_OPS_HUB,
  ADMIN_TABS_FALLBACK,
  adminStackGestureForNavigation,
} from '@/lib/adminStackBack';

export default function AdminKitchenOpsLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={({ navigation }) => ({
        headerShown: true,
        headerStyle: { backgroundColor: adminTheme.colors.surface },
        headerTintColor: adminTheme.colors.text,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        ...adminStackGestureForNavigation(navigation),
        headerBackVisible: false,
        headerLeft: () => <AdminStackBackButton accessibilityLabel={t('back')} />,
      })}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="settings"
        options={{
          title: 'Ayarlar',
          headerLeft: () => <AdminStackBackButton fallback={ADMIN_KITCHEN_OPS_HUB} />,
        }}
      />
      <Stack.Screen
        name="categories"
        options={{
          title: 'Stok Kategorileri',
          headerLeft: () => <AdminStackBackButton fallback={ADMIN_KITCHEN_OPS_HUB} />,
        }}
      />
      <Stack.Screen
        name="reports"
        options={{
          title: 'Raporlar',
          headerLeft: () => <AdminStackBackButton fallback={ADMIN_KITCHEN_OPS_HUB} />,
        }}
      />
      <Stack.Screen
        name="reception"
        options={{
          title: 'Reception Muhasebe',
          headerLeft: () => <AdminStackBackButton fallback={ADMIN_KITCHEN_OPS_HUB} />,
        }}
      />
      <Stack.Screen
        name="revenue-notify"
        options={{
          title: 'Hasılat bildirimleri',
          headerLeft: () => <AdminStackBackButton fallback={ADMIN_KITCHEN_OPS_HUB} />,
        }}
      />
      <Stack.Screen
        name="menu-order-notify"
        options={{
          title: 'Menü sipariş bildirimleri',
          headerLeft: () => <AdminStackBackButton fallback={ADMIN_KITCHEN_OPS_HUB} />,
        }}
      />
      <Stack.Screen
        name="finance-access"
        options={{
          title: 'Finans erişimi',
          headerLeft: () => <AdminStackBackButton fallback={ADMIN_KITCHEN_OPS_HUB} />,
        }}
      />
    </Stack>
  );
}
