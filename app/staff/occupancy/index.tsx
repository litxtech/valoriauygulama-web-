import { Redirect } from 'expo-router';

/** Doluluk kısayolu → operasyon merkezi (günlük rapor: /staff/occupancy/daily). */
export default function StaffOccupancyIndexRedirect() {
  return <Redirect href="/staff/occupancy/operations" />;
}
