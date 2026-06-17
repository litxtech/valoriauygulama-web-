import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StaffStackBackButton, STAFF_TABS_FALLBACK, buildStaffNestedStackOptions } from '@/lib/staffStackBack';

export default function KitchenOpsLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={buildStaffNestedStackOptions(t)}>
      <Stack.Screen
        name="index"
        options={{
          title: t('staffKitchenOpsTitle'),
          headerLeft: () => <StaffStackBackButton fallback={STAFF_TABS_FALLBACK} />,
        }}
      />
      <Stack.Screen name="stock/entry" options={{ title: t('staffKitchenStockAdd') }} />
      <Stack.Screen name="stock/exit" options={{ title: t('staffKitchenStockExit') }} />
      <Stack.Screen name="stock/current" options={{ title: t('staffKitchenCurrentStock') }} />
      <Stack.Screen name="stock/low" options={{ title: t('staffKitchenLowStock') }} />
      <Stack.Screen name="shortages/index" options={{ title: t('staffKitchenShortages') }} />
      <Stack.Screen name="shortages/report/[id]" options={{ title: t('staffKitchenShortageReport') }} />
      <Stack.Screen name="stock/scan" options={{ title: t('staffKitchenBarcodeScan'), headerShown: false }} />
      <Stack.Screen name="stock/product/[id]" options={{ title: t('staffKitchenProductDetail') }} />
      <Stack.Screen name="revenue/index" options={{ title: t('staffKitchenRevenue') }} />
      <Stack.Screen name="revenue/new" options={{ title: t('staffKitchenRevenueEnter') }} />
      <Stack.Screen name="expenses/index" options={{ title: t('staffKitchenExpenses') }} />
      <Stack.Screen name="expenses/new" options={{ title: t('staffKitchenExpenseEnter') }} />
      <Stack.Screen name="personnel/index" options={{ title: t('staffKitchenPersonnelPayments') }} />
      <Stack.Screen name="personnel/new" options={{ title: t('staffKitchenPaymentRecord') }} />
      <Stack.Screen name="suppliers/index" options={{ title: t('staffKitchenSupplierDebts') }} />
      <Stack.Screen name="suppliers/new" options={{ title: t('staffKitchenDebtRecord') }} />
      <Stack.Screen name="cari/index" options={{ title: t('staffKitchenHotelCari') }} />
      <Stack.Screen name="pos/index" options={{ title: t('staffKitchenPos') }} />
      <Stack.Screen name="pos/new" options={{ title: t('staffKitchenPosRecord') }} />
      <Stack.Screen name="settlements/index" options={{ title: t('staffKitchenSettlements') }} />
      <Stack.Screen name="settlements/new" options={{ title: t('staffKitchenNewPayment') }} />
      <Stack.Screen name="handovers/index" options={{ title: t('staffKitchenHandovers') }} />
      <Stack.Screen name="handovers/new" options={{ title: t('staffKitchenHandoverRecord') }} />
      <Stack.Screen name="handovers/[id]" options={{ title: t('staffKitchenHandoverDetail') }} />
      <Stack.Screen name="day-close/index" options={{ title: t('staffKitchenDayClose') }} />
      <Stack.Screen name="finance/index" options={{ title: t('staffKitchenFinanceSummary') }} />
      <Stack.Screen name="finance-bridge/index" options={{ title: 'Mutfak ↔ Resepsiyon Finans' }} />
      <Stack.Screen name="reception" options={{ title: t('staffKitchenReceptionAccounting') }} />
    </Stack>
  );
}
