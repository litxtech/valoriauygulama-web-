import { Redirect } from 'expo-router';

export default function StaffOccupancyStaysRedirect() {
  return <Redirect href="/staff/occupancy/operations?tab=history" />;
}
