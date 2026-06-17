import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { adminTheme } from '@/constants/adminTheme';
import { AdminStackBackButton, adminStackGestureForNavigation } from '@/lib/adminStackBack';
import { paymentText } from '@/lib/paymentsI18n';

export default function AdminPaymentsLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={({ navigation }) => ({
        headerShown: true,
        headerStyle: { backgroundColor: adminTheme.colors.surface },
        headerTintColor: adminTheme.colors.text,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        ...adminStackGestureForNavigation(navigation),
        headerBackVisible: false,
        headerLeft: () => <AdminStackBackButton accessibilityLabel={t('back')} />,
      })}
    >
      <Stack.Screen name="index" options={{ title: 'Tahsilat Merkezi' }} />
      <Stack.Screen name="stands/index" options={{ title: 'Sabit QR noktaları' }} />
      <Stack.Screen name="history" options={{ title: paymentText('paymentsHistoryTitle') }} />
      <Stack.Screen name="new" options={{ title: paymentText('paymentsNew') }} />
      <Stack.Screen name="[id]" options={{ title: paymentText('paymentsShowQr') }} />
      <Stack.Screen name="stand/[id]" options={{ title: paymentText('paymentsStandingTitle') }} />
    </Stack>
  );
}
