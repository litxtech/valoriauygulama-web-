import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AdminStackBackButton, buildAdminNestedStackOptions } from '@/lib/adminStackBack';

export default function AdminFnbHubLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={buildAdminNestedStackOptions(t)}>
      <Stack.Screen
        name="index"
        options={{
          title: t('fnbHubTitle'),
          headerLeft: () => <AdminStackBackButton fallback="/admin" accessibilityLabel={t('back')} />,
        }}
      />
      <Stack.Screen name="menu-theme" options={{ title: t('hotelKitchenMenuThemeTitle') }} />
    </Stack>
  );
}
