import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { OccupancyOpsGate } from '@/components/occupancy/OccupancyOpsGate';
import {
  StaffStackBackButton,
  STAFF_TABS_FALLBACK,
  buildStaffNestedStackOptions,
} from '@/lib/staffStackBack';

export default function StaffOccupancyLayout() {
  const { t } = useTranslation();
  return (
    <OccupancyOpsGate>
      <Stack screenOptions={buildStaffNestedStackOptions(t)}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="operations"
          options={{
            title: 'Konaklama operasyon',
            headerLeft: () => (
              <StaffStackBackButton fallback={STAFF_TABS_FALLBACK} accessibilityLabel={t('back')} />
            ),
          }}
        />
        <Stack.Screen
          name="daily"
          options={{
            title: 'Günlük doluluk raporu',
            headerLeft: () => (
              <StaffStackBackButton fallback="/staff/occupancy/operations" accessibilityLabel={t('back')} />
            ),
          }}
        />
        <Stack.Screen
          name="breakfast-briefing"
          options={{
            title: 'Sabah kahvaltı sayısı',
            headerLeft: () => (
              <StaffStackBackButton fallback="/staff/occupancy/operations" accessibilityLabel={t('back')} />
            ),
          }}
        />
        <Stack.Screen name="checkin" options={{ title: 'Giriş bekleyen', headerShown: false }} />
        <Stack.Screen name="rooms/index" options={{ title: 'Odalar', headerShown: false }} />
        <Stack.Screen name="rooms/[id]" options={{ title: 'Oda detayı' }} />
        <Stack.Screen name="guests" options={{ headerShown: false }} />
        <Stack.Screen name="stays" options={{ title: 'Geçmiş', headerShown: false }} />
      </Stack>
    </OccupancyOpsGate>
  );
}
