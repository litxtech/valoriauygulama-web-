import { Stack } from 'expo-router';

export default function BilgiLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[token]" />
    </Stack>
  );
}
