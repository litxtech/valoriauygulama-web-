import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { GUEST_CONTRACT_WEB_BG } from '@/components/guest/GuestSignOneWebShell';

const GUEST_BG = '#1a365d';
const SIGN_ONE_BG = Platform.OS === 'web' ? GUEST_CONTRACT_WEB_BG : '#ffffff';

export default function GuestLayout() {
  const pathname = usePathname();
  const isSignOne = pathname?.includes('sign-one') ?? false;
  const isSuccess = pathname?.includes('success') ?? false;
  const isContractFlow = isSignOne || isSuccess;
  const pageBg = isContractFlow ? SIGN_ONE_BG : GUEST_BG;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.body.style.backgroundColor = pageBg;
    document.documentElement.style.backgroundColor = pageBg;
    return () => {
      document.body.style.backgroundColor = '';
      document.documentElement.style.backgroundColor = '';
    };
  }, [pageBg]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: isContractFlow ? { backgroundColor: SIGN_ONE_BG } : undefined,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="language" />
      <Stack.Screen name="contract" />
      <Stack.Screen name="form" />
      <Stack.Screen name="verify" />
      <Stack.Screen name="sign" />
      <Stack.Screen name="sign-one" />
      <Stack.Screen name="success" />
    </Stack>
  );
}
