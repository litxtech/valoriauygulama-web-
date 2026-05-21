import { Stack } from 'expo-router';
import { adminTheme } from '@/constants/adminTheme';
import { AdminStackBackButton, adminStackGestureForNavigation } from '@/lib/adminStackBack';

export default function AuditsLayout() {
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
        options={{ title: 'Denetim panosu', headerLeft: () => <AdminStackBackButton fallback="/admin" /> }}
      />
      <Stack.Screen name="new" options={{ title: 'Yeni denetim' }} />
      <Stack.Screen name="[id]" options={{ title: 'Denetim detayı' }} />
      <Stack.Screen name="categories/index" options={{ title: 'Bölümler & kriterler' }} />
    </Stack>
  );
}
