import { Stack } from 'expo-router';
import { StaffStackBackButton, STAFF_TABS_FALLBACK, buildStaffNestedStackOptions } from '@/lib/staffStackBack';

export default function TechnicalAssetsLayout() {
  return (
    <Stack
      screenOptions={({ navigation }) => ({
        ...buildStaffNestedStackOptions((k) => k)({ navigation }),
        headerTintColor: '#1a365d',
      })}
    >
      <Stack.Screen
        name="index"
        options={{ title: 'Teknik QR Envanter', headerLeft: () => <StaffStackBackButton fallback={STAFF_TABS_FALLBACK} /> }}
      />
      <Stack.Screen name="scan" options={{ title: 'QR Tara', headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: 'Teknik Varlık' }} />
      <Stack.Screen name="log" options={{ title: 'Müdahale Kaydı' }} />
      <Stack.Screen name="browse" options={{ title: 'Varlık Listesi' }} />
      <Stack.Screen name="recent-logs" options={{ title: 'Son müdahaleler' }} />
      <Stack.Screen name="faults/index" options={{ title: 'Arıza bildirimleri' }} />
      <Stack.Screen name="faults/new" options={{ title: 'Yeni arıza' }} />
      <Stack.Screen name="faults/[id]" options={{ title: 'Arıza detayı' }} />
    </Stack>
  );
}
