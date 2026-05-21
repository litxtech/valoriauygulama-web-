import { useEffect } from 'react';
import { Redirect, Stack, usePathname } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { isKbsUiEnabled } from '@/lib/kbsUiEnabled';
import { canStaffUseMrzScan } from '@/lib/kbsMrzAccess';
import { refreshStaffKbsAccess } from '@/lib/refreshStaffKbsAccess';
import { useTranslation } from 'react-i18next';
import { StaffStackBackButton, STAFF_TABS_FALLBACK, buildStaffNestedStackOptions } from '@/lib/staffStackBack';

export default function KbsLayout() {
  const { t } = useTranslation();
  const staff = useAuthStore((s) => s.staff);
  const pathname = usePathname();
  const guestMrzSubtree = pathname?.includes('/kbs/guests');
  const mrzOnlyAccess = canStaffUseMrzScan(staff);

  useEffect(() => {
    void refreshStaffKbsAccess();
  }, [staff?.id]);
  if (!isKbsUiEnabled() && !(guestMrzSubtree && mrzOnlyAccess)) {
    return <Redirect href="/staff" />;
  }
  const blocked = staff?.role !== 'admin' && staff?.kbs_access_enabled === false;
  if (blocked) {
    return <Redirect href="/staff" />;
  }
  return (
    <Stack screenOptions={buildStaffNestedStackOptions(t)}>
      <Stack.Screen
        name="index"
        options={{ title: t('kbsNavOperation'), headerLeft: () => <StaffStackBackButton fallback={STAFF_TABS_FALLBACK} /> }}
      />
      <Stack.Screen
        name="scan"
        options={{ title: t('kbsNavScanSerial'), headerShown: false, contentStyle: { backgroundColor: '#000' } }}
      />
      <Stack.Screen name="ready" options={{ title: t('kbsNavReady') }} />
      <Stack.Screen name="submitted" options={{ title: t('kbsNavSubmitted') }} />
      <Stack.Screen name="rooms" options={{ title: t('kbsNavRooms') }} />
      <Stack.Screen name="failed" options={{ title: t('kbsNavFailed') }} />
      <Stack.Screen name="batch" options={{ title: 'Parti / Beklet' }} />
      <Stack.Screen name="guests" options={{ headerShown: false }} />
      <Stack.Screen name="lodgers" options={{ headerShown: false }} />
    </Stack>
  );
}
