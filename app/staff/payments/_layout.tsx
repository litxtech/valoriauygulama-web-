import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StaffStackBackButton, STAFF_TABS_FALLBACK, buildStaffNestedStackOptions } from '@/lib/staffStackBack';
import { paymentText } from '@/lib/paymentsI18n';

export default function StaffPaymentsLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={buildStaffNestedStackOptions(t)}>
      <Stack.Screen
        name="index"
        options={{
          title: paymentText('paymentsHistory'),
          headerLeft: () => <StaffStackBackButton fallback={STAFF_TABS_FALLBACK} />,
        }}
      />
      <Stack.Screen name="history" options={{ title: paymentText('paymentsHistoryTitle') }} />
      <Stack.Screen name="stands/index" options={{ title: 'Sabit QR noktaları' }} />
      <Stack.Screen name="new" options={{ title: paymentText('paymentsNew') }} />
      <Stack.Screen name="[id]" options={{ title: paymentText('paymentsShowQr') }} />
      <Stack.Screen name="stand/[id]" options={{ title: paymentText('paymentsStandingTitle') }} />
    </Stack>
  );
}
