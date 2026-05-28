import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';

const MENU_BG = '#f7f5f2';

export default function PublicMenuLayout() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.body.style.backgroundColor = MENU_BG;
    document.body.style.margin = '0';
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => {
      document.body.style.backgroundColor = '';
      document.body.style.margin = '';
      document.documentElement.style.scrollBehavior = '';
    };
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: MENU_BG } }}>
      <Stack.Screen name="[slug]" />
    </Stack>
  );
}
