import { Redirect } from 'expo-router';

export default function CheckInScreen() {
  return <Redirect href="/admin/report/operations?tab=pending" />;
}
