import { Stack } from 'expo-router';

export default function StaffDebtsLayout() {
  return (
    <Stack screenOptions={{ headerShown: true, headerStyle: { backgroundColor: '#fff' }, headerTintColor: '#1a1d21' }}>
      <Stack.Screen name="index" options={{ title: 'Borç / alacak' }} />
      <Stack.Screen name="new" options={{ title: 'Yeni kayıt' }} />
      <Stack.Screen name="[id]" options={{ title: 'Detay' }} />
    </Stack>
  );
}
