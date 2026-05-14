import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { isKbsUiEnabled } from '@/lib/kbsUiEnabled';
import { useTranslation } from 'react-i18next';

export default function KbsLayout() {
  const { t } = useTranslation();
  const staff = useAuthStore((s) => s.staff);
  if (!isKbsUiEnabled()) {
    return <Redirect href="/staff" />;
  }
  const blocked = staff?.role !== 'admin' && staff?.kbs_access_enabled === false;
  if (blocked) {
    return <Redirect href="/staff" />;
  }
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ title: t('kbsNavOperation') }} />
      <Stack.Screen name="scan" options={{ title: t('kbsNavScanSerial'), headerShown: false }} />
      <Stack.Screen name="ready" options={{ title: t('kbsNavReady') }} />
      <Stack.Screen name="submitted" options={{ title: t('kbsNavSubmitted') }} />
      <Stack.Screen name="rooms" options={{ title: t('kbsNavRooms') }} />
      <Stack.Screen name="failed" options={{ title: t('kbsNavFailed') }} />
      <Stack.Screen name="batch" options={{ title: 'Parti / Beklet' }} />
    </Stack>
  );
}

