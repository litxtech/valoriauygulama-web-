import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { buildStaffNestedStackOptions } from '@/lib/staffStackBack';

export default function GuestScanLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={buildStaffNestedStackOptions(t)}>
      <Stack.Screen name="index" options={{ title: t('kbsGuestHubTitle') }} />
      <Stack.Screen name="scan" options={{ headerShown: false }} />
      <Stack.Screen name="confirm" options={{ title: t('kbsGuestConfirmTitle') }} />
      <Stack.Screen name="group" options={{ title: t('kbsGuestGroupTitle') }} />
      <Stack.Screen name="room" options={{ title: t('kbsGuestRoomTitle') }} />
      <Stack.Screen name="results" options={{ title: t('kbsGuestResultsTitle'), headerBackVisible: false }} />
    </Stack>
  );
}
