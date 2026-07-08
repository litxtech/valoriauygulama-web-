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
  bacKeyFromParsed,
  isNfcPassportAvailable,
  isNfcPassportNativeReady,
  readPassportViaNfc,
} from '@/lib/nfcPassport';
import { saveKbsNfcCaptureItemsParallel } from '@/lib/kbsNfcCaptureSave';
import { NfcNativeBuildRequired } from '@/components/kbs/NfcNativeBuildRequired';
import { NfcParsedFieldsPanel } from '@/components/kbs/NfcParsedFieldsPanel';
import { NfcFamilyMemberCard } from '@/components/kbs/NfcFamilyMemberCard';
import { NfcBatchScanOverlay } from '@/components/kbs/NfcBatchScanOverlay';
import type { MrzLockedPayload, MrzVisionUiState } from '@/components/mrz/mrzVisionTypes';
import { isMrzVisionScannerAvailable } from '@/lib/scanner/mrzVisionAvailability';
import {
  getMrzVisionScannerCached,
  preloadMrzVisionScanner,
  type MrzVisionScannerComponent,
} from '@/lib/scanner/mrzVisionScannerLoader';
import { scanDocumentFromGallery } from '@/lib/guestScan/galleryScan';
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
const MRZ_LOCK_DEBOUNCE_MS = 450;
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
  const [manualBacMode, setManualBacMode] = useState(!VISION_OK);
  const [docNoInput, setDocNoInput] = useState('');
  const [birthInput, setBirthInput] = useState('');
  const [expiryInput, setExpiryInput] = useState('');
  const [roomNoInput, setRoomNoInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [androidKeyboardInset, setAndroidKeyboardInset] = useState(0);
  const [scanResetToken, setScanResetToken] = useState(0);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [galleryBusy, setGalleryBusy] = useState(false);
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
  const cameraScanEnabled = VISION_OK && !manualBacMode && phase === 'scan' && isFocused && !reading;

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
          if (result.message) {
            Alert.alert(t('kbsNfcCaptureTitle'), result.message);
          }
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

      const bac = bacKeyFromParsed(payload.parsed);
      if (!bac) {
        Alert.alert(t('kbsNfcCaptureTitle'), t('kbsNfcBacInvalid'));
        bumpScanCycle();
        return;
      }

      await playKbsScanSound('read', true);
      triggerMrzSuccessHaptic(0, true);
      const ok = await runNfcRead(bac);
      bumpScanCycle();
      if (!ok) return;
    },
    [bumpScanCycle, reading, runNfcRead, t]
  );

  const handleGalleryPick = useCallback(async () => {
    if (galleryBusy || reading) return;
    setGalleryBusy(true);
    try {
      const res = await scanDocumentFromGallery();
      if (!res.ok) {
        if (res.code !== 'cancelled' && res.message) {
          Alert.alert(t('kbsGuestGalleryTitle'), res.message);
        }
        return;
      }
      const bac = bacKeyFromParsed(res.payload.parsed);
      if (!bac) {
        Alert.alert(t('kbsNfcCaptureTitle'), t('kbsNfcBacInvalid'));
        return;
      }
      mrzLockUntilRef.current = Date.now() + MRZ_LOCK_DEBOUNCE_MS;
      const ok = await runNfcRead(bac);
      if (ok) bumpScanCycle();
    } finally {
      setGalleryBusy(false);
    }
  }, [bumpScanCycle, galleryBusy, reading, runNfcRead, t]);

  const handleManualNfcRead = useCallback(async () => {
    const ok = await runNfcRead({
      documentNumber: docNoInput,
      birthDate: birthInput,
      expiryDate: expiryInput,
    });
    if (ok) {
      setDocNoInput('');
      setBirthInput('');
      setExpiryInput('');
    }
  }, [birthInput, docNoInput, expiryInput, runNfcRead]);

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
        const name = [item.parsed.firstName, item.parsed.lastName].filter(Boolean).join(' ').trim();
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

  const canManualRead =
    docNoInput.trim().length >= 3 &&
    birthInput.trim().length >= 6 &&
    expiryInput.trim().length >= 6 &&
    !reading &&
    nfcAvailable !== false;

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
            <Ionicons name="add-circle-outline" size={22} color="#2563eb" />
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
            keyboardType="default"
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

  if (VISION_OK && !manualBacMode) {
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
          torchEnabled={torchEnabled}
          onToggleTorch={() => setTorchEnabled((v) => !v)}
          onBack={goBack}
          onFinish={goToReview}
          onGallery={() => void handleGalleryPick()}
          galleryBusy={galleryBusy}
        />

        {VISION_OK ? (
          <Pressable
            style={[styles.manualToggle, { top: Math.max(insets.top, 12) + 52 }]}
            onPress={() => setManualBacMode(true)}
          >
            <Text style={styles.manualToggleText}>{t('kbsNfcManualBac')}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) }]}>
        <Pressable style={styles.iconBtn} onPress={goBack} accessibilityLabel={t('back')}>
          <Ionicons name="chevron-back" size={30} color="#fff" />
        </Pressable>
        <Text style={styles.title}>{t('kbsNfcCaptureTitle')}</Text>
        <Pressable style={styles.capturedListBtn} onPress={openHistory} accessibilityLabel={t('kbsCapturedListA11y')}>
          <Ionicons name="albums" size={18} color="#fff" />
          <Text style={styles.capturedListBtnText}>{t('kbsNfcCapturedListShort')}</Text>
        </Pressable>
      </View>

      <View style={styles.centerPanel}>
        <View style={styles.nfcIconRing}>
          <Ionicons name="hardware-chip-outline" size={56} color="#93c5fd" />
        </View>
        <Text style={styles.hintMain}>{t('kbsNfcCaptureHint')}</Text>
        <Text style={styles.hintSub}>{t('kbsNfcCaptureHintSub')}</Text>

        {nfcAvailable === false ? <Text style={styles.warn}>{t('kbsNfcUnavailable')}</Text> : null}

        {VISION_OK ? (
          <TouchableOpacity style={styles.cameraBackBtn} onPress={() => setManualBacMode(false)}>
            <Ionicons name="camera-outline" size={18} color="#93c5fd" />
            <Text style={styles.cameraBackBtnText}>{t('kbsNfcManualBacHide')}</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.bacCard}>
          <Text style={styles.bacTitle}>{t('kbsNfcBacSection')}</Text>
          <Text style={styles.bacSub}>{t('kbsNfcBacSectionSub')}</Text>
          <Text style={styles.fieldLabel}>{t('kbsNfcDocNo')}</Text>
          <TextInput
            style={styles.fieldInput}
            value={docNoInput}
            onChangeText={setDocNoInput}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="U12345678"
            placeholderTextColor="#64748b"
            editable={!reading && !saving}
          />
          <Text style={styles.fieldLabel}>{t('kbsNfcBirthDate')}</Text>
          <TextInput
            style={styles.fieldInput}
            value={birthInput}
            onChangeText={setBirthInput}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#64748b"
            editable={!reading && !saving}
          />
          <Text style={styles.fieldLabel}>{t('kbsNfcExpiryDate')}</Text>
          <TextInput
            style={styles.fieldInput}
            value={expiryInput}
            onChangeText={setExpiryInput}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#64748b"
            editable={!reading && !saving}
          />
        </View>

        <TouchableOpacity
          style={[styles.readBtn, !canManualRead && styles.readBtnDisabled]}
          onPress={() => void handleManualNfcRead()}
          disabled={!canManualRead}
          activeOpacity={0.9}
        >
          {reading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="radio-outline" size={22} color="#fff" />
              <Text style={styles.readBtnText}>{t('kbsNfcStartRead')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>
          {queue.length > 0 ? t('kbsNfcQueueBadge', { count: queue.length }) : t('kbsNfcQueueEmpty')}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.queueStrip}>
        {queue.map((item, index) => {
          const name = [item.parsed.firstName, item.parsed.lastName].filter(Boolean).join(' ').trim();
          const doc = item.parsed.documentNumber?.trim();
          return (
            <View key={item.id} style={styles.queueCard}>
              <Pressable style={styles.queueThumbWrap} onPress={() => setGalleryIndex(index)}>
                <Image source={{ uri: item.portraitUri }} style={styles.queueThumb} contentFit="cover" />
                <Text style={styles.queueIndex}>{index + 1}</Text>
              </Pressable>
              <Text style={styles.queueName} numberOfLines={1}>
                {name || '—'}
              </Text>
              <Text style={styles.queueDoc} numberOfLines={1}>
                {doc || '—'}
              </Text>
              <TouchableOpacity
                style={styles.queueInfoBtn}
                onPress={() => setDetailIndex(index)}
                hitSlop={8}
                accessibilityLabel={t('kbsNfcDetailA11y')}
              >
                <Ionicons name="information-circle" size={20} color="#93c5fd" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.queueRemove}
                onPress={() => removeFromQueue(item.id)}
                hitSlop={8}
                accessibilityLabel={t('kbsRemoveFromListA11y')}
              >
                <Ionicons name="close-circle" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[styles.forwardBtn, queue.length === 0 && styles.forwardBtnDisabled]}
          onPress={goToReview}
          disabled={queue.length === 0 || saving}
        >
          <Text style={styles.forwardBtnText}>{t('kbsNfcForwardRoom')}</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {saving ? (
        <View style={styles.busyMask}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.busyText}>{saveStatus || t('kbsSaving')}</Text>
        </View>
      ) : null}

      <Modal
        visible={detailIndex !== null && queue[detailIndex ?? -1] != null}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailIndex(null)}
        {...ROOM_MODAL_ANDROID_PROPS}
      >
        <View style={styles.detailBackdrop}>
          <Pressable style={styles.roomModalDismiss} onPress={() => setDetailIndex(null)} />
          <View style={[styles.detailSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>{t('kbsNfcDetailTitle')}</Text>
              <Pressable onPress={() => setDetailIndex(null)} hitSlop={10}>
                <Ionicons name="close" size={26} color="#fff" />
              </Pressable>
            </View>
            {detailIndex != null && queue[detailIndex] ? (
              <>
                <Image
                  source={{ uri: queue[detailIndex]!.portraitUri }}
                  style={styles.detailPortrait}
                  contentFit="cover"
                />
                <NfcParsedFieldsPanel parsed={queue[detailIndex]!.parsed} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1220' },
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
  capturedListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(37, 99, 235, 0.92)',
  },
  capturedListBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  manualToggle: {
    position: 'absolute',
    right: 14,
    zIndex: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  manualToggleText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  centerPanel: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    alignItems: 'center',
  },
  nfcIconRing: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: 'rgba(30, 58, 138, 0.55)',
    borderWidth: 2,
    borderColor: 'rgba(147, 197, 253, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  hintMain: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  hintSub: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 14,
    lineHeight: 18,
  },
  warn: {
    color: '#fde68a',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 10,
  },
  cameraBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(37, 99, 235, 0.25)',
  },
  cameraBackBtnText: { color: '#93c5fd', fontWeight: '700', fontSize: 13 },
  bacCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 14,
    marginBottom: 14,
  },
  bacTitle: { color: '#fff', fontWeight: '800', fontSize: 14 },
  bacSub: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 4, marginBottom: 10 },
  fieldLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700', marginTop: 6 },
  fieldInput: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
  },
  readBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
  },
  readBtnDisabled: { opacity: 0.45 },
  readBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  stepBadge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    marginBottom: 8,
  },
  stepBadgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  queueStrip: { paddingHorizontal: 14, gap: 10, paddingBottom: 8, minHeight: 118 },
  queueCard: { width: 92, position: 'relative' },
  queueThumbWrap: {
    width: 92,
    height: 92,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(147, 197, 253, 0.5)',
  },
  queueThumb: { width: '100%', height: '100%' },
  queueIndex: {
    position: 'absolute',
    left: 6,
    top: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    color: '#fff',
    fontWeight: '800',
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  queueName: { color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 4 },
  queueDoc: { color: 'rgba(255,255,255,0.65)', fontSize: 10 },
  queueInfoBtn: {
    position: 'absolute',
    left: -2,
    bottom: 26,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    padding: 2,
  },
  queueRemove: { position: 'absolute', right: -4, top: -4 },
  bottomBar: { paddingHorizontal: 16, paddingTop: 8 },
  forwardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    borderRadius: 14,
    paddingVertical: 14,
  },
  forwardBtnDisabled: { opacity: 0.4 },
  forwardBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  busyMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  busyText: { color: '#fff', fontWeight: '700' },
  roomModalDismiss: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  roomSubmitInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailBackdrop: { flex: 1, justifyContent: 'flex-end' },
  detailSheet: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    maxHeight: '88%',
  },
  detailSheetLight: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    maxHeight: '88%',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  detailHeaderLight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  detailTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  detailTitleLight: { color: '#0f172a', fontSize: 17, fontWeight: '800' },
  detailPortrait: {
    width: 88,
    height: 110,
    borderRadius: 10,
    alignSelf: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
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
