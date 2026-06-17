import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, AppState, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, Camera } from 'expo-camera';
import { useGuestFlowStore } from '@/stores/guestFlowStore';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { log } from '@/lib/logger';
import {
  relaunchAndroidModernBarcodeScanner,
  useAndroidModernBarcodeScanner,
} from '@/lib/androidModernBarcodeScan';
import {
  bootstrapGuestCheckinToken,
  readGuestCheckinTokenFromLocation,
} from '@/lib/guestCheckinFromToken';

type PermStatus = 'granted' | 'denied' | 'undetermined';

export default function GuestScanScreen() {
  const [permStatus, setPermStatus] = useState<PermStatus | null>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [webTokenBootstrapping, setWebTokenBootstrapping] = useState(() =>
    Platform.OS === 'web' ? Boolean(readGuestCheckinTokenFromLocation()) : false
  );
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const { setQR, reset } = useGuestFlowStore();
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    const urlToken =
      Platform.OS === 'web'
        ? readGuestCheckinTokenFromLocation() ?? (typeof params.token === 'string' ? params.token : null)
        : typeof params.token === 'string'
          ? params.token
          : null;

    if (!urlToken) {
      reset();
      return;
    }

    setWebTokenBootstrapping(true);
    void bootstrapGuestCheckinToken(urlToken, setQR).then((res) => {
      if (cancelled) return;
      setWebTokenBootstrapping(false);
      if (res.ok) {
        router.replace('/guest/language');
      } else {
        setError(t('invalidQR'));
        reset();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [params.token, reset, router, setQR, t]);

  const refreshPermission = useCallback(async () => {
    try {
      const p = await Camera.getCameraPermissionsAsync();
      setPermStatus(p.status as PermStatus);
      setCanAskAgain(p.canAskAgain ?? true);
    } catch {
      setPermStatus('undetermined');
      setCanAskAgain(true);
    }
  }, []);

  useEffect(() => {
    refreshPermission();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshPermission();
    });
    return () => sub.remove();
  }, [refreshPermission]);

  const handleRequestPermission = useCallback(async () => {
    setRequesting(true);
    try {
      const result = await Camera.requestCameraPermissionsAsync();
      setPermStatus(result.status as PermStatus);
      setCanAskAgain(result.canAskAgain ?? true);
    } catch {
      setPermStatus('undetermined');
    } finally {
      setRequesting(false);
    }
  }, []);

  const handleBarCodeScanned = async ({ data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);
    setError(null);
    log.info('GuestScan', 'QR taranıyor', { dataLength: data?.length });
    try {
      let token: string | null = null;
      if (data.startsWith('http')) {
        try {
          const u = new URL(data);
          token = u.searchParams.get('token') ?? u.pathname.split('/').filter(Boolean).pop() ?? null;
        } catch (urlErr) {
          log.warn('GuestScan', 'URL parse', urlErr);
          token = null;
        }
      } else {
        token = data.trim();
      }
      if (!token) {
        log.warn('GuestScan', 'token yok');
        setError(t('invalidQR'));
        setScanned(false);
        return;
      }
      const { data: qrRow, error: e } = await supabase
        .from('room_qr_codes')
        .select('room_id, rooms(room_number)')
        .eq('token', token)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (e) {
        log.error('GuestScan', 'room_qr_codes', e.message, e.code, e.details);
      }
      if (e || !qrRow) {
        setError(t('invalidQR'));
        setScanned(false);
        return;
      }

      const roomId = (qrRow as { room_id: string }).room_id;
      const roomNumber = (qrRow as { rooms: { room_number: string } | null })?.rooms?.room_number ?? '';
      log.info('GuestScan', 'QR geçerli', { roomId, roomNumber });
      setQR(token, roomId, roomNumber);
      router.replace('/guest/language');
    } catch (err) {
      log.error('GuestScan', 'handleBarCodeScanned catch', err);
      setError(t('invalidQR'));
      setScanned(false);
    }
  };

  const usesModernAndroidScanner = useAndroidModernBarcodeScanner(
    permStatus === 'granted',
    ['qr'],
    (result) => {
      void handleBarCodeScanned(result);
    }
  );

  if (webTokenBootstrapping) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color="#b8860b" />
        <Text style={styles.message}>{t('loading')}</Text>
      </View>
    );
  }

  if (permStatus === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color="#b8860b" />
        <Text style={styles.message}>{t('loading')}</Text>
      </View>
    );
  }

  if (permStatus !== 'granted') {
    return (
      <View style={styles.centered}>
        <View style={styles.permCard}>
          <View style={styles.permCardHeader}>
            <View style={styles.permCardIconWrap}>
              <Text style={styles.permCardIcon}>📷</Text>
            </View>
            <View style={styles.permCardTitleWrap}>
              <Text style={styles.permCardTitle}>{t('scanQR')}</Text>
              <Text style={styles.permCardSubtitle}>
                {t('scanQRDesc')}{!canAskAgain ? ` ${t('guestCameraPermPermanentDenied')}` : ''}
              </Text>
            </View>
            <View style={[styles.permCardBadge, permStatus === 'denied' && styles.permCardBadgeDenied]}>
              <Text style={[styles.permCardBadgeText, permStatus === 'denied' && styles.permCardBadgeTextDenied]}>
                {permStatus === 'denied' ? t('guestPermStatusDenied') : t('guestPermStatusUndetermined')}
              </Text>
            </View>
          </View>
          <View style={styles.permCardNotes}>
            <Text style={styles.permCardNote}>{t('guestCameraPermNoteContinue')}</Text>
            <Text style={styles.permCardNote}>{t('guestCameraPermNoteSettings')}</Text>
          </View>
          <TouchableOpacity
            style={[styles.permCardPrimaryBtn, requesting && { opacity: 0.75 }]}
            onPress={canAskAgain ? handleRequestPermission : () => Linking.openSettings()}
            disabled={requesting}
            activeOpacity={0.85}
          >
            {requesting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.permCardPrimaryIcon}>{canAskAgain ? '✓' : '⚙'}</Text>
                <Text style={styles.permCardPrimaryText}>{canAskAgain ? t('guestContinue') : t('guestOpenSettings')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {usesModernAndroidScanner ? (
        <View style={styles.modernScannerFallback}>
          <Text style={styles.hint}>{t('scanQRDesc')}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => relaunchAndroidModernBarcodeScanner(['qr'])}
          >
            <Text style={styles.retryBtnText}>QR tarayıcıyı aç</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onCameraReady={() => setCameraReady(true)}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={!cameraReady || scanned ? undefined : handleBarCodeScanned}
        />
      )}
      <View style={styles.overlay}>
        <View style={styles.frame} />
        <Text style={styles.hint}>QR kodu çerçeve içine getirin</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {scanned ? (
          <TouchableOpacity style={styles.retryBtn} onPress={() => setScanned(false)}>
            <Text style={styles.retryBtnText}>Tekrar Dene</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a365d',
    padding: 24,
  },
  message: { color: '#fff', marginTop: 12 },
  permCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    padding: 16,
    width: '100%',
    maxWidth: 360,
  },
  permCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  permCardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(237,137,54,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permCardIcon: { fontSize: 22 },
  permCardTitleWrap: { flex: 1, minWidth: 0 },
  permCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  permCardSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 18,
  },
  permCardBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  permCardBadgeDenied: { backgroundColor: 'rgba(239,68,68,0.3)' },
  permCardBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  permCardBadgeTextDenied: { color: '#fca5a5' },
  permCardNotes: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  permCardNote: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 18,
  },
  permCardPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#ed8936',
    borderRadius: 14,
    paddingVertical: 14,
  },
  permCardPrimaryIcon: { fontSize: 18, color: '#fff', fontWeight: '700' },
  permCardPrimaryText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  button: {
    backgroundColor: '#ed8936',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  settingsBtn: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  settingsBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 2,
    borderColor: 'rgba(237,137,54,0.9)',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  hint: {
    color: '#fff',
    marginTop: 24,
    fontSize: 16,
  },
  errorText: {
    color: '#fc8181',
    marginTop: 12,
    paddingHorizontal: 24,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
  },
  retryBtnText: { color: '#fff', fontWeight: '600' },
  modernScannerFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#1a365d',
  },
});
