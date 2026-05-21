import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StaffStackBackButton, staffStackGestureForNavigation } from '@/lib/staffStackBack';

export default function StaffExpensesLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={({ navigation }) => ({
        headerShown: true,
        ...staffStackGestureForNavigation(navigation),
        headerBackVisible: false,
        headerLeft: () => <StaffStackBackButton accessibilityLabel={t('back')} />,
      })}
    >
      <Stack.Screen
        name="index"
        options={{ title: t('staffExpenseHistoryTitle'), headerLeft: () => <StaffStackBackButton fallback="/staff/(tabs)" /> }}
      />
      <Stack.Screen name="new" options={{ title: t('staffExpenseNewTitle') }} />
      <Stack.Screen name="monthly" options={{ title: 'Aylık Geçmiş' }} />
    </Stack>
  );
}
