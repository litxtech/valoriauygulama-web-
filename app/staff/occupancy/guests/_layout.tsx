import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StaffStackBackButton, buildStaffNestedStackOptions } from '@/lib/staffStackBack';

export default function OccupancyGuestsLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={buildStaffNestedStackOptions(t)}>
      <Stack.Screen
        name="[id]"
        options={{
          title: 'Misafir',
          headerLeft: () => (
            <StaffStackBackButton fallback="/staff/occupancy/operations" accessibilityLabel={t('back')} />
          ),
        }}
      />
    </Stack>
  );
}
