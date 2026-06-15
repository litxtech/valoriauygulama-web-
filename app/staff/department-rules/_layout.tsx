import { Stack } from 'expo-router';
import { buildStaffNestedStackOptions } from '@/lib/staffStackBack';

export default function StaffDepartmentRulesLayout() {
  return (
    <Stack screenOptions={buildStaffNestedStackOptions({ title: 'Bölüm Kuralları' })}>
      <Stack.Screen name="index" options={{ title: 'Bölüm Kuralları' }} />
      <Stack.Screen name="[id]" options={{ title: 'Kural detayı' }} />
    </Stack>
  );
}
