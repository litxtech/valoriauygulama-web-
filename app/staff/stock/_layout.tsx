import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StaffStackBackButton, STAFF_TABS_FALLBACK, buildStaffNestedStackOptions } from '@/lib/staffStackBack';

export default function StaffStockLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={buildStaffNestedStackOptions(t)}>
      <Stack.Screen
        name="index"
        options={{ title: t('stockListTitle'), headerLeft: () => <StaffStackBackButton fallback={STAFF_TABS_FALLBACK} /> }}
      />
      <Stack.Screen name="entry" options={{ title: t('stockEntryTitle') }} />
      <Stack.Screen name="exit" options={{ title: t('stockExitTitle') }} />
      <Stack.Screen name="scan" options={{ title: t('scanBarcode'), headerShown: false }} />
      <Stack.Screen name="product/[id]" options={{ title: t('productDetail') }} />
      <Stack.Screen name="all" options={{ title: t('allStocks') }} />
      <Stack.Screen name="my-movements" options={{ title: t('myStockMovements') }} />
      <Stack.Screen name="manual" options={{ title: t('manualEntry') }} />
    </Stack>
  );
}
