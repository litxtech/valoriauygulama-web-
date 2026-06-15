import { Stack } from 'expo-router';
import { buildStaffNestedStackOptions } from '@/lib/staffStackBack';

export default function StaffManagedContractsLayout() {
  return <Stack screenOptions={buildStaffNestedStackOptions({ title: 'Sözleşmelerim' })} />;
}
