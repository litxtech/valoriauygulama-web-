import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Alert, TextInput, ActivityIndicator, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { FramedQR, type QRCodeRef, type QRFrameStyle, QR_FRAME_LABELS } from '@/components/DesignableQR';
import { readNfcTagForDoor, isNfcAvailable, startAutoNfcDoorListener } from '@/lib/nfcDoor';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarcodeScannerView } from '@/components/BarcodeScannerView';
import { useFocusEffect } from 'expo-router';
import { theme } from '@/constants/theme';
import { useTranslation } from 'react-i18next';

export default function DigitalKeyScreen() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [roomNumber, setRoomNumber] = useState<string>('—');
  const [checkIn, setCheckIn] = useState<string>('—');
  const [checkOut, setCheckOut] = useState<string>('—');
  const [roomToken, setRoomToken] = useState<string | null>(null);
  const [showScan, setShowScan] = useState(false);
  const [doorRoomInput, setDoorRoomInput] = useState('');
  const [openDoorLoading, setOpenDoorLoading] = useState(false);
  const [checkinQrRef, setCheckinQrRef] = useState<QRCodeRef>(null);
  const [contractQrRef, setContractQrRef] = useState<QRCodeRef>(null);
  const [qrDownloading, setQrDownloading] = useState<'checkin' | 'contract' | null>(null);
  const [qrDrawerVisible, setQrDrawerVisible] = useState(false);
  const [selectedQrType, setSelectedQrType] = useState<'checkin' | 'contract'>('checkin');
  const [selectedFrame, setSelectedFrame] = useState<QRFrameStyle>('modern');
  const [nfcAvailable, setNfcAvailable] = useState(false);
  const [nfcLoading, setNfcLoading] = useState(false);
  const [nfcListening, setNfcListening] = useState(false);
  const insets = useSafeAreaInsets();
  const openDoorWithRoomRef = useRef<(roomNum: string) => Promise<void>>(() => Promise.resolve());

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'web' || !isValid || !nfcAvailable || openDoorLoading) return;
      setNfcListening(true);
      const listener = startAutoNfcDoorListener((result) => {
        setNfcListening(false);
        if (!result?.room) return;
        openDoorWithRoomRef.current(result.room);
      });
      return () => {
        listener.stop();
        setNfcListening(false);
      };
    }, [isValid, nfcAvailable, openDoorLoading])
  );

  useEffect(() => {
    if (Platform.OS !== 'web') {
      isNfcAvailable().then(setNfcAvailable);
    }
  }, []);

  const FRAME_OPTIONS: QRFrameStyle[] = ['minimal', 'bordered', 'modern', 'elegant'];
  const checkinDesign = { useLogo: true, backgroundColor: '#ffffff', foregroundColor: '#111827', shape: 'rounded' as const, logoSizeRatio: 0.22 };
  const contractDesign = { useLogo: true, backgroundColor: '#ffffff', foregroundColor: '#1a365d', shape: 'dots' as const, logoSizeRatio: 0.22 };

  const guestName = useMemo(() => {
    const n = user?.user_metadata?.full_name ?? user?.user_metadata?.name;
    if (n && typeof n === 'string' && n.trim()) return n.trim();
    const email = user?.email ?? '';
    const part = email.split('@')[0];
    return part ? part.charAt(0).toUpperCase() + part.slice(1) : t('guestDefaultName');
  }, [user?.email, user?.user_metadata?.full_name, user?.user_metadata?.name]);

  useEffect(() => {
    (async () => {
      if (!user?.id) return;
      let guest: { room_id: string; check_in_at: string | null; check_out_at: string | null } | null = null;
      if (user.email) {
        const { data } = await supabase
          .from('guests')
          .select('room_id, check_in_at, check_out_at')
          .eq('email', user.email)
          .eq('status', 'checked_in')
          .order('check_in_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        guest = data as typeof guest;
      }
      if (!guest) {
        const { data } = await supabase
          .from('guests')
          .select('room_id, check_in_at, check_out_at')
          .eq('auth_user_id', user.id)
          .eq('status', 'checked_in')
          .order('check_in_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        guest = data as typeof guest;
      }
      if (!guest?.room_id) return;

      const { data: room } = await supabase.from('rooms').select('room_number').eq('id', guest.room_id).maybeSingle();
      if (room?.room_number) setRoomNumber(String(room.room_number));
      if (guest.check_in_at) setCheckIn(new Date(guest.check_in_at).toLocaleDateString());
      if (guest.check_out_at) setCheckOut(new Date(guest.check_out_at).toLocaleDateString());

      const { data: qr } = await supabase
        .from('room_qr_codes')
        .select('token')
        .eq('room_id', guest.room_id)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setRoomToken(qr?.token ?? null);
    })();
  }, [user?.id, user?.email]);

  const urls = useMemo(() => {
    if (!roomToken) return { checkinUrl: null, contractUrl: null };
    const defaultAppBase = 'https://valoriahotel-el4r.vercel.app';
    const appBase = (process.env.EXPO_PUBLIC_APP_URL ?? defaultAppBase).replace(/\/$/, '');
    const checkinUrl = `${appBase}/guest?token=${encodeURIComponent(roomToken)}`;
    const defaultContractBase = 'https://valoriahotel-el4r.vercel.app/guest/sign-one';
    let contractBase =
      process.env.EXPO_PUBLIC_PUBLIC_CONTRACT_URL ??
      (process.env.EXPO_PUBLIC_SUPABASE_URL ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/public-contract` : null) ??
      defaultContractBase;
    if (contractBase.includes('valoria.app')) contractBase = defaultContractBase;
    const base = String(contractBase).replace(/\?.*$/, '').replace(/\/$/, '');
    return { checkinUrl, contractUrl: `${base}?t=${encodeURIComponent(roomToken)}&l=tr` };
  }, [roomToken]);

  const isValid = !!roomToken;

  const downloadQrAsImage = useCallback(async (ref: QRCodeRef, label: string) => {
    if (!ref?.toDataURL) {
      if (Platform.OS === 'web') Alert.alert(t('info'), t('qrDownloadWebRightClick'));
      return;
    }
    ref.toDataURL(async (data: string) => {
      try {
        const base64 = data.startsWith('data:') ? data.replace(/^data:image\/\w+;base64,/, '') : data;
        const filename = `valoria-qr-${label}-${Date.now()}.png`;
        const path = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) await Sharing.shareAsync(path, { mimeType: 'image/png', dialogTitle: t('qrShareDialogTitle', { label }) });
        else Alert.alert(t('saved'), path);
      } catch (e) {
        Alert.alert(t('error'), (e as Error)?.message ?? t('qrDownloadFailed'));
      }
      setQrDownloading(null);
    });
  }, []);

  const startDownloadQr = (which: 'checkin' | 'contract') => {
    const ref = which === 'checkin' ? checkinQrRef : contractQrRef;
    if (!ref?.toDataURL) {
      if (Platform.OS === 'web') Alert.alert(t('info'), t('qrDownloadWebRightClickImage'));
      return;
    }
    setQrDownloading(which);
    downloadQrAsImage(ref, which === 'checkin' ? 'checkin' : 'sozlesme');
  };

  const openDoorByNfc = async () => {
    setNfcLoading(true);
    try {
      const result = await readNfcTagForDoor();
      if (!result) {
        Alert.alert(t('cancelled'), t('nfcTagReadCancelled'));
        return;
      }
      if (!result.room) {
        Alert.alert(t('invalidTagTitle'), t('invalidTagNoRoomInfo', { raw: result.raw || '(empty)' }));
        return;
      }
      await openDoorWithRoom(result.room);
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('nfcReadFailed'));
    } finally {
      setNfcLoading(false);
    }
  };

  const openDoorWithRoom = useCallback(async (roomNum: string) => {
    setOpenDoorLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('open-door', {
        body: { room_number: roomNum },
      });
      if (error) throw error;
      const result = data?.result ?? data?.success ? 'granted' : 'denied';
      const message = (data?.message as string) || (result === 'granted' ? t('doorOpened') : t('noPermission'));
      if (result === 'granted') {
        Alert.alert(t('success'), message);
      } else {
        Alert.alert(t('couldNotOpen'), message);
      }
    } catch (e: unknown) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('doorOpenRequestFailed'));
    } finally {
      setOpenDoorLoading(false);
    }
  }, []);

  openDoorWithRoomRef.current = openDoorWithRoom;

  const openDoor = async () => {
    const num = doorRoomInput.trim() || (roomNumber !== '—' ? roomNumber : '');
    if (!num) {
      Alert.alert(t('enterRoomNumberTitle'), t('enterRoomNumberMessage'));
      return;
    }
    await openDoorWithRoom(num);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.hotelName}>Valoria Hotel</Text>
      <Text style={styles.welcome}>{t('welcomeWithName', { name: guestName })}</Text>
      <View style={styles.infoBox}>
        <Text style={styles.infoLine}>{t('roomLabel', { room: roomNumber })}</Text>
        <Text style={styles.infoLine}>{t('checkinLabel', { date: checkIn })}</Text>
        <Text style={styles.infoLine}>{t('checkoutLabel', { date: checkOut })}</Text>
      </View>

      <View style={[styles.card, !isValid && styles.cardDisabled]}>
        <Text style={styles.cardTitle}>{t('digitalKey')}</Text>
        <Text style={styles.note}>
          {t('digitalKeyHint')}
        </Text>
        {!isValid && (
          <Text style={styles.invalidHint}>
            {t('digitalKeyInactiveHint')}
          </Text>
        )}
      </View>

      {isValid && (
        <View style={styles.openDoorCard}>
          <Text style={styles.sectionTitle}>{t('openDoorTitle')}</Text>
          <Text style={styles.openDoorHint}>{t('openDoorHint')}</Text>
          <TextInput
            style={styles.doorInput}
            value={doorRoomInput}
            onChangeText={setDoorRoomInput}
            placeholder={roomNumber !== '—' ? roomNumber : '101'}
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
            maxLength={10}
          />
          <TouchableOpacity
            style={[styles.openDoorBtn, openDoorLoading && styles.openDoorBtnDisabled]}
            onPress={openDoor}
            disabled={openDoorLoading}
          >
            {openDoorLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.openDoorBtnText}>{t('openDoorBtn')}</Text>
            )}
          </TouchableOpacity>
          {!nfcAvailable && Platform.OS !== 'web' && (
            <Text style={styles.nfcUnavailableHint}>
              {t('nfcUnavailableHint')}
            </Text>
          )}
          {nfcAvailable && (
            <>
              {nfcListening && (
                <Text style={styles.nfcListeningHint}>{t('nfcListeningHint')}</Text>
              )}
              <TouchableOpacity
                style={[styles.nfcBtn, (nfcLoading || openDoorLoading) && styles.openDoorBtnDisabled]}
                onPress={openDoorByNfc}
                disabled={nfcLoading || openDoorLoading}
              >
                {nfcLoading ? (
                  <ActivityIndicator color="#1a365d" size="small" />
                ) : (
                  <Text style={styles.nfcBtnText}>{t('openDoorWithNfcManualBtn')}</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {isValid && urls.checkinUrl && (
        <View style={styles.qrSection}>
          <Text style={styles.sectionTitle}>{t('qrCodesTitle')}</Text>
          <TouchableOpacity style={styles.qrDrawerBtn} onPress={() => setQrDrawerVisible(true)}>
            <Text style={styles.qrDrawerBtnText}>
              {selectedQrType === 'checkin' ? t('digitalKeyCheckinType') : t('digitalKeyContractType')} • {QR_FRAME_LABELS[selectedFrame]}
            </Text>
            <Text style={styles.qrDrawerBtnHint}>{t('digitalKeyQrDrawerHint')}</Text>
          </TouchableOpacity>
          <View style={styles.qrCard}>
            {selectedQrType === 'checkin' ? (
              <>
                <Text style={styles.qrTitle}>{t('digitalKeyQrCheckinTitle')}</Text>
                <FramedQR value={urls.checkinUrl} size={190} design={checkinDesign} frame={selectedFrame} getRef={setCheckinQrRef} />
              </>
            ) : urls.contractUrl ? (
              <>
                <Text style={styles.qrTitle}>Otel kuralları / sözleşme onayı</Text>
                <FramedQR value={urls.contractUrl} size={190} design={contractDesign} frame={selectedFrame} getRef={setContractQrRef} />
                <Text style={styles.qrSub}>{t('digitalKeyQrContractWebNote')}</Text>
              </>
            ) : null}
            <TouchableOpacity
              style={[styles.qrDownloadBtn, qrDownloading !== null && styles.qrDownloadBtnDisabled]}
              onPress={() => startDownloadQr(selectedQrType)}
              disabled={qrDownloading !== null}
            >
              <Text style={styles.qrDownloadBtnText}>QR İndir</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.scanBtn} onPress={() => setShowScan(true)} activeOpacity={0.85}>
            <Text style={styles.scanBtnText}>{t('digitalKeyScanQr')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={qrDrawerVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.drawerOverlay} activeOpacity={1} onPress={() => setQrDrawerVisible(false)}>
          <View style={[styles.drawer, { paddingBottom: insets.bottom + 24 }]} onStartShouldSetResponder={() => true}>
            <Text style={styles.drawerTitle}>{t('digitalKeyQrSelectTitle')}</Text>
            <Text style={styles.drawerLabel}>{t('digitalKeyTypeLabel')}</Text>
            <View style={styles.drawerRow}>
              <TouchableOpacity style={[styles.drawerChip, selectedQrType === 'checkin' && styles.drawerChipActive]} onPress={() => setSelectedQrType('checkin')}>
                <Text style={[styles.drawerChipText, selectedQrType === 'checkin' && styles.drawerChipTextActive]}>Check-in QR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.drawerChip, selectedQrType === 'contract' && styles.drawerChipActive]} onPress={() => setSelectedQrType('contract')}>
                <Text style={[styles.drawerChipText, selectedQrType === 'contract' && styles.drawerChipTextActive]}>
                  {t('digitalKeyContractType')}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.drawerLabel}>{t('digitalKeyFrameLabel')}</Text>
            <View style={styles.drawerRow}>
              {FRAME_OPTIONS.map((f) => (
                <TouchableOpacity key={f} style={[styles.drawerChipSmall, selectedFrame === f && styles.drawerChipActive]} onPress={() => setSelectedFrame(f)}>
                  <Text style={[styles.drawerChipText, selectedFrame === f && styles.drawerChipTextActive]}>{QR_FRAME_LABELS[f]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.drawerDoneBtn} onPress={() => setQrDrawerVisible(false)}>
              <Text style={styles.drawerDoneText}>Tamam</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Text style={styles.sectionTitle}>{t('digitalKeyDoorsTitle')}</Text>
      <Text style={styles.doorsList}>{t('digitalKeyDoorsBody')}</Text>

      <View style={styles.shareRow}>
        <TouchableOpacity style={styles.shareBtn}>
          <Text style={styles.shareBtnText}>{t('digitalKeyShareKey')}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showScan} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setShowScan(false)}>
        <BarcodeScannerView
          title={t('customerQrScanTitle')}
          hint={t('customerQrScanHint')}
          onClose={() => setShowScan(false)}
          onScan={({ data }) => {
            const s = String(data || '').trim();
            if (!s) return;
            setShowScan(false);
            if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('valoria://') || s.startsWith('exp+')) {
              Linking.openURL(s).catch(() => Alert.alert(t('error'), t('linkCouldNotOpen')));
            } else {
              Alert.alert(t('scanned'), s);
            }
          }}
        />
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 24, paddingBottom: 48 },
  hotelName: { fontSize: 20, fontWeight: '700', color: '#1a202c', marginBottom: 4 },
  welcome: { fontSize: 16, color: '#4a5568', marginBottom: 16 },
  infoBox: { backgroundColor: '#edf2f7', padding: 16, borderRadius: 12, marginBottom: 24 },
  infoLine: { fontSize: 14, color: '#2d3748', marginBottom: 4 },
  card: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 24,
  },
  cardDisabled: { opacity: 0.8 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#1a202c', marginBottom: 16, textAlign: 'center' },
  note: { fontSize: 14, color: '#718096', textAlign: 'center', marginBottom: 12 },
  cardHint: { fontSize: 15, color: '#4a5568', textAlign: 'center', marginVertical: 4 },
  or: { fontSize: 14, color: '#a0aec0', textAlign: 'center', marginVertical: 8 },
  invalidHint: { fontSize: 13, color: '#e53e3e', textAlign: 'center', marginTop: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#2d3748', marginBottom: 8 },
  doorsList: { fontSize: 14, color: '#718096', marginBottom: 24 },
  shareRow: { flexDirection: 'row', justifyContent: 'center' },
  shareBtn: { backgroundColor: '#b8860b', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  shareBtnText: { color: '#fff', fontWeight: '600' },
  qrSection: { marginBottom: 26 },
  qrDrawerBtn: { padding: 16, backgroundColor: '#edf2f7', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 12 },
  qrDrawerBtnText: { fontSize: 16, fontWeight: '700', color: '#1a365d' },
  qrDrawerBtnHint: { fontSize: 12, color: '#718096', marginTop: 4 },
  drawerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  drawer: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  drawerTitle: { fontSize: 18, fontWeight: '700', color: '#1a202c', marginBottom: 20 },
  drawerLabel: { fontSize: 13, fontWeight: '600', color: '#4a5568', marginBottom: 8, marginTop: 12 },
  drawerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  drawerChip: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12, backgroundColor: '#e2e8f0' },
  drawerChipSmall: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#e2e8f0' },
  drawerChipActive: { backgroundColor: '#1a365d' },
  drawerChipText: { fontSize: 14, color: '#2d3748', fontWeight: '600' },
  drawerChipTextActive: { color: '#fff' },
  drawerDoneBtn: { marginTop: 24, padding: 16, backgroundColor: '#1a365d', borderRadius: 12, alignItems: 'center' },
  drawerDoneText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  qrCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    marginBottom: 12,
  },
  qrTitle: { fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 12, textAlign: 'center' },
  qrSub: { marginTop: 10, fontSize: 12, color: '#6b7280', textAlign: 'center', lineHeight: 18 },
  qrDownloadBtn: { marginTop: 10, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#2d3748', borderRadius: 10, alignSelf: 'center' },
  qrDownloadBtnDisabled: { opacity: 0.7 },
  qrDownloadBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  scanBtn: { backgroundColor: '#1a365d', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  scanBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  openDoorCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  openDoorHint: { fontSize: 13, color: '#718096', marginBottom: 10 },
  doorInput: {
    backgroundColor: '#f7fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    fontSize: 18,
    color: '#1a202c',
    marginBottom: 14,
  },
  openDoorBtn: { backgroundColor: '#059669', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  openDoorBtnDisabled: { opacity: 0.7 },
  openDoorBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  nfcListeningHint: { marginTop: 8, fontSize: 13, color: theme.colors.primary, textAlign: 'center' },
  nfcUnavailableHint: { marginTop: 10, fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 18 },
  nfcBtn: { marginTop: 10, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 2, borderColor: '#1a365d', backgroundColor: 'transparent' },
  nfcBtnText: { color: '#1a365d', fontWeight: '700', fontSize: 15 },
});
