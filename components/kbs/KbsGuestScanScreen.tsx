import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, View, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect, useNavigation, usePathname, type Href } from 'expo-router';
import { navigateStaffBack, STAFF_TABS_FALLBACK } from '@/lib/staffStackBack';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GuestIdentityScanner } from '@/components/kbs/GuestIdentityScanner';
import { useAuthStore } from '@/stores/authStore';
import { canStaffUseMrzScan } from '@/lib/kbsMrzAccess';
import { useGuestScanSessionStore } from '@/stores/guestScanSessionStore';
import { mapLockPayloadToGuestItem } from '@/lib/guestScan/mapParsedToItem';
import { fingerprintFromMrzQueued } from '@/stores/kbsMrzBatchStore';
import type { GuestScanLockPayload } from '@/lib/guestScan/types';
import { preloadMrzVisionScanner } from '@/lib/scanner/mrzVisionScannerLoader';
import { preloadOpsAppUserForSession } from '@/lib/resolveOpsHotelId';

const SOUND_KEY = 'kbs_mrz_scan_sound_enabled';

type Props = {
  /** Yetkisiz kullanıcıda geri dönülecek rota (KBS layout kapalıyken /staff/mrz-scan için /staff). */
  deniedFallback?: string;
};

/**
 * Tam ekran MRZ tarayıcı — KBS stack’inden bağımsız `/staff/mrz-scan` veya hub üzerinden kullanılır.
 */
export function KbsGuestScanScreen({ deniedFallback = '/staff' }: Props) {
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const staff = useAuthStore((s) => s.staff);
  const session = useGuestScanSessionStore((s) => s.session);
  const sessionLoading = useGuestScanSessionStore((s) => s.loading);
  const startSession = useGuestScanSessionStore((s) => s.startSession);
  const hasDuplicate = useGuestScanSessionStore((s) => s.hasDuplicate);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [scanEnabled, setScanEnabled] = useState(true);
  const [scanResetToken, setScanResetToken] = useState(0);
  const sessionBootstrapped = useRef(false);

  const isGroup = mode === 'group' || mode === 'family' || (session?.sessionType !== 'single');

  const goBack = useCallback(() => {
    navigateStaffBack(router, navigation, pathname, (deniedFallback as Href) ?? STAFF_TABS_FALLBACK);
  }, [router, navigation, pathname, deniedFallback]);

  useEffect(() => {
    if (staff == null) return;
    if (!canStaffUseMrzScan(staff)) {
      Alert.alert(t('kbsNavScanSerial'), t('staffPassportsNoAccess'));
      router.replace(deniedFallback as never);
    }
  }, [staff, router, t, deniedFallback]);

  useEffect(() => {
    if (sessionBootstrapped.current || session || sessionLoading) return;
    sessionBootstrapped.current = true;
    const type = mode === 'group' || mode === 'family' ? 'group' : 'single';
    void startSession(type);
  }, [session, sessionLoading, mode, startSession]);

  useEffect(() => {
    void AsyncStorage.getItem(SOUND_KEY).then((v) => {
      if (v === '0') setSoundEnabled(false);
    });
    void preloadMrzVisionScanner();
    preloadOpsAppUserForSession();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setScanEnabled(true);
      setScanResetToken((n) => n + 1);
    }, [])
  );

  const onLocked = useCallback(
    (payload: GuestScanLockPayload) => {
      if (!session) return;
      const fp = fingerprintFromMrzQueued({
        mrzLine: payload.mrz ?? `${payload.parsed.documentNumber ?? ''}`,
        documentNumber: payload.parsed.documentNumber,
        birthDate: payload.parsed.birthDate,
        nationalityCode: payload.parsed.nationalityCode,
        firstName: payload.parsed.firstName,
        lastName: payload.parsed.lastName,
      });
      if (hasDuplicate(fp)) {
        Alert.alert(t('kbsGuestDuplicateTitle'), t('kbsGuestDuplicateBody'));
        setScanResetToken((n) => n + 1);
        return;
      }
      setScanEnabled(false);
      const item = mapLockPayloadToGuestItem({
        sessionId: session.id,
        payload,
        documentSerialNo: payload.parsed.documentSeries ?? null,
        fatherName: payload.parsed.fatherName ?? null,
        motherName: payload.parsed.motherName ?? null,
      });
      useGuestScanSessionStore.getState().setPendingConfirmItem(item);
      router.push({
        pathname: '/staff/kbs/guests/confirm',
        params: { itemId: item.id, mode: isGroup ? 'group' : 'single' },
      } as never);
    },
    [session, hasDuplicate, router, t, isGroup]
  );

  if (!staff || !canStaffUseMrzScan(staff)) {
    return <View style={styles.blocked} />;
  }

  return (
    <GuestIdentityScanner
      enabled={scanEnabled}
      keepCameraWarm
      scanResetToken={scanResetToken}
      soundEnabled={soundEnabled}
      groupCount={session?.items.length ?? 0}
      onLocked={onLocked}
      onBack={goBack}
      onGalleryError={(msg) => Alert.alert(t('kbsGuestGalleryTitle'), msg)}
    />
  );
}

const styles = StyleSheet.create({
  blocked: { flex: 1, backgroundColor: '#000' },
});
