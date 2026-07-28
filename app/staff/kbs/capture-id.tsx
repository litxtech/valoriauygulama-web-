import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  InteractionManager,
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
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { useNavigation, usePathname, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { copyUriToCacheForUpload } from '@/lib/uploadMedia';
import { ensureKbsOpsRoom, type KbsOpsRoom } from '@/lib/kbsStaffOpsEdge';
import { saveKbsCaptureItemsParallel, type KbsCaptureSaveItem } from '@/lib/kbsCaptureSave';
import { notifyKbsDocumentCaptured } from '@/lib/kbsCaptureNotify';
import { fetchKbsCapturedDocuments } from '@/lib/kbsCaptureHistory';
import { setKbsCaptureHistoryCache } from '@/lib/kbsCaptureHistoryCache';
import { markKbsCapturesJustSaved } from '@/lib/kbsCaptureHistorySeen';
import { useAuthStore } from '@/stores/authStore';
import { navigateStaffBack, STAFF_TABS_FALLBACK } from '@/lib/staffStackBack';
import { KbsZoomImageModal } from '@/components/kbs/KbsZoomImageModal';
import {
  KbsCaptureQueuePanel,
  type KbsCaptureQueueItem,
} from '@/components/kbs/KbsCaptureQueuePanel';
import { KbsSheetSplitReviewModal } from '@/components/kbs/KbsSheetSplitReviewModal';
import {
  kbsCaptureHasLensKind,
  kbsCaptureZoomForDistance,
  loadKbsCapturePictureSize,
  pickKbsCaptureLens,
  takeKbsIdPicture,
  type KbsCaptureDistance,
} from '@/lib/kbsCaptureCamera';
import { autoSplitKbsSheetImage, type KbsSheetDetectResult } from '@/lib/kbsCaptureSheetSplit';
import {
  pickKbsGalleryUnlimited,
  processKbsGallerySerial,
  type KbsImportSheetReview,
} from '@/lib/kbsCaptureImportPipeline';
import { useTranslation } from 'react-i18next';
import type { KbsCaptureSide } from '@/lib/kbsCaptureOcr';
import { isTcManualEntryAcceptable, normalizeTcInput } from '@/lib/kbsTcValidation';
import {
  cancelKbsCapturePrewarm,
  clearKbsCapturePrewarmAll,
  startKbsCapturePrewarm,
  warmKbsCaptureOpsContext,
} from '@/lib/kbsCapturePrewarm';
import { setKbsOcrBulkMode } from '@/lib/kbsCaptureOcrQueue';

type CaptureMode = 'front' | 'mrz_back' | 'tc';

type CaptureImageItem = Extract<KbsCaptureQueueItem, { kind: 'image' }> & {
  captureSource: 'camera' | 'gallery';
  captureSide: KbsCaptureSide;
};

type QueueItem = CaptureImageItem | Extract<KbsCaptureQueueItem, { kind: 'tc' }>;

const CAPTURE_HISTORY = '/staff/kbs/capture-history' as Href;
const IS_ANDROID = Platform.OS === 'android';
const IS_IOS = Platform.OS === 'ios';
const { height: SCREEN_H } = Dimensions.get('window');

/** Android Modal: sistem çubukları için güvenli alan ölçümü (klavye + sheet). */
const ROOM_MODAL_ANDROID_PROPS = IS_ANDROID
  ? ({ statusBarTranslucent: true, navigationBarTranslucent: true } as const)
  : {};

function newCaptureId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function uriForQueue(uri: string): Promise<string> {
  const u = uri.trim();
  if (!u) return u;
  if (u.startsWith('file://')) return u;
  return copyUriToCacheForUpload(u, 'image');
}

export default function KbsCaptureIdScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const staff = useAuthStore((s) => s.staff);
  const user = useAuthStore((s) => s.user);
  const cameraRef = useRef<CameraView | null>(null);
  const roomInputRef = useRef<TextInput | null>(null);
  const savingRef = useRef(false);
  const roomPrefetchRef = useRef<{ key: string; room: KbsOpsRoom } | null>(null);
  const roomPrefetchGenRef = useRef(0);
  const [permission, requestPermission] = useCameraPermissions();
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [cameraReady, setCameraReady] = useState(false);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const [flashOn, setFlashOn] = useState(false);
  /** Uzak / 1× / Yakın — iOS’ta lens + zoom, Android’de zoom. */
  const [captureDistance, setCaptureDistance] = useState<KbsCaptureDistance>('normal');
  const [availableLenses, setAvailableLenses] = useState<string[]>([]);
  const [roomNoInput, setRoomNoInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [roomModalVisible, setRoomModalVisible] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  /** Toplu kamera: peş peşe çekimde kuyruk sayacı / banner. */
  const [bulkCameraHint, setBulkCameraHint] = useState(false);
  const [sheetReview, setSheetReview] = useState<{
    sheetUri: string;
    detect: KbsSheetDetectResult;
    suggestedCount: number;
    progressLabel: string;
  } | null>(null);
  const sheetReviewResolverRef = useRef<((count: number | null) => void) | null>(null);
  const importCancelRef = useRef({ cancelled: false });
  const [captureMode, setCaptureMode] = useState<CaptureMode>('front');
  const [tcInput, setTcInput] = useState('');
  const [tcNameInput, setTcNameInput] = useState('');
  const [tcPhoneInput, setTcPhoneInput] = useState('');
  const tcInputRef = useRef<TextInput | null>(null);
  const tcNameInputRef = useRef<TextInput | null>(null);
  const tcPhoneInputRef = useRef<TextInput | null>(null);
  const [androidKeyboardInset, setAndroidKeyboardInset] = useState(0);
  const [tcKeyboardInset, setTcKeyboardInset] = useState(0);
  const captureLockRef = useRef(false);
  const phoneInputRef = useRef<TextInput | null>(null);

  const onPhoneChange = useCallback((text: string) => {
    setPhoneInput(text.replace(/[^\d+()\s-]/g, '').slice(0, 24));
  }, []);

  const onTcPhoneChange = useCallback((text: string) => {
    setTcPhoneInput(text.replace(/[^\d+()\s-]/g, '').slice(0, 24));
  }, []);

  const roomNoTrimmed = roomNoInput.trim();
  const phoneTrimmed = phoneInput.trim();

  const captureSide: KbsCaptureSide = captureMode === 'mrz_back' ? 'mrz_back' : 'front';
  const imageQueue = queue.filter((item): item is CaptureImageItem => item.kind === 'image');
  const tcQueueCount = queue.filter((item) => item.kind === 'tc').length;

  const hasTelephotoLens = useMemo(
    () => kbsCaptureHasLensKind(availableLenses, 'telephoto'),
    [availableLenses]
  );
  const cameraZoom = kbsCaptureZoomForDistance(captureDistance, { hasTelephotoLens });
  const selectedLens = useMemo(
    () => (IS_IOS ? pickKbsCaptureLens(availableLenses, captureDistance) : undefined),
    [availableLenses, captureDistance]
  );

  const queueGalleryItems = useMemo(
    () =>
      imageQueue.map((item, index) => ({
        id: item.id,
        uri: item.imageUri,
        roomNumber: roomNoTrimmed || null,
        label: `Kimlik ${index + 1}`,
      })),
    [imageQueue, roomNoTrimmed]
  );

  const openQueueGallery = useCallback(
    (itemId: string) => {
      const idx = imageQueue.findIndex((item) => item.id === itemId);
      if (idx >= 0) setGalleryIndex(idx);
    },
    [imageQueue]
  );

  const switchCaptureMode = useCallback(
    (next: CaptureMode) => {
      if (next === captureMode) return;
      setCaptureMode(next);
      if (next === 'tc') {
        setTimeout(() => tcInputRef.current?.focus(), 280);
      }
    },
    [captureMode]
  );

  const onRoomNoChange = useCallback((text: string) => {
    const next = text.replace(/[^\dA-Za-z\-/]/g, '').slice(0, 24);
    setRoomNoInput(next);
    if (roomPrefetchRef.current?.key !== next.trim()) {
      roomPrefetchRef.current = null;
    }
  }, []);

  const prefetchHistory = useCallback(() => {
    if (!user?.id) return;
    void fetchKbsCapturedDocuments(300, user.id)
      .then((data) => setKbsCaptureHistoryCache(data))
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (!permission?.granted && permission?.canAskAgain !== false) {
      void requestPermission();
    }
  }, [permission?.granted, permission?.canAskAgain, requestPermission]);

  useEffect(() => {
    if (!user?.id) return;
    warmKbsCaptureOpsContext(user.id);
    const task = InteractionManager.runAfterInteractions(() => {
      prefetchHistory();
    });
    return () => task.cancel();
  }, [prefetchHistory, user?.id]);

  useEffect(() => {
    return () => {
      clearKbsCapturePrewarmAll();
    };
  }, []);

  useEffect(() => {
    if (!roomModalVisible) return;
    const t = setTimeout(() => {
      const input = roomInputRef.current;
      if (!input) return;
      input.focus();
    }, 320);
    return () => clearTimeout(t);
  }, [roomModalVisible]);

  /** Android: oda modalı + T.C. girişi klavye yüksekliği. */
  useEffect(() => {
    if (!IS_ANDROID) return;
    if (!roomModalVisible && captureMode !== 'tc') {
      setAndroidKeyboardInset(0);
      setTcKeyboardInset(0);
      return;
    }
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      const h = Math.max(0, e.endCoordinates?.height ?? 0);
      if (roomModalVisible) setAndroidKeyboardInset(h);
      if (captureMode === 'tc') setTcKeyboardInset(h);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setAndroidKeyboardInset(0);
      setTcKeyboardInset(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [roomModalVisible, captureMode]);

  const goBack = useCallback(() => {
    navigateStaffBack(router, navigation as NavigationProp<ParamListBase>, pathname, STAFF_TABS_FALLBACK);
  }, [navigation, pathname, router]);

  const openHistory = useCallback(() => {
    router.push(CAPTURE_HISTORY as never);
    prefetchHistory();
  }, [prefetchHistory, router]);

  const enqueueImageUris = useCallback(
    (uris: string[], captureSource: CaptureImageItem['captureSource'], side: KbsCaptureSide) => {
      if (uris.length === 0) return;
      const added: CaptureImageItem[] = uris.map((imageUri) => ({
        kind: 'image',
        id: newCaptureId(),
        imageUri,
        captureSource,
        captureSide: side,
      }));
      // Çoklu pasaport: OCR’yi kayıt sonrasına bırak — prewarm yalnız upload (OOM önler).
      const skipOcr = uris.length > 1 || captureSource === 'gallery';
      setQueue((q) => [...q, ...added]);
      for (const row of added) {
        startKbsCapturePrewarm({
          itemId: row.id,
          imageUri: row.imageUri,
          captureSide: row.captureSide,
          captureSource: row.captureSource,
          skipOcr,
        });
      }
    },
    []
  );

  const enqueueCapturedImage = useCallback(
    async (uri: string, captureSource: CaptureImageItem['captureSource'], opts?: { skipSplit?: boolean }) => {
      const skip = opts?.skipSplit === true;
      if (!skip) setSplitting(true);
      try {
        const parts = skip ? [uri] : await autoSplitKbsSheetImage(uri);
        enqueueImageUris(parts.length > 0 ? parts : [uri], captureSource, captureSide);
      } catch (e) {
        Alert.alert(t('kbsCropError'), e instanceof Error ? e.message : t('kbsCropErrorBody'));
      } finally {
        if (!skip) setSplitting(false);
      }
    },
    [captureSide, enqueueImageUris, t]
  );

  const addTcToQueue = useCallback(
    (override?: { tc?: string; fullName?: string; phone?: string }) => {
      const tc = normalizeTcInput(override?.tc ?? tcInput);
      const fullName = (override?.fullName ?? tcNameInput).trim();
      const phone = (override?.phone ?? tcPhoneInput).trim();

      if (!isTcManualEntryAcceptable(tc)) {
        Alert.alert('Geçersiz T.C.', '11 haneli T.C. kimlik numarası girin (ilk rakam 0 olamaz).');
        return;
      }

      let duplicate = false;
      setQueue((q) => {
        if (q.some((item) => item.kind === 'tc' && item.tc === tc)) {
          duplicate = true;
          return q;
        }
        const row: Extract<QueueItem, { kind: 'tc' }> = {
          kind: 'tc',
          id: newCaptureId(),
          tc,
          fullName,
          phone,
        };
        return [...q, row];
      });

      if (duplicate) {
        Alert.alert('Zaten listede', 'Bu T.C. numarası kuyrukta mevcut.');
        return;
      }

      setTcInput('');
      setTcNameInput('');
      setTcPhoneInput('');
      setTimeout(() => tcInputRef.current?.focus(), 120);
    },
    [tcInput, tcNameInput, tcPhoneInput]
  );

  const removeFromQueue = useCallback((itemId: string) => {
    cancelKbsCapturePrewarm(itemId);
    setQueue((q) => q.filter((item) => item.id !== itemId));
  }, []);

  /** Yazılan oda numarası aynen kullanılır; listeden eşleştirme yapılmaz. */
  const resolveRoom = useCallback(async (roomNumber: string): Promise<KbsOpsRoom> => {
    const trimmed = roomNumber.trim();
    if (!trimmed) throw new Error(t('kbsRoomRequired'));
    const created = await ensureKbsOpsRoom(trimmed);
    if (!created.ok) throw new Error(created.error.message);
    return { ...created.data, room_number: trimmed };
  }, []);

  /** Kayıt öncesi oda kaydını arka planda hazırla (ensure_room gecikmesini azaltır). */
  useEffect(() => {
    if (!roomModalVisible || roomNoTrimmed.length < 1) {
      roomPrefetchRef.current = null;
      return;
    }
    const gen = ++roomPrefetchGenRef.current;
    const t = setTimeout(() => {
      void resolveRoom(roomNoTrimmed)
        .then((room) => {
          if (roomPrefetchGenRef.current !== gen) return;
          roomPrefetchRef.current = { key: roomNoTrimmed, room };
        })
        .catch(() => {
          if (roomPrefetchGenRef.current === gen) roomPrefetchRef.current = null;
        });
    }, 350);
    return () => clearTimeout(t);
  }, [roomModalVisible, roomNoTrimmed, resolveRoom]);

  const handleCapture = async () => {
    if (captureLockRef.current || !cameraRef.current || !cameraReady) return;
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert(t('kbsCameraPermTitle'), t('kbsCameraPermBody'));
      }
      return;
    }
    captureLockRef.current = true;
    try {
      const shot = await takeKbsIdPicture(cameraRef.current);
      // Kilidi hemen aç — peş peşe çekim; prewarm/OCR arka planda.
      captureLockRef.current = false;
      void enqueueCapturedImage(shot.uri, 'camera', { skipSplit: true });
    } catch (e) {
      captureLockRef.current = false;
      Alert.alert(t('error'), e instanceof Error ? e.message : t('kbsCaptureFailed'));
    }
  };

  const askSheetReview = useCallback((review: KbsImportSheetReview, progressLabel: string) => {
    return new Promise<number | null>((resolve) => {
      sheetReviewResolverRef.current = resolve;
      setSheetReview({
        sheetUri: review.sheetUri,
        detect: review.detect,
        suggestedCount: review.suggestedCount,
        progressLabel,
      });
    });
  }, []);

  const finishSheetReview = useCallback((count: number | null) => {
    const resolve = sheetReviewResolverRef.current;
    sheetReviewResolverRef.current = null;
    setSheetReview(null);
    resolve?.(count);
  }, []);

  /**
   * Sınırsız galeri seçimi → paralel hazırla → A4 onay → kuyruğa akıt.
   * Tile hazır oldukça prewarm başlar; OCR kayıt sonrası fast→deep.
   */
  const handlePickGallery = async () => {
    if (captureLockRef.current || saving) return;
    try {
      captureLockRef.current = true;
      setBulkCameraHint(false);
      importCancelRef.current = { cancelled: false };
      setImportStatus('Galeri açılıyor…');
      const assets = await pickKbsGalleryUnlimited();
      if (assets.length === 0) {
        setImportStatus('');
        return;
      }

      // Çoklu galeri: OCR sınırlı paralellik (ekleme anında Maximum yok).
      if (assets.length >= 2) setKbsOcrBulkMode(true);

      setSplitting(true);
      setImportStatus(`${assets.length} foto seçildi — hızlı işleniyor…`);

      let streamed = 0;
      const tiles = await processKbsGallerySerial(assets, {
        captureSide,
        signal: importCancelRef.current,
        onProgress: (p) => setImportStatus(p.message),
        onSheetReview: (review) =>
          askSheetReview(review, `Foto ${review.detect.looksLikeSheetPage ? 'A4' : 'çoklu'}`),
        onTileReady: (tile) => {
          streamed += 1;
          enqueueImageUris([tile.uri], 'gallery', captureSide);
          setImportStatus(`${streamed} kimlik kuyrukta…`);
        },
      });

      if (tiles.length === 0 && streamed === 0) {
        setImportStatus('');
        return;
      }

      setImportStatus(`${Math.max(tiles.length, streamed)} kimlik kuyruğa eklendi`);
      setTimeout(() => setImportStatus(''), 1800);
    } catch (e) {
      Alert.alert(t('error'), e instanceof Error ? e.message : t('kbsGalleryFailed'));
      setImportStatus('');
    } finally {
      setSplitting(false);
      captureLockRef.current = false;
    }
  };

  /** Toplu: Galeri (sınırsız) veya peş peşe kamera. */
  const openBulkMenu = () => {
    if (saving || splitting) return;
    Alert.alert('Toplu yükle', 'Pasaport / kimlikleri nasıl eklemek istersin?', [
      {
        text: 'Galeri (sınırsız · hızlı)',
        onPress: () => void handlePickGallery(),
      },
      {
        text: 'Kamera (peş peşe çek)',
        onPress: () => {
          setBulkCameraHint(true);
          if (captureMode === 'tc') setCaptureMode('front');
        },
      },
      { text: 'İptal', style: 'cancel' },
    ]);
  };

  const openRoomModal = () => {
    if (queue.length === 0) {
      Alert.alert(t('kbsListEmpty'), t('kbsListEmptyCaptureFirst'));
      return;
    }
    roomPrefetchRef.current = null;
    setRoomModalVisible(true);
  };

  const closeRoomModal = () => {
    if (savingRef.current) return;
    Keyboard.dismiss();
    setRoomModalVisible(false);
  };

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
    setSaveStatus(`${count} kayıt kaydediliyor…`);
    Keyboard.dismiss();

    try {
      let room: KbsOpsRoom;
      setSaveStatus(t('kbsRoomPreparing'));
      const cached = roomPrefetchRef.current;
      if (cached?.key === roomNoTrimmed) {
        room = cached.room;
      } else {
        room = await resolveRoom(roomNoTrimmed);
        roomPrefetchRef.current = { key: roomNoTrimmed, room };
      }

      const saveItems: KbsCaptureSaveItem[] = items.map((item, index) => {
        if (item.kind === 'tc') {
          return {
            kind: 'tc',
            tcNumber: item.tc,
            fullName: item.fullName || null,
            index,
            clientId: item.id,
            guestPhone: item.phone || phoneTrimmed || null,
          };
        }
        return {
          kind: 'image',
          imageUri: item.imageUri,
          index,
          clientId: item.id,
          captureSource: item.captureSource,
          captureSide: item.captureSide,
          guestPhone: phoneTrimmed || null,
        };
      });

      setSaveStatus(t('kbsSaveFinishing'));
      const saved = await saveKbsCaptureItemsParallel(
        saveItems,
        room,
        (msg) => setSaveStatus(msg),
        null,
        { bulkOcr: true }
      );
      const savedDocIds = saved.map((s) => s.guestDocumentId);
      markKbsCapturesJustSaved(savedDocIds);

      const returningRows = saved.filter((s) => s.returningGuest);
      if (returningRows.length > 0) {
        const { announceKbsReturningGuest } = await import('@/lib/kbsReturningGuestAlert');
        returningRows.forEach((row, index) => {
          void announceKbsReturningGuest({
            organizationId: staff.organization_id,
            createdByStaffId: staff.id,
            documentId: row.guestDocumentId,
            guestId: row.guestId,
            roomNumber: roomNoTrimmed || undefined,
            playSound: index === 0,
            sendPush: true,
            showLocalAlert: index === 0,
          });
        });
      }

      if (phoneTrimmed) {
        const {
          findKbsDuplicatePhoneHits,
          pickPrimaryKbsDuplicatePhoneHit,
          showKbsDuplicatePhoneAlert,
          kbsDuplicatePhoneCompareHref,
        } = await import('@/lib/kbsDuplicatePhone');
        const exclude = new Set(savedDocIds);
        const hits = (
          await findKbsDuplicatePhoneHits({
            phone: phoneTrimmed,
          })
        ).filter((h) => !h.documentId || !exclude.has(h.documentId));
        const phoneHit = pickPrimaryKbsDuplicatePhoneHit(hits);
        const currentId = savedDocIds[0];
        if (phoneHit && currentId) {
          showKbsDuplicatePhoneAlert(phoneHit, {
            sound: returningRows.length === 0,
            onCompare: phoneHit.documentId
              ? () => {
                  router.push(kbsDuplicatePhoneCompareHref(currentId, phoneHit.documentId!));
                }
              : undefined,
          });
        }
      }

      clearKbsCapturePrewarmAll();
      setQueue([]);
      setRoomNoInput('');
      setPhoneInput('');
      setTcInput('');
      setTcNameInput('');
      setTcPhoneInput('');
      roomPrefetchRef.current = null;
      setRoomModalVisible(false);

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

  const cameraActive =
    captureMode !== 'tc' &&
    isFocused &&
    !roomModalVisible &&
    !sheetReview &&
    !saving &&
    !splitting &&
    permission?.granted;

  const queuePanel = (
    <KbsCaptureQueuePanel
      items={queue}
      onOpenImage={openQueueGallery}
      onRemove={removeFromQueue}
      removeA11yLabel={t('kbsRemoveFromListA11y')}
      layout="strip"
    />
  );

  return (
    <View style={styles.root}>
      {cameraActive ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFillObject}
          facing="back"
          mode="picture"
          /** Sürekli AF — çekim öncesi uzun settle gerekmez. */
          autofocus="on"
          enableTorch={flashOn}
          flash={flashOn ? 'on' : 'off'}
          zoom={cameraZoom}
          {...(IS_IOS && selectedLens ? { selectedLens } : {})}
          pictureSize={IS_ANDROID ? pictureSize : undefined}
          animateShutter={false}
          onAvailableLensesChanged={(event) => {
            const lenses = event?.lenses ?? [];
            setAvailableLenses(Array.isArray(lenses) ? lenses : []);
          }}
          onCameraReady={() => {
            void loadKbsCapturePictureSize(cameraRef.current)
              .then((size) => {
                if (size) setPictureSize(size);
              })
              .finally(() => setCameraReady(true));
            if (IS_IOS) {
              void cameraRef.current
                ?.getAvailableLensesAsync?.()
                .then((lenses) => {
                  if (Array.isArray(lenses) && lenses.length > 0) setAvailableLenses(lenses);
                })
                .catch(() => {});
            }
          }}
        />
      ) : (
        <View style={[styles.cameraPlaceholder, captureMode === 'tc' && styles.tcBackdrop]}>
          {captureMode === 'tc' ? null : !permission?.granted ? (
            <>
              <Text style={styles.placeholderText}>Kamera izni gerekli</Text>
              <TouchableOpacity style={styles.permBtn} onPress={() => void requestPermission()}>
                <Text style={styles.permBtnText}>İzin ver</Text>
              </TouchableOpacity>
            </>
          ) : (
            <ActivityIndicator color="#fff" size="large" />
          )}
        </View>
      )}

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topControls}>
          <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) }]}>
            <Pressable style={styles.iconBtn} onPress={goBack} accessibilityLabel="Geri">
              <Ionicons name="chevron-back" size={30} color="#fff" />
            </Pressable>
            <Text style={styles.title}>Kimlik / Pasaport</Text>
            <View style={styles.topBarRight}>
              {captureMode !== 'tc' ? (
                <Pressable
                  style={[styles.iconBtn, flashOn && styles.flashBtnOn]}
                  onPress={() => setFlashOn((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={flashOn ? t('kbsTorchOff') : t('kbsTorchOn')}
                >
                  <Ionicons name={flashOn ? 'flash' : 'flash-off'} size={22} color={flashOn ? '#fde047' : '#fff'} />
                </Pressable>
              ) : null}
              <Pressable style={styles.capturedListBtn} onPress={openHistory} accessibilityLabel={t('kbsCapturedListA11y')}>
                <Ionicons name="albums" size={18} color="#fff" />
                <Text style={styles.capturedListBtnText}>Çekilenler</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.sideModeRow}>
            <Pressable
              style={[styles.sideModeBtn, captureMode === 'front' && styles.sideModeBtnActive]}
              onPress={() => switchCaptureMode('front')}
              accessibilityRole="button"
              accessibilityState={{ selected: captureMode === 'front' }}
            >
              <Text style={[styles.sideModeBtnText, captureMode === 'front' && styles.sideModeBtnTextActive]}>
                {t('kbsCaptureSideFront')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.sideModeBtn, captureMode === 'mrz_back' && styles.sideModeBtnActive]}
              onPress={() => switchCaptureMode('mrz_back')}
              accessibilityRole="button"
              accessibilityState={{ selected: captureMode === 'mrz_back' }}
            >
              <Text style={[styles.sideModeBtnText, captureMode === 'mrz_back' && styles.sideModeBtnTextActive]}>
                {t('kbsCaptureSideMrz')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.sideModeBtn, captureMode === 'tc' && styles.sideModeBtnActive]}
              onPress={() => switchCaptureMode('tc')}
              accessibilityRole="button"
              accessibilityState={{ selected: captureMode === 'tc' }}
            >
              <Text style={[styles.sideModeBtnText, captureMode === 'tc' && styles.sideModeBtnTextActive]}>T.C.</Text>
            </Pressable>
          </View>

          {captureMode !== 'tc' ? (
            <View style={styles.distanceRow}>
              {(
                [
                  { id: 'far' as const, label: 'Uzak' },
                  { id: 'normal' as const, label: '1×' },
                  { id: 'near' as const, label: 'Yakın' },
                ] as const
              ).map((opt) => {
                const active = captureDistance === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    style={[styles.distanceBtn, active && styles.distanceBtnActive]}
                    onPress={() => setCaptureDistance(opt.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={
                      opt.id === 'far' ? 'Uzak çekim' : opt.id === 'near' ? 'Yakın çekim' : 'Normal zoom'
                    }
                  >
                    <Text style={[styles.distanceBtnText, active && styles.distanceBtnTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>
              {queue.length > 0
                ? `${queue.length} kayıt${tcQueueCount > 0 ? ` (${tcQueueCount} T.C.)` : ''} · İleri: oda veya havuz`
                : captureMode === 'tc'
                  ? 'T.C. numarası girin — tek tek veya çoklu'
                  : captureMode === 'mrz_back'
                    ? t('kbsMrzFrameHint')
                    : t('kbsFrontFrameHint')}
            </Text>
          </View>
          {importStatus && !sheetReview ? (
            <View style={styles.bulkCameraBanner}>
              <ActivityIndicator size="small" color="#0f766e" />
              <Text style={styles.bulkCameraBannerText} numberOfLines={2}>
                {importStatus}
              </Text>
            </View>
          ) : null}
          {bulkCameraHint && captureMode !== 'tc' ? (
            <View style={styles.bulkCameraBanner}>
              <Ionicons name="camera" size={14} color="#0f766e" />
              <Text style={styles.bulkCameraBannerText}>
                Peş peşe çek — her kare kuyruğa eklenir ({queue.length})
              </Text>
              <TouchableOpacity onPress={() => setBulkCameraHint(false)} hitSlop={8}>
                <Ionicons name="close" size={16} color="#0f766e" />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={styles.overlayMiddle}>
        {captureMode === 'mrz_back' ? (
          <View style={styles.mrzGuide} pointerEvents="none">
            <View style={styles.mrzGuideBand} />
          </View>
        ) : null}

        {captureMode === 'tc' ? (
          <View style={styles.tcModeShell}>
            <KeyboardAvoidingView
              style={styles.tcModeBody}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Math.max(insets.top, 12) + 48}
            >
            <ScrollView
              style={styles.tcModeScroll}
              contentContainerStyle={[
                styles.tcModeScrollContent,
                IS_ANDROID && tcKeyboardInset > 0 ? { paddingBottom: tcKeyboardInset + 12 } : null,
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.tcEntryCard}>
                <Text style={styles.tcEntryTitle}>T.C. kimlik numarası</Text>
                <Text style={styles.tcEntrySub}>Kimlik fotokopisi alınmayan misafirler için</Text>
                <TextInput
                  ref={tcInputRef}
                  style={styles.tcEntryInput}
                  value={tcInput}
                  onChangeText={(text) => setTcInput(normalizeTcInput(text))}
                  placeholder="11 haneli T.C. no"
                  placeholderTextColor="rgba(148,163,184,0.9)"
                  keyboardType="number-pad"
                  maxLength={11}
                  returnKeyType="next"
                  onSubmitEditing={() => tcNameInputRef.current?.focus()}
                  editable={!saving}
                />
                <Text style={styles.tcEntryLabel}>Ad soyad (isteğe bağlı)</Text>
                <TextInput
                  ref={tcNameInputRef}
                  style={styles.tcEntryNameInput}
                  value={tcNameInput}
                  onChangeText={setTcNameInput}
                  placeholder="Örn. Ayşe Yılmaz"
                  placeholderTextColor="rgba(148,163,184,0.9)"
                  autoCapitalize="words"
                  returnKeyType="next"
                  onSubmitEditing={() => tcPhoneInputRef.current?.focus()}
                  editable={!saving}
                />
                <Text style={styles.tcEntryLabel}>Telefon numarası (isteğe bağlı)</Text>
                <View style={styles.tcEntryPhoneWrap}>
                  <Ionicons name="call-outline" size={18} color="#94a3b8" style={styles.tcEntryPhoneIcon} />
                  <TextInput
                    ref={tcPhoneInputRef}
                    style={styles.tcEntryPhoneInput}
                    value={tcPhoneInput}
                    onChangeText={onTcPhoneChange}
                    placeholder="Örn. 0555 123 45 67"
                    placeholderTextColor="rgba(148,163,184,0.9)"
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    textContentType="telephoneNumber"
                    returnKeyType="done"
                    onSubmitEditing={() =>
                      addTcToQueue({ tc: tcInput, fullName: tcNameInput, phone: tcPhoneInput })
                    }
                    editable={!saving}
                    maxLength={24}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.tcInlineAddBtn, (saving || tcInput.length < 11) && styles.tcInlineAddBtnDisabled]}
                  onPress={() => addTcToQueue()}
                  disabled={saving || tcInput.length < 11}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#fff" />
                  <Text style={styles.tcInlineAddBtnText}>Listeye ekle</Text>
                </TouchableOpacity>
              </View>

              {queue.length > 0 ? queuePanel : (
                <View style={styles.tcEmptyList}>
                  <Ionicons name="list-outline" size={22} color="rgba(148,163,184,0.8)" />
                  <Text style={styles.tcEmptyListText}>Eklenen T.C. ve kimlikler burada listelenir</Text>
                </View>
              )}
            </ScrollView>
            </KeyboardAvoidingView>
          </View>
        ) : null}

        {captureMode !== 'tc' ? queuePanel : null}
        </View>

        {captureMode === 'tc' ? (
          <View style={[styles.bottomBar, styles.bottomBarTc, { marginBottom: Math.max(insets.bottom + 8, 16) }]}>
            <View style={styles.bottomSide} />
            <View style={styles.bottomCenter}>
              <TouchableOpacity
                style={[styles.tcAddBtn, (saving || tcInput.length < 11) && styles.tcAddBtnDisabled]}
                onPress={() => addTcToQueue()}
                disabled={saving || tcInput.length < 11}
                accessibilityLabel="T.C. ekle"
              >
                <Ionicons name="add-circle" size={28} color="#fff" />
                <Text style={styles.tcAddBtnText}>Ekle</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.bottomSide, styles.bottomSideEnd]}>
              <TouchableOpacity style={styles.forwardBtn} onPress={openRoomModal} disabled={saving}>
                <Ionicons name="arrow-forward" size={22} color="#fff" />
                <Text style={styles.forwardText}>İleri</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={[styles.bottomBar, { marginBottom: Math.max(insets.bottom + 96, 124) }]}>
            <View style={styles.bottomSide}>
              <TouchableOpacity
                style={[styles.galleryBtn, bulkCameraHint && styles.galleryBtnActive]}
                onPress={openBulkMenu}
                disabled={saving}
                accessibilityLabel={t('kbsAddFromGalleryA11y')}
              >
                <Ionicons name="layers" size={20} color="#fff" />
                <Text style={styles.galleryBtnLabel}>Toplu</Text>
                <Text style={styles.galleryBtnHint}>Galeri sınırsız</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.bottomCenter}>
              <TouchableOpacity
                style={[styles.captureBtn, bulkCameraHint && styles.captureBtnBulk]}
                onPress={() => void handleCapture()}
                disabled={saving || !cameraReady || !cameraActive}
                accessibilityLabel={t('kbsCaptureIdA11y')}
              >
                <View style={styles.captureInner} />
                {bulkCameraHint && queue.length > 0 ? (
                  <View style={styles.captureCountBadge}>
                    <Text style={styles.captureCountText}>{queue.length}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            </View>
            <View style={[styles.bottomSide, styles.bottomSideEnd]}>
              <TouchableOpacity style={styles.forwardBtn} onPress={openRoomModal} disabled={saving}>
                <Ionicons name="arrow-forward" size={22} color="#fff" />
                <Text style={styles.forwardText}>İleri</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {(saving || splitting) && !roomModalVisible && !sheetReview ? (
        <View style={styles.busyMask}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.busyText}>
            {importStatus || (splitting ? t('kbsSplitting') : saveStatus || t('kbsSaving'))}
          </Text>
        </View>
      ) : null}

      {sheetReview ? (
        <KbsSheetSplitReviewModal
          visible
          sheetUri={sheetReview.sheetUri}
          detect={sheetReview.detect}
          suggestedCount={sheetReview.suggestedCount}
          progressLabel={sheetReview.progressLabel}
          onConfirm={(count) => finishSheetReview(count)}
          onSkip={() => finishSheetReview(null)}
        />
      ) : null}

      <Modal
        visible={roomModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeRoomModal}
        {...ROOM_MODAL_ANDROID_PROPS}
      >
        <KeyboardAvoidingView
          style={styles.roomModalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.roomModalDismiss} onPress={closeRoomModal} />
          <View
            style={[
              styles.roomSheet,
              {
                paddingBottom: androidKeyboardInset > 0 ? 16 : Math.max(insets.bottom, 16),
              },
              IS_ANDROID && androidKeyboardInset > 0 ? { marginBottom: androidKeyboardInset } : null,
            ]}
          >
            <View style={styles.roomSheetHandle} />
            <View style={styles.roomSheetHeader}>
              <Pressable style={styles.roomSheetBack} onPress={closeRoomModal} disabled={saving}>
                <Ionicons name="chevron-back" size={24} color="#0f172a" />
                <Text style={styles.roomSheetBackText}>Geri</Text>
              </Pressable>
              <Text style={styles.roomSheetTitle}>Oda ve iletişim</Text>
              <View style={styles.roomSheetBack} />
            </View>

            <ScrollView
              style={styles.roomSheetScroll}
              contentContainerStyle={styles.roomSheetScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.roomSheetSub}>
                {queue.length} kayıt — kaydetmeden önce oda numarası zorunludur
                {tcQueueCount > 0 ? ` (${tcQueueCount} T.C. kaydı)` : ''}
              </Text>

              <Text style={styles.roomLabel}>
                Oda numarası <Text style={styles.roomLabelRequired}>*</Text>
              </Text>
              <TextInput
                ref={roomInputRef}
                style={styles.roomInput}
                value={roomNoInput}
                onChangeText={onRoomNoChange}
                placeholder="Örn. 204"
                placeholderTextColor="#94a3b8"
                keyboardType={Platform.OS === 'ios' ? 'ascii-capable' : 'default'}
                autoCorrect={false}
                autoCapitalize="characters"
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => phoneInputRef.current?.focus()}
                editable={!saving}
                maxLength={24}
              />

              <Text style={styles.phoneFieldLabel}>Telefon numarası (isteğe bağlı)</Text>
              <View style={styles.phoneFieldWrap}>
                <Ionicons name="call-outline" size={18} color="#64748b" style={styles.phoneFieldIcon} />
                <TextInput
                  ref={phoneInputRef}
                  style={styles.phoneFieldInput}
                  value={phoneInput}
                  onChangeText={onPhoneChange}
                  placeholder="Örn. 0555 123 45 67"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (!saving && roomNoTrimmed) void finalizeBulk();
                  }}
                  editable={!saving}
                  maxLength={24}
                />
              </View>
              <Text style={styles.phoneFieldHint}>
                Numara yazılırsa pasaport bilgileri kartında “Ara” ve “WhatsApp” butonları görünür.
                Her kimlik kayıt sonrası derin OCR ile taranır.
              </Text>
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.roomSubmitBtn,
                (saving || !roomNoTrimmed) && styles.roomSubmitBtnDisabled,
              ]}
              onPress={() => {
                if (roomNoTrimmed) void finalizeBulk();
                else Alert.alert(t('kbsRoomNumberTitle'), t('kbsRoomNumberBody'));
              }}
              disabled={saving || !roomNoTrimmed}
            >
              {saving ? (
                <View style={styles.roomSubmitInner}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.roomSubmitText}>{saveStatus || 'Kaydediliyor…'}</Text>
                </View>
              ) : (
                <Text style={styles.roomSubmitText}>Onayla ve kaydet</Text>
              )}
            </TouchableOpacity>

            {saving ? (
              <View style={styles.roomSavingOverlay} pointerEvents="none">
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.roomSavingText}>{saveStatus || 'Kaydediliyor…'}</Text>
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
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
  root: { flex: 1, backgroundColor: '#000' },
  cameraPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  placeholderText: { color: '#fff', fontWeight: '700' },
  permBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  permBtnText: { color: '#fff', fontWeight: '800' },
  overlay: { flex: 1, justifyContent: 'flex-start' },
  topControls: { width: '100%' },
  overlayMiddle: { flex: 1, minHeight: 0, width: '100%' },
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
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashBtnOn: {
    backgroundColor: 'rgba(250, 204, 21, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(253, 224, 71, 0.7)',
  },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  capturedListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(37, 99, 235, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  capturedListBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  title: { color: '#fff', fontSize: 15, fontWeight: '800' },
  stepBadge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    marginTop: 8,
  },
  stepBadgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  sideModeRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 8,
    marginTop: 6,
    padding: 4,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sideModeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },
  sideModeBtnActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.95)',
  },
  sideModeBtnText: { color: 'rgba(255,255,255,0.75)', fontWeight: '800', fontSize: 13 },
  sideModeBtnTextActive: { color: '#fff' },
  distanceRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 6,
    marginTop: 8,
    padding: 3,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  distanceBtn: {
    minWidth: 64,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    alignItems: 'center',
  },
  distanceBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  distanceBtnText: { color: 'rgba(255,255,255,0.8)', fontWeight: '800', fontSize: 12 },
  distanceBtnTextActive: { color: '#0f172a' },
  tcBackdrop: { backgroundColor: '#0f172a' },
  tcModeShell: { flex: 1, minHeight: 0 },
  tcModeBody: { flex: 1, minHeight: 0 },
  tcModeScroll: { flex: 1 },
  tcModeScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 14,
  },
  tcEntryPanel: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  tcEntryCard: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'rgba(15,23,42,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.28)',
    gap: 8,
  },
  tcEntryTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  tcEntrySub: { color: 'rgba(203,213,225,0.9)', fontSize: 12, lineHeight: 17, marginBottom: 4 },
  tcEntryLabel: { color: 'rgba(226,232,240,0.92)', fontSize: 12, fontWeight: '700', marginTop: 4 },
  tcEntryInput: {
    backgroundColor: 'rgba(30,41,59,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.45)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 2,
    textAlign: 'center',
  },
  tcEntryNameInput: {
    backgroundColor: 'rgba(30,41,59,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 11 : 9,
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  tcEntryPhoneWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30,41,59,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  tcEntryPhoneIcon: { marginRight: 8 },
  tcEntryPhoneInput: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 11 : 9,
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.3,
  },
  tcAddBtn: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 3,
    borderColor: 'rgba(147,197,253,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37,99,235,0.55)',
    gap: 2,
  },
  tcAddBtnDisabled: { opacity: 0.45 },
  tcAddBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  tcInlineAddBtn: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(37,99,235,0.9)',
  },
  tcInlineAddBtnDisabled: { opacity: 0.45 },
  tcInlineAddBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  tcEmptyList: {
    marginTop: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    backgroundColor: 'rgba(30,41,59,0.45)',
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 8,
  },
  tcEmptyListText: {
    color: 'rgba(203,213,225,0.85)',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  mrzGuide: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: SCREEN_H * 0.22,
  },
  mrzGuideBand: {
    width: '92%',
    height: SCREEN_H * 0.2,
    borderWidth: 2,
    borderColor: 'rgba(52, 211, 153, 0.9)',
    borderRadius: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  idFrontGuide: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SCREEN_H * 0.12,
  },
  idFrontGuideFrame: {
    width: '88%',
    flex: 1,
    maxHeight: SCREEN_H * 0.52,
    borderWidth: 2,
    borderRadius: 14,
    backgroundColor: 'rgba(37, 99, 235, 0.06)',
  },
  idFrontGuideSpinner: { position: 'absolute', bottom: SCREEN_H * 0.16 },
  queueStrip: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, flexDirection: 'row' },
  queueStripCard: {
    width: 68,
    height: 68,
    marginRight: 8,
    position: 'relative',
  },
  queueStripThumbWrap: {
    width: 62,
    height: 62,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  queueStripThumb: { width: '100%', height: '100%' },
  queueStripRemove: {
    position: 'absolute',
    top: -4,
    right: -2,
    backgroundColor: 'rgba(220,38,38,0.95)',
    borderRadius: 12,
    padding: 0,
  },
  queueStripIndex: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    minWidth: 18,
    textAlign: 'center',
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 4,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    width: '100%',
    marginTop: 'auto',
  },
  bottomBarTc: { marginTop: 8 },
  bottomSide: { flex: 1, justifyContent: 'center', alignItems: 'flex-start' },
  bottomSideEnd: { alignItems: 'flex-end' },
  bottomCenter: { width: 96, alignItems: 'center', justifyContent: 'center' },
  galleryBtn: {
    width: 72,
    height: 64,
    borderRadius: 14,
    backgroundColor: 'rgba(13, 148, 136, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    gap: 1,
  },
  galleryBtnActive: {
    backgroundColor: 'rgba(8, 110, 98, 0.95)',
    borderWidth: 1.5,
    borderColor: '#5eead4',
  },
  galleryBtnLabel: { color: '#fff', fontSize: 11, fontWeight: '800' },
  galleryBtnHint: { color: 'rgba(255,255,255,0.85)', fontSize: 8, fontWeight: '600' },
  bulkCameraBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    backgroundColor: 'rgba(240, 253, 250, 0.95)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#99f6e4',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  bulkCameraBannerText: { flex: 1, fontSize: 12, fontWeight: '700', color: '#0f766e' },
  captureBtnBulk: {
    borderWidth: 3,
    borderColor: '#5eead4',
  },
  captureCountBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0d9488',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  captureCountText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  forwardBtn: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  forwardText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  captureBtn: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  captureInner: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#fff' },
  liveAutoBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(37, 99, 235, 0.45)',
  },
  liveAutoBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', marginTop: 2, textAlign: 'center' },
  bottomCenterLive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  busyMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  busyText: { color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center', paddingHorizontal: 24 },
  roomModalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  roomModalDismiss: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  roomSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    position: 'relative',
  },
  roomSavingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  roomSavingText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  roomSheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: 8,
  },
  roomSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  roomSheetBack: { flexDirection: 'row', alignItems: 'center', minWidth: 70, gap: 2 },
  roomSheetBackText: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  roomSheetTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  roomSheetSub: { fontSize: 14, color: '#475569', marginBottom: 12, lineHeight: 20 },
  roomLabel: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  roomLabelRequired: { color: '#dc2626' },
  roomInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: 1,
    textAlign: 'center',
    minHeight: 44,
  },
  phoneFieldLabel: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 18, marginBottom: 8 },
  phoneFieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  phoneFieldIcon: { marginRight: 8 },
  phoneFieldInput: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 12 : 9,
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: 0.5,
  },
  phoneFieldHint: { marginTop: 8, fontSize: 12, color: '#64748b', lineHeight: 17 },
  roomSheetScroll: { flexGrow: 0, flexShrink: 1, maxHeight: SCREEN_H * 0.62 },
  roomSheetScrollContent: { paddingBottom: 8 },
  roomSubmitBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomSubmitBtnDisabled: { opacity: 0.5 },
  roomSubmitInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roomSubmitText: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
});
