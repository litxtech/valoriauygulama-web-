import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';

const MENU_BG = '#faf9f7';

export default function PublicMenuLayout() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const html = document.documentElement;
    document.body.style.backgroundColor = MENU_BG;
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.overflowX = 'hidden';
    html.style.scrollBehavior = 'smooth';
    html.style.overflow = 'hidden';
    html.style.overflowX = 'hidden';
    html.style.height = '100%';
    document.body.style.minHeight = '100%';
    document.body.style.height = '100%';
    return () => {
      document.body.style.backgroundColor = '';
      document.body.style.margin = '';
      document.body.style.overflow = '';
      document.body.style.overflowX = '';
      document.body.style.minHeight = '';
      document.body.style.height = '';
      html.style.scrollBehavior = '';
      html.style.overflow = '';
      html.style.overflowX = '';
      html.style.height = '';
    };
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: MENU_BG } }}>
      <Stack.Screen name="[slug]" />
    </Stack>
  );
}
