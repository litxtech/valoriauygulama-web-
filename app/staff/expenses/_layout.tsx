import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function StaffExpensesLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ title: t('staffExpenseHistoryTitle') }} />
      <Stack.Screen name="new" options={{ title: t('staffExpenseNewTitle') }} />
      <Stack.Screen name="monthly" options={{ title: 'Aylık Geçmiş' }} />
    </Stack>
  );
}
