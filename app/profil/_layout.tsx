import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';

const BG = '#0c1222';

export default function PublicProfilLayout() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.body.style.backgroundColor = BG;
    document.body.style.margin = '0';
    return () => {
      document.body.style.backgroundColor = '';
      document.body.style.margin = '';
    };
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: BG } }}>
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
