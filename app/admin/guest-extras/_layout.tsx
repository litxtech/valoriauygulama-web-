import { Stack } from 'expo-router';
import { adminStackGestureForNavigation } from '@/lib/adminStackBack';

export default function AdminGuestExtrasLayout() {
  return (
    <Stack screenOptions={{ ...adminStackGestureForNavigation(), headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
