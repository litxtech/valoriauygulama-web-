import { Redirect } from 'expo-router';

export default function StaysScreen() {
  return <Redirect href="/admin/report/operations?tab=history" />;
}
