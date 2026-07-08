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
  isNfcPassportAvailable,
  isNfcPassportNativeReady,
  readPassportViaNfc,
} from '@/lib/nfcPassport';
import { saveKbsNfcCaptureItemsParallel } from '@/lib/kbsNfcCaptureSave';
import { NfcParsedFieldsPanel } from '@/components/kbs/NfcParsedFieldsPanel';
import { NfcFamilyMemberCard } from '@/components/kbs/NfcFamilyMemberCard';
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

const CAPTURE_HISTORY = '/staff/kbs/capture-history' as Href;
const IS_ANDROID = Platform.OS === 'android';

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
  const [nativeReady, setNativeReady] = useState(() => isNfcPassportNativeReady());
  const [reading, setReading] = useState(false);
  const [queue, setQueue] = useState<NfcQueueItem[]>([]);
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

  const savingRef = useRef(false);
  const readLockRef = useRef(false);
  const roomPrefetchRef = useRef<{ key: string; room: KbsOpsRoom } | null>(null);
  const roomPrefetchGenRef = useRef(0);

  const roomNoTrimmed = roomNoInput.trim();
  const phoneTrimmed = phoneInput.trim();
  const canRead =
    docNoInput.trim().length >= 5 &&
    birthInput.trim().length >= 6 &&
    expiryInput.trim().length >= 6 &&
    !reading &&
    nfcAvailable !== false &&
    nativeReady;

  useEffect(() => {
    const ready = isNfcPassportNativeReady();
    setNativeReady(ready);
    if (!ready) {
      setNfcAvailable(false);
      return;
    }
    void isNfcPassportAvailable().then(setNfcAvailable);
  }, [isFocused]);

  useEffect(() => {
    if (!user?.id) return;
    warmKbsCaptureOpsContext(user.id);
  }, [user?.id]);

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
    if (roomPrefetchRef.current?.key !== next.trim()) roomPrefetchRef.current = null;
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

  const handleNfcRead = useCallback(async () => {
    if (readLockRef.current || reading || !isFocused) return;
    if (!nativeReady) {
      Alert.alert(t('kbsNfcCaptureTitle'), t('kbsNfcChipModuleMissing'));
      return;
    }
    if (nfcAvailable === false) {
      Alert.alert(t('kbsNfcCaptureTitle'), t('kbsNfcUnavailable'));
      return;
    }

    readLockRef.current = true;
    setReading(true);
    try {
      const result = await readPassportViaNfc({
        documentNumber: docNoInput,
        birthDate: birthInput,
        expiryDate: expiryInput,
      });
      if (!result.ok) {
        if (result.code === 'cancelled') return;
        if (result.code === 'native_build') {
          Alert.alert(t('kbsNfcNativeBuildTitle'), result.message ?? t('kbsNfcNativeBuildBody'));
          return;
        }
        Alert.alert(t('kbsNfcCaptureTitle'), result.message || t('kbsNfcReadFailed'));
        return;
      }
      await playKbsScanSound('read', true);
      triggerMrzSuccessHaptic(0, true);
      enqueueCapture({
        parsed: result.data.parsed,
        rawMrz: result.data.rawMrz,
        portraitUri: result.data.portraitUri,
      });
      // Sıradaki aile ferdi için alanları temizle; kilidi çip doldurmasın (başka pasaport)
      setDocNoInput('');
      setBirthInput('');
      setExpiryInput('');
    } finally {
      setReading(false);
      readLockRef.current = false;
    }
  }, [
    birthInput,
    docNoInput,
    enqueueCapture,
    expiryInput,
    isFocused,
    nativeReady,
    nfcAvailable,
    reading,
    t,
  ]);

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
            <Ionicons name="radio-outline" size={22} color="#2563eb" />
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
              <View style={styles.rowCenter}>
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
            <Pressable style={styles.modalDismiss} onPress={() => setDetailIndex(null)} />
            <View style={[styles.detailSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <View style={styles.detailHeader}>
                <Text style={styles.detailTitle}>{t('kbsNfcDetailTitle')}</Text>
                <Pressable onPress={() => setDetailIndex(null)} hitSlop={10}>
                  <Ionicons name="close" size={26} color="#0f172a" />
                </Pressable>
              </View>
              {detailIndex != null && queue[detailIndex] ? (
                <>
                  <Image
                    source={{ uri: queue[detailIndex]!.portraitUri }}
                    style={styles.detailPortrait}
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

      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) }]}>
        <Pressable style={styles.iconBtn} onPress={goBack} accessibilityLabel={t('back')}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </Pressable>
        <Text style={styles.title}>{t('kbsNfcCaptureTitle')}</Text>
        <Pressable style={styles.historyBtn} onPress={openHistory}>
          <Ionicons name="albums" size={18} color="#fff" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scanContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroRing}>
            <Ionicons name="radio-outline" size={48} color="#93c5fd" />
          </View>
          <Text style={styles.heroTitle}>{t('kbsNfcOnlyTitle')}</Text>
          <Text style={styles.heroSub}>{t('kbsNfcOnlySub')}</Text>
        </View>

        {!nativeReady || nfcAvailable === false ? (
          <View style={styles.warnBox}>
            <Text style={styles.warnText}>
              {!nativeReady ? t('kbsNfcChipModuleMissing') : t('kbsNfcUnavailable')}
            </Text>
          </View>
        ) : null}

        <View style={styles.lockCard}>
          <Text style={styles.lockTitle}>{t('kbsNfcChipUnlockTitle')}</Text>
          <Text style={styles.lockSub}>{t('kbsNfcChipUnlockSub')}</Text>

          <Text style={styles.fieldLabel}>{t('kbsNfcDocNo')}</Text>
          <TextInput
            style={styles.fieldInput}
            value={docNoInput}
            onChangeText={(v) => setDocNoInput(v.replace(/\s/g, '').toUpperCase())}
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
            placeholder="YYYY-MM-DD veya YYMMDD"
            placeholderTextColor="#64748b"
            editable={!reading && !saving}
            keyboardType="numbers-and-punctuation"
          />

          <Text style={styles.fieldLabel}>{t('kbsNfcExpiryDate')}</Text>
          <TextInput
            style={styles.fieldInput}
            value={expiryInput}
            onChangeText={setExpiryInput}
            placeholder="YYYY-MM-DD veya YYMMDD"
            placeholderTextColor="#64748b"
            editable={!reading && !saving}
            keyboardType="numbers-and-punctuation"
          />
        </View>

        <TouchableOpacity
          style={[styles.readBtn, !canRead && styles.readBtnDisabled]}
          onPress={() => void handleNfcRead()}
          disabled={!canRead}
          activeOpacity={0.9}
        >
          {reading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="hardware-chip-outline" size={22} color="#fff" />
              <Text style={styles.readBtnText}>{t('kbsNfcStartRead')}</Text>
            </>
          )}
        </TouchableOpacity>

        {queue.length > 0 ? (
          <>
            <Text style={styles.queueTitle}>{t('kbsNfcBatchQueueCount', { count: queue.length })}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.queueStrip}>
              {queue.map((item, index) => {
                const name = displayName(item.parsed);
                const doc = item.parsed.documentNumber?.trim();
                return (
                  <View key={item.id} style={styles.queueCard}>
                    <Pressable onPress={() => setGalleryIndex(index)}>
                      <Image source={{ uri: item.portraitUri }} style={styles.queueThumb} contentFit="cover" />
                      <Text style={styles.queueIndex}>{index + 1}</Text>
                    </Pressable>
                    <Text style={styles.queueName} numberOfLines={1}>
                      {name || '—'}
                    </Text>
                    <Text style={styles.queueDoc} numberOfLines={1}>
                      {doc || '—'}
                    </Text>
                    <TouchableOpacity style={styles.queueRemove} onPress={() => removeFromQueue(item.id)} hitSlop={8}>
                      <Ionicons name="close-circle" size={22} color="#fff" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[styles.forwardBtn, queue.length === 0 && styles.forwardBtnDisabled]}
          onPress={goToReview}
          disabled={queue.length === 0 || saving || reading}
        >
          <Text style={styles.forwardBtnText}>
            {queue.length > 0
              ? t('kbsNfcFinishScanningCount', { count: queue.length })
              : t('kbsNfcFinishScanning')}
          </Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {saving ? (
        <View style={styles.busyMask}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.busyText}>{saveStatus || t('kbsSaving')}</Text>
        </View>
      ) : null}

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
  historyBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(37, 99, 235, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: 16, fontWeight: '800', flex: 1, textAlign: 'center' },
  scanContent: { paddingHorizontal: 20, paddingBottom: 24 },
  hero: { alignItems: 'center', marginTop: 8, marginBottom: 18 },
  heroRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(37, 99, 235, 0.28)',
    borderWidth: 2,
    borderColor: 'rgba(147, 197, 253, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroTitle: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  heroSub: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  warnBox: {
    backgroundColor: 'rgba(180, 83, 9, 0.9)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  warnText: { color: '#fff', fontWeight: '700', textAlign: 'center', fontSize: 13 },
  lockCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 16,
    marginBottom: 14,
  },
  lockTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  lockSub: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 4, marginBottom: 12, lineHeight: 18 },
  fieldLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700', marginTop: 8 },
  fieldInput: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
  },
  readBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
  },
  readBtnDisabled: { opacity: 0.45 },
  readBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  queueTitle: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
    marginTop: 18,
    marginBottom: 10,
  },
  queueStrip: { gap: 10, paddingBottom: 8 },
  queueCard: { width: 92, position: 'relative' },
  queueThumb: {
    width: 92,
    height: 92,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(147, 197, 253, 0.5)',
  },
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
  reviewBackBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  reviewTitleWrap: { flex: 1, alignItems: 'center' },
  reviewTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  reviewSub: { fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: '600' },
  reviewHistoryBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
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
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  detailBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modalDismiss: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  detailSheet: {
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
  detailTitle: { color: '#0f172a', fontSize: 17, fontWeight: '800' },
  detailPortrait: {
    width: 88,
    height: 110,
    borderRadius: 10,
    alignSelf: 'center',
    marginBottom: 12,
    backgroundColor: '#f1f5f9',
  },
});
