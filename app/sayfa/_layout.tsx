import { Stack } from 'expo-router';

export default function SayfaLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[token]" />
    </Stack>
  );
}
