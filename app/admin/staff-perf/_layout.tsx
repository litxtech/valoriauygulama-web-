import { Stack } from 'expo-router';
import { adminTheme } from '@/constants/adminTheme';
import { AdminStackBackButton, adminStackGestureForNavigation } from '@/lib/adminStackBack';

export default function StaffPerfLayout() {
  return (
    <Stack
      screenOptions={({ navigation }) => ({
        ...adminStackGestureForNavigation(navigation),
        headerStyle: { backgroundColor: adminTheme.colors.surface },
        headerTintColor: adminTheme.colors.text,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerBackVisible: false,
        headerLeft: () => <AdminStackBackButton />,
      })}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Personel Denetim & Performans',
          headerLeft: () => <AdminStackBackButton fallback="/admin" />,
        }}
      />
      <Stack.Screen name="event" options={{ title: 'Denetim onay kaydı' }} />
      <Stack.Screen name="[staffId]" options={{ title: 'Personel Dosyası' }} />
      <Stack.Screen name="categories" options={{ title: 'Denetim Başlıkları' }} />
    </Stack>
  );
}
