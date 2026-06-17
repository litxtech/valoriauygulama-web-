import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StaffStackBackButton, STAFF_TABS_FALLBACK, buildStaffNestedStackOptions } from '@/lib/staffStackBack';

export default function StaffBreakfastBriefingLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={buildStaffNestedStackOptions(t)}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Sabah kahvaltı sayısı',
          headerLeft: () => (
            <StaffStackBackButton fallback={STAFF_TABS_FALLBACK} accessibilityLabel={t('back')} />
          ),
        }}
      />
    </Stack>
  );
}
