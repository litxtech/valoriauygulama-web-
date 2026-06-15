import { Redirect } from 'expo-router';

export default function StaffOccupancyRoomsRedirect() {
  return <Redirect href="/staff/occupancy/operations?tab=rooms" />;
}
