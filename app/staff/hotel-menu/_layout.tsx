import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StaffStackBackButton, STAFF_TABS_FALLBACK, buildStaffNestedStackOptions } from '@/lib/staffStackBack';

/** Statik rotalar ([id] dinamik rotasından önce eşleşsin). */
export default function StaffHotelMenuLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={buildStaffNestedStackOptions(t)}>
      <Stack.Screen
        name="index"
        options={{
          title: '',
          headerLeft: () => (
            <StaffStackBackButton fallback={STAFF_TABS_FALLBACK} accessibilityLabel={t('back')} />
          ),
        }}
      />
      <Stack.Screen name="manage" options={{ title: t('hotelKitchenMenuManageTitle') }} />
      <Stack.Screen name="edit" options={{}} />
      <Stack.Screen name="theme" options={{ title: t('hotelKitchenMenuThemeTitle') }} />
      <Stack.Screen name="[id]" options={{ title: t('screenHotelKitchenMenu') }} />
    </Stack>
  );
}
