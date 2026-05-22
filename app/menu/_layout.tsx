import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';

const MENU_BG = '#f7f5f2';

export default function PublicMenuLayout() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.body.style.backgroundColor = MENU_BG;
    return () => {
      document.body.style.backgroundColor = '';
    };
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: MENU_BG } }}>
      <Stack.Screen name="[slug]" />
    </Stack>
  );
}
