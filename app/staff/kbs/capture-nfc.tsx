import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useIsFocused, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { useNavigation, usePathname, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { theme } from '@/constants/theme';
import { ensureKbsOpsRoom, type KbsOpsRoom } from '@/lib/kbsStaffOpsEdge';
import { notifyKbsDocumentCaptured } from '@/lib/kbsCaptureNotify';
import { fetchKbsCapturedDocuments } from '@/lib/kbsCaptureHistory';
import { setKbsCaptureHistoryCache } from '@/lib/kbsCaptureHistoryCache';
import { markKbsCapturesJustSaved } from '@/lib/kbsCaptureHistorySeen';
import { useAuthStore } from '@/stores/authStore';
import { navigateStaffBack, STAFF_TABS_FALLBACK } from '@/lib/staffStackBack';
import { KbsZoomImageModal } from '@/components/kbs/KbsZoomImageModal';
import { useTranslation } from 'react-i18next';
import { warmKbsCaptureOpsContext } from '@/lib/kbsCapturePrewarm';
import {
  bacKeyFromMrzLock,
  isNfcPassportAvailable,
  isNfcPassportNativeReady,
  readPassportViaNfc,
} from '@/lib/nfcPassport';
import { saveKbsNfcCaptureItemsParallel } from '@/lib/kbsNfcCaptureSave';
import { NfcNativeBuildRequired } from '@/components/kbs/NfcNativeBuildRequired';
import { NfcParsedFieldsPanel } from '@/components/kbs/NfcParsedFieldsPanel';
import { NfcFamilyMemberCard } from '@/components/kbs/NfcFamilyMemberCard';
import { NfcBatchScanOverlay } from '@/components/kbs/NfcBatchScanOverlay';
import { MrzNativeBuildRequired } from '@/components/mrz/MrzNativeBuildRequired';
import type { MrzLockedPayload, MrzVisionUiState } from '@/components/mrz/mrzVisionTypes';
import { isMrzVisionScannerAvailable } from '@/lib/scanner/mrzVisionAvailability';
import {
  getMrzVisionScannerCached,
  preloadMrzVisionScanner,
  type MrzVisionScannerComponent,
} from '@/lib/scanner/mrzVisionScannerLoader';
import type { ParsedDocument } from '@/lib/scanner/types';
import { playKbsScanSound } from '@/lib/kbsScanSounds';
import { triggerMrzSuccessHaptic } from '@/lib/mrzScanHaptics';
import { fingerprintFromMrzQueued } from '@/stores/kbsMrzBatchStore';

type NfcQueueItem = {
  id: string;
  parsed: ParsedDocument;
  rawMrz: string | null;
  portraitUri: string;
};

type FlowPhase = 'scan' | 'review';
type ScanStep = 'mrz' | 'nfc';

const CAPTURE_HISTORY = '/staff/kbs/capture-history' as Href;
const IS_ANDROID = Platform.OS === 'android';
const MRZ_LOCK_DEBOUNCE_MS = 650;
const VISION_OK = isMrzVisionScannerAvailable();

const ROOM_MODAL_ANDROID_PROPS = IS_ANDROID
  ? ({ statusBarTranslucent: true, navigationBarTranslucent: true } as const)
  : {};

function newQueueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function queueFingerprint(item: NfcQueueItem) {
  return fingerprintFromMrzQueued({
    mrzLine: item.rawMrz ?? item.parsed.documentNumber ?? '',
    documentNumber: item.parsed.documentNumber,
    birthDate: item.parsed.birthDate,
    nationalityCode: item.parsed.nationalityCode,
    firstName: item.parsed.firstName,
    lastName: item.parsed.lastName,
  });
}

function isDuplicateInQueue(queue: NfcQueueItem[], fp: ReturnType<typeof fingerprintFromMrzQueued>): boolean {
  return queue.some((item) => {
    const existing = queueFingerprint(item);
    if (fp.mrzHash && existing.mrzHash === fp.mrzHash) return true;
    return (
      !!fp.documentNumber &&
      !!fp.birthDate &&
      fp.documentNumber === existing.documentNumber &&
      fp.birthDate === existing.birthDate &&
      (fp.lastName === existing.lastName || !fp.lastName || !existing.lastName)
    );
  });
}

function displayName(parsed: ParsedDocument) {
  return [parsed.firstName, parsed.lastName].filter(Boolean).join(' ').trim();
}

export default function KbsCaptureNfcScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const staff = useAuthStore((s) => s.staff);
  const user = useAuthStore((s) => s.user);

  const [phase, setPhase] = useState<FlowPhase>('scan');
  const [nfcAvailable, setNfcAvailable] = useState<boolean | null>(null);
  const [nativeReady] = useState(() => isNfcPassportNativeReady());
  const [reading, setReading] = useState(false);
  const [scanStep, setScanStep] = useState<ScanStep>('mrz');
  const [queue, setQueue] = useState<NfcQueueItem[]>([]);
  const [roomNoInput, setRoomNoInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [androidKeyboardInset, setAndroidKeyboardInset] = useState(0);
  const [scanResetToken, setScanResetToken] = useState(0);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [lastAddedName, setLastAddedName] = useState<string | null>(null);
  const [ui, setUi] = useState<MrzVisionUiState>({
    frameKind: 'hunting',
    hint: t('kbsMrzLiveCameraWarming'),
    showSpinner: false,
    successGlow: false,
  });
  const [VisionScanner, setVisionScanner] = useState<MrzVisionScannerComponent | null>(() =>
    getMrzVisionScannerCached()
  );

  const savingRef = useRef(false);
  const readLockRef = useRef(false);
  const mrzLockUntilRef = useRef(0);
  const roomInputRef = useRef<TextInput | null>(null);
  const roomPrefetchRef = useRef<{ key: string; room: KbsOpsRoom } | null>(null);
  const roomPrefetchGenRef = useRef(0);

  const roomNoTrimmed = roomNoInput.trim();
  const phoneTrimmed = phoneInput.trim();
  const cameraScanEnabled = VISION_OK && phase === 'scan' && isFocused && !reading && nativeReady;

  useEffect(() => {
    if (!nativeReady) {
      setNfcAvailable(false);
      return;
    }
    void isNfcPassportAvailable().then(setNfcAvailable);
  }, [nativeReady]);

  useEffect(() => {
    if (!user?.id) return;
    warmKbsCaptureOpsContext(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (!VISION_OK || VisionScanner) return;
    let cancelled = false;
    void preloadMrzVisionScanner().then((Comp) => {
      if (!cancelled && Comp) setVisionScanner(() => Comp);
    });
    return () => {
      cancelled = true;
    };
  }, [VisionScanner]);

  useEffect(() => {
    if (!IS_ANDROID || phase !== 'review') {
      setAndroidKeyboardInset(0);
      return;
    }
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setAndroidKeyboardInset(Math.max(0, e.endCoordinates?.height ?? 0));
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setAndroidKeyboardInset(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [phase]);

  const prefetchHistory = useCallback(() => {
    if (!user?.id) return;
    void fetchKbsCapturedDocuments(300, user.id)
      .then((data) => setKbsCaptureHistoryCache(data))
      .catch(() => {});
  }, [user?.id]);

  const goBack = useCallback(() => {
    if (phase === 'review' && queue.length > 0) {
      setPhase('scan');
      return;
    }
    navigateStaffBack(router, navigation as NavigationProp<ParamListBase>, pathname, STAFF_TABS_FALLBACK);
  }, [navigation, pathname, phase, queue.length, router]);

  const openHistory = useCallback(() => {
    router.push(CAPTURE_HISTORY as never);
    prefetchHistory();
  }, [prefetchHistory, router]);

  const onRoomNoChange = useCallback((text: string) => {
    const next = text.replace(/[^\dA-Za-z\-/]/g, '').slice(0, 24);
    setRoomNoInput(next);
    if (roomPrefetchRef.current?.key !== next.trim()) {
      roomPrefetchRef.current = null;
    }
  }, []);

  const onPhoneChange = useCallback((text: string) => {
    setPhoneInput(text.replace(/[^\d+()\s-]/g, '').slice(0, 24));
  }, []);

  const resolveRoom = useCallback(
    async (roomNumber: string): Promise<KbsOpsRoom> => {
      const trimmed = roomNumber.trim();
      if (!trimmed) throw new Error(t('kbsRoomRequired'));
      const created = await ensureKbsOpsRoom(trimmed);
      if (!created.ok) throw new Error(created.error.message);
      return { ...created.data, room_number: trimmed };
    },
    [t]
  );

  useEffect(() => {
    if (phase !== 'review' || roomNoTrimmed.length < 1) {
      roomPrefetchRef.current = null;
      return;
    }
    const gen = ++roomPrefetchGenRef.current;
    const timer = setTimeout(() => {
      void resolveRoom(roomNoTrimmed)
        .then((room) => {
          if (roomPrefetchGenRef.current !== gen) return;
          roomPrefetchRef.current = { key: roomNoTrimmed, room };
        })
        .catch(() => {
          if (roomPrefetchGenRef.current === gen) roomPrefetchRef.current = null;
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [phase, roomNoTrimmed, resolveRoom]);

  const removeFromQueue = useCallback((itemId: string) => {
    setQueue((q) => q.filter((item) => item.id !== itemId));
  }, []);

  const bumpScanCycle = useCallback(() => {
    setScanResetToken((v) => v + 1);
    setScanStep('mrz');
  }, []);

  const enqueueCapture = useCallback(
    (data: { parsed: ParsedDocument; rawMrz: string | null; portraitUri: string }) => {
      const fp = fingerprintFromMrzQueued({
        mrzLine: data.rawMrz ?? data.parsed.documentNumber ?? '',
        documentNumber: data.parsed.documentNumber,
        birthDate: data.parsed.birthDate,
        nationalityCode: data.parsed.nationalityCode,
        firstName: data.parsed.firstName,
        lastName: data.parsed.lastName,
      });

      setQueue((q) => {
        if (isDuplicateInQueue(q, fp)) {
          Alert.alert(t('kbsGuestDuplicateTitle'), t('kbsNfcDuplicateStillAdded'));
        }
        return [
          ...q,
          {
            id: newQueueId(),
            parsed: data.parsed,
            rawMrz: data.rawMrz,
            portraitUri: data.portraitUri,
          },
        ];
      });
      setLastAddedName(displayName(data.parsed) || data.parsed.documentNumber || 'OK');
    },
    [t]
  );

  const runNfcRead = useCallback(
    async (bac: { documentNumber: string; birthDate: string; expiryDate: string }) => {
      if (readLockRef.current || !isFocused) return false;
      if (nfcAvailable === false) {
        Alert.alert(t('kbsNfcCaptureTitle'), t('kbsNfcUnavailable'));
        return false;
      }

      readLockRef.current = true;
      setReading(true);
      setScanStep('nfc');
      try {
        const result = await readPassportViaNfc(bac);
        if (!result.ok) {
          if (result.code === 'cancelled') return false;
          if (result.code === 'native_build') {
            Alert.alert(t('kbsNfcNativeBuildTitle'), result.message ?? t('kbsNfcNativeBuildBody'));
            return false;
          }
          Alert.alert(t('kbsNfcCaptureTitle'), result.message || t('kbsNfcReadFailed'));
          return false;
        }
        await playKbsScanSound('read', true);
        triggerMrzSuccessHaptic(0, true);
        enqueueCapture({
          parsed: result.data.parsed,
          rawMrz: result.data.rawMrz,
          portraitUri: result.data.portraitUri,
        });
        return true;
      } finally {
        setReading(false);
        readLockRef.current = false;
        setScanStep('mrz');
      }
    },
    [enqueueCapture, isFocused, nfcAvailable, t]
  );

  const handleMrzLocked = useCallback(
    async (payload: MrzLockedPayload) => {
      if (Date.now() < mrzLockUntilRef.current || readLockRef.current || reading) return;
      mrzLockUntilRef.current = Date.now() + MRZ_LOCK_DEBOUNCE_MS;

      const bac = bacKeyFromMrzLock({ mrz: payload.mrz, parsed: payload.parsed });
      if (!bac) {
        Alert.alert(t('kbsNfcCaptureTitle'), t('kbsNfcBacInvalid'));
        bumpScanCycle();
        return;
      }

      await playKbsScanSound('read', true);
      triggerMrzSuccessHaptic(0, true);
      await runNfcRead(bac);
      bumpScanCycle();
    },
    [bumpScanCycle, reading, runNfcRead, t]
  );

  const goToReview = useCallback(() => {
    if (queue.length === 0) {
      Alert.alert(t('kbsListEmpty'), t('kbsNfcListEmptyFirst'));
      return;
    }
    Keyboard.dismiss();
    setPhase('review');
  }, [queue.length, t]);

  const finalizeBulk = async () => {
    if (!staff?.id || !staff.organization_id) return;
    if (!roomNoTrimmed) {
      Alert.alert(t('kbsRoomNumberTitle'), t('kbsRoomNumberBody'));
      return;
    }
    if (savingRef.current) return;

    const items = [...queue];
    const count = items.length;
    savingRef.current = true;
    setSaving(true);
    setSaveStatus(t('kbsNfcSavingCount', { count }));
    Keyboard.dismiss();

    try {
      setSaveStatus(t('kbsRoomPreparing'));
      let room: KbsOpsRoom;
      const cached = roomPrefetchRef.current;
      if (cached?.key === roomNoTrimmed) {
        room = cached.room;
      } else {
        room = await resolveRoom(roomNoTrimmed);
        roomPrefetchRef.current = { key: roomNoTrimmed, room };
      }

      const saveItems = items.map((item, index) => ({
        index,
        clientId: item.id,
        parsed: item.parsed,
        rawMrz: item.rawMrz,
        portraitUri: item.portraitUri,
        guestPhone: phoneTrimmed || null,
      }));

      setSaveStatus(t('kbsSaveFinishing'));
      const saved = await saveKbsNfcCaptureItemsParallel(saveItems, room, (msg) => setSaveStatus(msg));
      markKbsCapturesJustSaved(saved.map((s) => s.guestDocumentId));

      setQueue([]);
      setRoomNoInput('');
      setPhoneInput('');
      setLastAddedName(null);
      roomPrefetchRef.current = null;
      setPhase('scan');

      void notifyKbsDocumentCaptured({
        organizationId: staff.organization_id,
        createdByStaffId: staff.id,
        roomNumber: roomNoTrimmed,
        count,
      }).catch(() => {});

      void prefetchHistory();
      router.replace(CAPTURE_HISTORY as never);
    } catch (e) {
      Alert.alert(t('kbsSaveError'), e instanceof Error ? e.message : t('kbsSaveFailed'));
    } finally {
      savingRef.current = false;
      setSaving(false);
      setSaveStatus('');
    }
  };

  const queueGalleryItems = useMemo(
    () =>
      queue.map((item, index) => {
        const name = displayName(item.parsed);
        const doc = item.parsed.documentNumber?.trim();
        return {
          id: item.id,
          uri: item.portraitUri,
          roomNumber: roomNoTrimmed || null,
          label: name || doc || `NFC ${index + 1}`,
        };
      }),
    [queue, roomNoTrimmed]
  );

  if (!nativeReady) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) }]}>
          <Pressable style={styles.iconBtn} onPress={goBack} accessibilityLabel={t('back')}>
            <Ionicons name="chevron-back" size={30} color="#fff" />
          </Pressable>
          <Text style={styles.title}>{t('kbsNfcCaptureTitle')}</Text>
          <View style={{ width: 44 }} />
        </View>
        <NfcNativeBuildRequired />
      </View>
    );
  }

  if (!VISION_OK) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) }]}>
          <Pressable style={styles.iconBtn} onPress={goBack} accessibilityLabel={t('back')}>
            <Ionicons name="chevron-back" size={30} color="#fff" />
          </Pressable>
          <Text style={styles.title}>{t('kbsNfcCaptureTitle')}</Text>
          <View style={{ width: 44 }} />
        </View>
        <MrzNativeBuildRequired />
      </View>
    );
  }

  if (phase === 'review') {
    return (
      <KeyboardAvoidingView
        style={styles.reviewRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <StatusBar style="dark" />

        <View style={[styles.reviewTopBar, { paddingTop: Math.max(insets.top, 12) }]}>
          <Pressable style={styles.reviewBackBtn} onPress={goBack} accessibilityLabel={t('back')}>
            <Ionicons name="chevron-back" size={26} color="#0f172a" />
          </Pressable>
          <View style={styles.reviewTitleWrap}>
            <Text style={styles.reviewTitle}>{t('kbsNfcReviewTitle')}</Text>
            <Text style={styles.reviewSub}>{t('kbsNfcReviewSub', { count: queue.length })}</Text>
          </View>
          <Pressable style={styles.reviewHistoryBtn} onPress={openHistory}>
            <Ionicons name="albums-outline" size={20} color="#2563eb" />
          </Pressable>
        </View>

        <ScrollView
          style={styles.reviewScroll}
          contentContainerStyle={styles.reviewScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {queue.map((item, index) => (
            <NfcFamilyMemberCard
              key={item.id}
              index={index}
              parsed={item.parsed}
              portraitUri={item.portraitUri}
              onPress={() => setDetailIndex(index)}
              onRemove={() => removeFromQueue(item.id)}
            />
          ))}

          <TouchableOpacity style={styles.addMoreBtn} onPress={() => setPhase('scan')} disabled={saving}>
            <Ionicons name="scan-outline" size={22} color="#2563eb" />
            <Text style={styles.addMoreText}>{t('kbsNfcAddMore')}</Text>
          </TouchableOpacity>
        </ScrollView>

        <View
          style={[
            styles.reviewFooter,
            {
              paddingBottom: androidKeyboardInset > 0 ? 12 : Math.max(insets.bottom, 16),
            },
            IS_ANDROID && androidKeyboardInset > 0 ? { marginBottom: androidKeyboardInset } : null,
          ]}
        >
          <Text style={styles.reviewFieldLabel}>{t('kbsRoomNumberTitle')}</Text>
          <TextInput
            ref={roomInputRef}
            style={styles.reviewInput}
            value={roomNoInput}
            onChangeText={onRoomNoChange}
            placeholder="204"
            placeholderTextColor="#94a3b8"
            editable={!saving}
            maxLength={24}
          />

          <Text style={styles.reviewFieldLabel}>{t('kbsNfcFamilyPhone')}</Text>
          <TextInput
            style={styles.reviewInput}
            value={phoneInput}
            onChangeText={onPhoneChange}
            placeholder="+90…"
            placeholderTextColor="#94a3b8"
            keyboardType="phone-pad"
            editable={!saving}
            maxLength={24}
          />

          <TouchableOpacity
            style={[styles.reviewSaveBtn, (!roomNoTrimmed || saving) && styles.reviewSaveBtnDisabled]}
            onPress={() => void finalizeBulk()}
            disabled={!roomNoTrimmed || saving}
          >
            {saving ? (
              <View style={styles.roomSubmitInner}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.reviewSaveText}>{saveStatus || t('kbsSaving')}</Text>
              </View>
            ) : (
              <Text style={styles.reviewSaveText}>{t('kbsNfcConfirmSave')}</Text>
            )}
          </TouchableOpacity>
        </View>

        <Modal
          visible={detailIndex !== null && queue[detailIndex ?? -1] != null}
          animationType="slide"
          transparent
          onRequestClose={() => setDetailIndex(null)}
          {...ROOM_MODAL_ANDROID_PROPS}
        >
          <View style={styles.detailBackdrop}>
            <Pressable style={styles.roomModalDismiss} onPress={() => setDetailIndex(null)} />
            <View style={[styles.detailSheetLight, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <View style={styles.detailHeaderLight}>
                <Text style={styles.detailTitleLight}>{t('kbsNfcDetailTitle')}</Text>
                <Pressable onPress={() => setDetailIndex(null)} hitSlop={10}>
                  <Ionicons name="close" size={26} color="#0f172a" />
                </Pressable>
              </View>
              {detailIndex != null && queue[detailIndex] ? (
                <>
                  <Image
                    source={{ uri: queue[detailIndex]!.portraitUri }}
                    style={styles.detailPortraitLight}
                    contentFit="cover"
                  />
                  <NfcParsedFieldsPanel parsed={queue[detailIndex]!.parsed} variant="light" />
                </>
              ) : null}
            </View>
          </View>
        </Modal>

        <KbsZoomImageModal
          items={queueGalleryItems}
          initialIndex={galleryIndex ?? 0}
          visible={galleryIndex !== null}
          onClose={() => setGalleryIndex(null)}
        />
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {VisionScanner ? (
        <VisionScanner
          enabled={cameraScanEnabled}
          keepCameraWarm
          resetToken={scanResetToken}
          torchEnabled={torchEnabled}
          onUiStateChange={setUi}
          onLocked={(payload) => void handleMrzLocked(payload)}
        />
      ) : (
        <View style={styles.cameraLoader}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}

      <NfcBatchScanOverlay
        hint={ui.hint}
        frameKind={ui.frameKind}
        showSpinner={ui.showSpinner}
        successGlow={ui.successGlow}
        scanStep={scanStep}
        queueCount={queue.length}
        reading={reading}
        lastName={lastAddedName}
        torchEnabled={torchEnabled}
        onToggleTorch={() => setTorchEnabled((v) => !v)}
        onBack={goBack}
        onFinish={goToReview}
      />

      {nfcAvailable === false ? (
        <View style={[styles.nfcWarn, { top: Math.max(insets.top, 12) + 56 }]}>
          <Text style={styles.nfcWarnText}>{t('kbsNfcUnavailable')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  cameraLoader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  topBar: {
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: 16, fontWeight: '800', flex: 1, textAlign: 'center' },
  nfcWarn: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(180, 83, 9, 0.92)',
    borderRadius: 12,
    padding: 10,
    zIndex: 30,
  },
  nfcWarnText: { color: '#fff', fontWeight: '700', textAlign: 'center', fontSize: 13 },
  roomModalDismiss: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  roomSubmitInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailBackdrop: { flex: 1, justifyContent: 'flex-end' },
  detailSheetLight: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    maxHeight: '88%',
  },
  detailHeaderLight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  detailTitleLight: { color: '#0f172a', fontSize: 17, fontWeight: '800' },
  detailPortraitLight: {
    width: 88,
    height: 110,
    borderRadius: 10,
    alignSelf: 'center',
    marginBottom: 12,
    backgroundColor: '#f1f5f9',
  },
  reviewRoot: { flex: 1, backgroundColor: '#f8fafc' },
  reviewTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  reviewBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewTitleWrap: { flex: 1, alignItems: 'center' },
  reviewTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  reviewSub: { fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: '600' },
  reviewHistoryBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewScroll: { flex: 1 },
  reviewScrollContent: { padding: 16, paddingBottom: 8 },
  reviewFooter: {
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  reviewFieldLabel: { fontSize: 13, fontWeight: '700', color: '#334155', marginTop: 8 },
  reviewInput: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#fff',
  },
  reviewSaveBtn: {
    marginTop: 16,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  reviewSaveBtnDisabled: { opacity: 0.5 },
  reviewSaveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  addMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    marginBottom: 8,
  },
  addMoreText: { color: '#2563eb', fontWeight: '800', fontSize: 14 },
});
