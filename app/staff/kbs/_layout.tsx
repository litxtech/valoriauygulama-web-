import { useEffect } from 'react';
import { Redirect, Stack, usePathname, type Href } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { isKbsUiEnabled } from '@/lib/kbsUiEnabled';
import { canStaffUseIdCapture, canStaffUseMrzScan, canStaffViewKbsCaptureHistory } from '@/lib/kbsMrzAccess';
import { refreshStaffKbsAccess } from '@/lib/refreshStaffKbsAccess';
import { useTranslation } from 'react-i18next';
import { StaffStackBackButton, STAFF_TABS_FALLBACK, buildStaffNestedStackOptions } from '@/lib/staffStackBack';
import { KbsCaptureWatermarkHost } from '@/components/kbs/KbsCaptureWatermarkHost';

function isIdCaptureWriteRoute(pathname: string | null | undefined): boolean {
  const p = pathname ?? '';
  return p.includes('/kbs/capture-id') || p.includes('/kbs/capture-nfc');
}

function isIdCaptureReadRoute(pathname: string | null | undefined): boolean {
  const p = pathname ?? '';
  return p.includes('/kbs/capture-history') || /\/kbs\/capture\/[^/]+/.test(p);
}

export default function KbsLayout() {
  const { t } = useTranslation();
  const staff = useAuthStore((s) => s.staff);
  const pathname = usePathname();
  const guestMrzSubtree = pathname?.includes('/kbs/guests');
  const mrzOnlyAccess = canStaffUseMrzScan(staff);
  const idCaptureWriteRoute = isIdCaptureWriteRoute(pathname);
  const idCaptureReadRoute = isIdCaptureReadRoute(pathname);
  const idCaptureWriteAccess = canStaffUseIdCapture(staff);
  const idCaptureReadAccess = canStaffViewKbsCaptureHistory(staff);

  useEffect(() => {
    void refreshStaffKbsAccess();
  }, [staff?.id]);

  if (idCaptureWriteRoute && !idCaptureWriteAccess) {
    // Sessizce /staff'a atma — kullanıcıya net mesaj
    return <Redirect href={'/staff/(tabs)' as Href} />;
  }

  if (idCaptureReadRoute && !idCaptureReadAccess) {
    return <Redirect href="/staff" />;
  }

  const idCaptureRoute = idCaptureWriteRoute || idCaptureReadRoute;

  if (!idCaptureRoute && !isKbsUiEnabled() && !(guestMrzSubtree && mrzOnlyAccess)) {
    return <Redirect href="/staff" />;
  }

  const blocked = staff?.role !== 'admin' && staff?.kbs_access_enabled === false;
  if (blocked && !idCaptureRoute) {
    return <Redirect href="/staff" />;
  }

  return (
    <>
    <KbsCaptureWatermarkHost />
    <Stack screenOptions={buildStaffNestedStackOptions(t)}>
      <Stack.Screen
        name="index"
        options={{ title: t('kbsNavOperation'), headerLeft: () => <StaffStackBackButton fallback={STAFF_TABS_FALLBACK} /> }}
      />
      <Stack.Screen
        name="scan"
        options={{ title: t('kbsNavScanSerial'), headerShown: false, contentStyle: { backgroundColor: '#000' } }}
      />
      <Stack.Screen
        name="capture-id"
        options={{ title: 'Kimlik/Pasaport Çekim', headerShown: false, contentStyle: { backgroundColor: '#000' } }}
      />
      <Stack.Screen
        name="capture-nfc"
        options={{ title: 'Pasaport NFC', headerShown: false, contentStyle: { backgroundColor: '#0b1220' } }}
      />
      <Stack.Screen
        name="capture-history"
        options={{
          title: 'Çekilen Kimlikler',
          headerLeft: () => (
            <StaffStackBackButton fallback={'/staff/(tabs)' as Href} accessibilityLabel={t('back')} />
          ),
        }}
      />
      <Stack.Screen
        name="capture/[id]"
        options={{
          title: 'Kimlik bilgileri',
          headerLeft: () => (
            <StaffStackBackButton fallback={'/staff/kbs/capture-history' as Href} accessibilityLabel={t('back')} />
          ),
        }}
      />
      <Stack.Screen name="ready" options={{ title: t('kbsNavReady') }} />
      <Stack.Screen name="submitted" options={{ title: t('kbsNavSubmitted') }} />
      <Stack.Screen name="rooms" options={{ title: t('kbsNavRooms') }} />
      <Stack.Screen name="failed" options={{ title: t('kbsNavFailed') }} />
      <Stack.Screen name="batch" options={{ title: 'Parti / Beklet' }} />
      <Stack.Screen name="guests" options={{ headerShown: false }} />
      <Stack.Screen name="lodgers" options={{ headerShown: false }} />
    </Stack>
    </>
  );
}
