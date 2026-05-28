import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StaffStackBackButton, STAFF_TABS_FALLBACK, buildStaffNestedStackOptions } from '@/lib/staffStackBack';

export default function CamerasLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={buildStaffNestedStackOptions(t)}>
      <Stack.Screen
        name="index"
        options={{
          title: t('staffLiveCamerasTitle'),
          headerLeft: () => <StaffStackBackButton fallback={STAFF_TABS_FALLBACK} />,
        }}
      />
      <Stack.Screen name="view/[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
