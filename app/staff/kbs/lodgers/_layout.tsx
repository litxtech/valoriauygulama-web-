import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { buildStaffNestedStackOptions } from '@/lib/staffStackBack';

export default function KbsLodgersLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={buildStaffNestedStackOptions(t)}>
      <Stack.Screen name="index" options={{ title: t('kbsLodgersTitle') }} />
      <Stack.Screen name="[id]" options={{ title: t('kbsLodgersDetail') }} />
    </Stack>
  );
}
