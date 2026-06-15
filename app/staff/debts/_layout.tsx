import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StaffStackBackButton, STAFF_TABS_FALLBACK, buildStaffNestedStackOptions } from '@/lib/staffStackBack';

export default function StaffDebtsLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={buildStaffNestedStackOptions(t)}>
      <Stack.Screen
        name="index"
        options={{ title: t('staffDebtsTitle'), headerLeft: () => <StaffStackBackButton fallback={STAFF_TABS_FALLBACK} /> }}
      />
      <Stack.Screen name="new" options={{ title: t('staffDebtsNewRecord') }} />
      <Stack.Screen name="[id]" options={{ title: t('staffFacilityJournalDetail') }} />
    </Stack>
  );
}
