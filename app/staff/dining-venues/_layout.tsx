import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { canAccessDiningVenuesManagement } from '@/lib/diningVenuesPermissions';
import { StaffStackBackButton, STAFF_TABS_FALLBACK, buildStaffNestedStackOptions } from '@/lib/staffStackBack';

export default function StaffDiningVenuesLayout() {
  const { t } = useTranslation();
  const staff = useAuthStore((s) => s.staff);
  const isMgmt = canAccessDiningVenuesManagement(staff);
  return (
    <Stack screenOptions={buildStaffNestedStackOptions(t)}>
      <Stack.Screen
        name="index"
        options={{
          title: isMgmt ? t('diningVenuesAdminTitle') : t('diningVenuesNavTitle'),
          headerLeft: () => <StaffStackBackButton fallback={STAFF_TABS_FALLBACK} />,
        }}
      />
      <Stack.Screen name="guest/[id]" options={{ title: t('diningVenuesNavTitle') }} />
      <Stack.Screen name="venue/[id]" options={{ title: t('diningVenuesFormTitle') }} />
      <Stack.Screen name="pick-location" options={{ title: t('diningVenuesPickOnMap') }} />
    </Stack>
  );
}
