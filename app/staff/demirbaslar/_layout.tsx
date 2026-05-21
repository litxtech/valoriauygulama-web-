import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StaffStackBackButton, STAFF_TABS_FALLBACK, buildStaffNestedStackOptions } from '@/lib/staffStackBack';

export default function StaffFixedAssetsLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={buildStaffNestedStackOptions(t)}>
      <Stack.Screen
        name="index"
        options={{ title: t('staffAssetsTitle'), headerLeft: () => <StaffStackBackButton fallback={STAFF_TABS_FALLBACK} /> }}
      />
      <Stack.Screen name="new" options={{ title: t('staffAssetsNewTitle') }} />
      <Stack.Screen name="[id]" options={{ title: t('staffAssetsDetailTitle') }} />
    </Stack>
  );
}
