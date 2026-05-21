import { Stack } from 'expo-router';
import { adminTheme } from '@/constants/adminTheme';
import { AdminStackBackButton, adminStackGestureForNavigation } from '@/lib/adminStackBack';

export default function AdminPerformanceLayout() {
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
          title: 'Ayın en iyi personeli',
          headerLeft: () => <AdminStackBackButton fallback="/admin" />,
        }}
      />
    </Stack>
  );
}
