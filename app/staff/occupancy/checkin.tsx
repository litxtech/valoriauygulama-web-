import { Redirect } from 'expo-router';

export default function StaffOccupancyCheckinRedirect() {
  return <Redirect href="/staff/occupancy/operations?tab=pending" />;
}
