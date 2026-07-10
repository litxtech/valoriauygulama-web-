import { Stack } from 'expo-router';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';

export default function PartnerLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: partnerTheme.bg } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="pending" />
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="breakfast-confirmations" />
      <Stack.Screen name="new-chat" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: true }} />
      <Stack.Screen name="camera-requests/index" options={{ headerShown: false }} />
      <Stack.Screen name="camera-requests/new" options={{ headerShown: false }} />
      <Stack.Screen name="camera-requests/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="guest-passes/index" options={{ headerShown: false }} />
      <Stack.Screen name="guest-passes/new" options={{ headerShown: false }} />
      <Stack.Screen name="guest-passes/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
