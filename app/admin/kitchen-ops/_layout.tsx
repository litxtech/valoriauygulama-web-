import { Stack } from 'expo-router';

export default function AdminKitchenOpsLayout() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Geri' }}>
      <Stack.Screen name="index" options={{ title: 'Mutfak Operasyon Yönetimi' }} />
      <Stack.Screen name="settings" options={{ title: 'Ayarlar' }} />
      <Stack.Screen name="categories" options={{ title: 'Stok Kategorileri' }} />
      <Stack.Screen name="reports" options={{ title: 'Raporlar' }} />
      <Stack.Screen name="reception" options={{ title: 'Reception Muhasebe' }} />
    </Stack>
  );
}
