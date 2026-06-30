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
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
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
import { loadKbsCapturePictureSize, takeKbsIdPicture } from '@/lib/kbsCaptureCamera';
import { autoSplitKbsSheetImage } from '@/lib/kbsCaptureSheetSplit';
import { useTranslation } from 'react-i18next';
import type { KbsCaptureSide } from '@/lib/kbsCaptureOcr';
import {
  cancelKbsCapturePrewarm,
  clearKbsCapturePrewarmAll,
  startKbsCapturePrewarm,
  warmKbsCaptureOpsContext,
} from '@/lib/kbsCapturePrewarm';

type CaptureItem = {
  id: string;
  imageUri: string;
  captureSource: 'camera' | 'gallery';
  captureSide: KbsCaptureSide;
};

const CAPTURE_HISTORY = '/staff/kbs/capture-history' as Href;
const IS_ANDROID = Platform.OS === 'android';
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
  if (Platform.OS === 'android' && u.startsWith('/') && !u.startsWith('content://')) {
    return `file://${u}`;
  }
  if (
    (Platform.OS === 'android' && u.startsWith('content://')) ||
    (Platform.OS === 'ios' && (u.startsWith('ph://') || u.startsWith('assets-library://')))
  ) {
    return copyUriToCacheForUpload(u, 'image');
  }
  return u;
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
  const [queue, setQueue] = useState<CaptureItem[]>([]);
  const [cameraReady, setCameraReady] = useState(false);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const [roomNoInput, setRoomNoInput] = useState('');
  const [roomModalVisible, setRoomModalVisible] = useState(false);
  const [guestNamesById, setGuestNamesById] = useState<Record<string, { firstName: string; lastName: string }>>(
    {}
  );
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [captureSide, setCaptureSide] = useState<KbsCaptureSide>('front');
  const [androidKeyboardInset, setAndroidKeyboardInset] = useState(0);
  const captureLockRef = useRef(false);

  const setGuestName = useCallback((itemId: string, field: 'firstName' | 'lastName', value: string) => {
    setGuestNamesById((prev) => ({
      ...prev,
      [itemId]: {
        firstName: field === 'firstName' ? value : (prev[itemId]?.firstName ?? ''),
        lastName: field === 'lastName' ? value : (prev[itemId]?.lastName ?? ''),
      },
    }));
  }, []);

  const roomNoTrimmed = roomNoInput.trim();

  const queueGalleryItems = useMemo(
    () =>
      queue.map((item, index) => ({
        id: item.id,
        uri: item.imageUri,
        roomNumber: roomNoTrimmed || null,
        label: `Kimlik ${index + 1}`,
      })),
    [queue, roomNoTrimmed]
  );

  const openQueueGallery = useCallback(
    (itemId: string) => {
      const idx = queue.findIndex((item) => item.id === itemId);
      if (idx >= 0) setGalleryIndex(idx);
    },
    [queue]
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

  /** Android: KeyboardAvoidingView height titremesini önlemek için klavye yüksekliği manuel. */
  useEffect(() => {
    if (!IS_ANDROID || !roomModalVisible) {
      setAndroidKeyboardInset(0);
      return;
    }
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setAndroidKeyboardInset(Math.max(0, e.endCoordinates?.height ?? 0));
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setAndroidKeyboardInset(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [roomModalVisible]);

  const goBack = useCallback(() => {
    navigateStaffBack(router, navigation as NavigationProp<ParamListBase>, pathname, STAFF_TABS_FALLBACK);
  }, [navigation, pathname, router]);

  const openHistory = useCallback(() => {
    router.push(CAPTURE_HISTORY as never);
    prefetchHistory();
  }, [prefetchHistory, router]);

  const enqueueImageUris = useCallback(
    (uris: string[], captureSource: CaptureItem['captureSource'], side: KbsCaptureSide) => {
      if (uris.length === 0) return;
      const added = uris.map((imageUri) => ({
        id: newCaptureId(),
        imageUri,
        captureSource,
        captureSide: side,
      }));
      setQueue((q) => [...q, ...added]);
      for (const row of added) {
        startKbsCapturePrewarm({
          itemId: row.id,
          imageUri: row.imageUri,
          captureSide: row.captureSide,
          captureSource: row.captureSource,
        });
      }
    },
    []
  );

  const enqueueCapturedImage = useCallback(
    async (uri: string, captureSource: CaptureItem['captureSource'], opts?: { skipSplit?: boolean }) => {
      setSplitting(true);
      try {
        const parts = opts?.skipSplit ? [uri] : await autoSplitKbsSheetImage(uri);
        enqueueImageUris(parts.length > 0 ? parts : [uri], captureSource, captureSide);
      } catch (e) {
        Alert.alert(t('kbsCropError'), e instanceof Error ? e.message : t('kbsCropErrorBody'));
      } finally {
        setSplitting(false);
      }
    },
    [captureSide, enqueueImageUris]
  );

  const removeFromQueue = useCallback((itemId: string) => {
    cancelKbsCapturePrewarm(itemId);
    setQueue((q) => q.filter((item) => item.id !== itemId));
    setGuestNamesById((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
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
      await enqueueCapturedImage(shot.uri, 'camera');
    } catch (e) {
      Alert.alert(t('error'), e instanceof Error ? e.message : t('kbsCaptureFailed'));
    } finally {
      captureLockRef.current = false;
    }
  };

  const handlePickGallery = async () => {
    if (captureLockRef.current) return;
    try {
      captureLockRef.current = true;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        allowsMultipleSelection: true,
        selectionLimit: 20,
      });
      if (res.canceled || !res.assets?.length) return;
      for (const asset of res.assets) {
        if (!asset.uri) continue;
        const fileUri = await uriForQueue(asset.uri);
        await enqueueCapturedImage(fileUri, 'gallery');
      }
    } catch (e) {
      Alert.alert(t('error'), e instanceof Error ? e.message : t('kbsGalleryFailed'));
    } finally {
      captureLockRef.current = false;
    }
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
    setSaveStatus(`${count} kimlik kaydediliyor…`);
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

      const saveItems: KbsCaptureSaveItem[] = items.map((item, index) => {
        const draft = guestNamesById[item.id];
        const fn = draft?.firstName?.trim();
        const ln = draft?.lastName?.trim();
        return {
          imageUri: item.imageUri,
          index,
          clientId: item.id,
          captureSource: item.captureSource,
          captureSide: item.captureSide,
          firstName: fn || null,
          lastName: ln || null,
        };
      });

      setSaveStatus(t('kbsSaveFinishing'));
      const saved = await saveKbsCaptureItemsParallel(saveItems, room, (msg) => setSaveStatus(msg));
      const savedDocIds = saved.map((s) => s.guestDocumentId);
      markKbsCapturesJustSaved(savedDocIds);

      clearKbsCapturePrewarmAll();
      setQueue([]);
      setRoomNoInput('');
      setGuestNamesById({});
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

  const cameraActive = isFocused && !roomModalVisible && !saving && permission?.granted;

  const queueStrip = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.queueStrip}
    >
      {(queue ?? []).map((item, index) => (
        <View key={item.id} style={styles.queueStripCard}>
          <Pressable style={styles.queueStripThumbWrap} onPress={() => openQueueGallery(item.id)}>
            <Image source={{ uri: item.imageUri }} style={styles.queueStripThumb} contentFit="cover" />
            <Text style={styles.queueStripIndex}>{index + 1}</Text>
          </Pressable>
          <TouchableOpacity
            style={styles.queueStripRemove}
            onPress={() => removeFromQueue(item.id)}
            hitSlop={8}
            accessibilityLabel={t('kbsRemoveFromListA11y')}
          >
            <Ionicons name="close-circle" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );

  return (
    <View style={styles.root}>
      {cameraActive ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFillObject}
          facing="back"
          mode="picture"
          /** Android: sürekli AF; iOS: tek kilit. */
          autofocus={IS_ANDROID ? 'off' : 'on'}
          pictureSize={IS_ANDROID ? pictureSize : undefined}
          animateShutter={false}
          onCameraReady={() => {
            void loadKbsCapturePictureSize(cameraRef.current)
              .then((size) => {
                if (size) setPictureSize(size);
              })
              .finally(() => setCameraReady(true));
          }}
        />
      ) : (
        <View style={styles.cameraPlaceholder}>
          {!permission?.granted ? (
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
        <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) }]}>
          <Pressable style={styles.iconBtn} onPress={goBack} accessibilityLabel="Geri">
            <Ionicons name="chevron-back" size={30} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Kimlik / Pasaport</Text>
          <View style={styles.topBarRight}>
            <Pressable style={styles.capturedListBtn} onPress={openHistory} accessibilityLabel={t('kbsCapturedListA11y')}>
              <Ionicons name="albums" size={18} color="#fff" />
              <Text style={styles.capturedListBtnText}>Çekilenler</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.sideModeRow}>
          <Pressable
            style={[styles.sideModeBtn, captureSide === 'front' && styles.sideModeBtnActive]}
            onPress={() => setCaptureSide('front')}
            accessibilityRole="button"
            accessibilityState={{ selected: captureSide === 'front' }}
          >
            <Text style={[styles.sideModeBtnText, captureSide === 'front' && styles.sideModeBtnTextActive]}>
              {t('kbsCaptureSideFront')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.sideModeBtn, captureSide === 'mrz_back' && styles.sideModeBtnActive]}
            onPress={() => setCaptureSide('mrz_back')}
            accessibilityRole="button"
            accessibilityState={{ selected: captureSide === 'mrz_back' }}
          >
            <Text style={[styles.sideModeBtnText, captureSide === 'mrz_back' && styles.sideModeBtnTextActive]}>
              {t('kbsCaptureSideMrz')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>
            {queue.length > 0
              ? `${queue.length} belge · İleri: oda no`
              : captureSide === 'mrz_back'
                ? t('kbsMrzFrameHint')
                : t('kbsFrontFrameHint')}
          </Text>
        </View>

        {captureSide === 'mrz_back' ? (
          <View style={styles.mrzGuide} pointerEvents="none">
            <View style={styles.mrzGuideBand} />
          </View>
        ) : null}

        {queueStrip}

        <View style={[styles.bottomBar, { marginBottom: Math.max(insets.bottom + 96, 124) }]}>
          <View style={styles.bottomSide}>
            <TouchableOpacity
              style={styles.galleryBtn}
              onPress={() => void handlePickGallery()}
              disabled={saving || splitting}
              accessibilityLabel={t('kbsAddFromGalleryA11y')}
            >
              <Ionicons name="images-outline" size={22} color="#fff" />
              <Text style={styles.galleryBtnLabel}>Galeri</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.bottomCenter}>
            <TouchableOpacity
              style={styles.captureBtn}
              onPress={() => void handleCapture()}
              disabled={saving || splitting || !cameraReady || !cameraActive}
              accessibilityLabel={t('kbsCaptureIdA11y')}
            >
              <View style={styles.captureInner} />
            </TouchableOpacity>
          </View>
          <View style={[styles.bottomSide, styles.bottomSideEnd]}>
            <TouchableOpacity style={styles.forwardBtn} onPress={openRoomModal} disabled={saving}>
              <Ionicons name="arrow-forward" size={22} color="#fff" />
              <Text style={styles.forwardText}>İleri</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {(saving || splitting) && !roomModalVisible ? (
        <View style={styles.busyMask}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.busyText}>
            {splitting ? t('kbsSplitting') : saveStatus || t('kbsSaving')}
          </Text>
        </View>
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
              <Text style={styles.roomSheetTitle}>Oda ve misafir</Text>
              <View style={styles.roomSheetBack} />
            </View>

            <ScrollView
              style={styles.roomSheetScroll}
              contentContainerStyle={styles.roomSheetScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.roomSheetSub}>
                {queue.length} kimlik — oda numarası zorunlu; ad / soyad isteğe bağlı
              </Text>

              <Text style={styles.roomLabel}>Oda numarası</Text>
              <TextInput
                ref={roomInputRef}
                style={styles.roomInput}
                value={roomNoInput}
                onChangeText={onRoomNoChange}
                keyboardType={Platform.OS === 'ios' ? 'ascii-capable' : 'default'}
                autoCorrect={false}
                autoCapitalize="characters"
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                returnKeyType="done"
                blurOnSubmit={false}
                onSubmitEditing={() => {
                  if (roomNoTrimmed && !saving) void finalizeBulk();
                }}
                editable={!saving}
                maxLength={24}
              />
              <Text
                style={[styles.roomHint, roomNoTrimmed.length === 0 && styles.roomHintHidden]}
                accessibilityElementsHidden={roomNoTrimmed.length === 0}
                importantForAccessibility={roomNoTrimmed.length === 0 ? 'no-hide-descendants' : 'yes'}
              >
                {roomNoTrimmed.length > 0 ? `Kayıt oda no: ${roomNoTrimmed}` : ' '}
              </Text>

              <Text style={styles.nameSectionTitle}>Ad / soyad (isteğe bağlı)</Text>
              <Text style={styles.nameSectionHint}>
                Boş bırakırsanız belge arka planda okunur; ad / soyad geçmişte güncellenir.
              </Text>

              {queue.length === 1 ? (
                <View style={styles.nameRowPair}>
                  <View style={styles.nameField}>
                    <Text style={styles.nameFieldLabel}>Ad</Text>
                    <TextInput
                      style={styles.nameInput}
                      value={guestNamesById[queue[0]!.id]?.firstName ?? ''}
                      onChangeText={(v) => setGuestName(queue[0]!.id, 'firstName', v)}
                      placeholder={t('kbsOptional')}
                      placeholderTextColor="#94a3b8"
                      autoCapitalize="words"
                      editable={!saving}
                    />
                  </View>
                  <View style={styles.nameField}>
                    <Text style={styles.nameFieldLabel}>Soyad</Text>
                    <TextInput
                      style={styles.nameInput}
                      value={guestNamesById[queue[0]!.id]?.lastName ?? ''}
                      onChangeText={(v) => setGuestName(queue[0]!.id, 'lastName', v)}
                      placeholder={t('kbsOptional')}
                      placeholderTextColor="#94a3b8"
                      autoCapitalize="words"
                      editable={!saving}
                    />
                  </View>
                </View>
              ) : (
                queue.map((item, index) => (
                  <View key={item.id} style={styles.nameCard}>
                    <Pressable onPress={() => openQueueGallery(item.id)}>
                      <Image source={{ uri: item.imageUri }} style={styles.roomThumb} contentFit="cover" />
                    </Pressable>
                    <View style={styles.nameCardFields}>
                      <Text style={styles.nameCardIndex}>Kimlik {index + 1}</Text>
                      <TextInput
                        style={styles.nameInput}
                        value={guestNamesById[item.id]?.firstName ?? ''}
                        onChangeText={(v) => setGuestName(item.id, 'firstName', v)}
                        placeholder="Ad (isteğe bağlı)"
                        placeholderTextColor="#94a3b8"
                        autoCapitalize="words"
                        editable={!saving}
                      />
                      <TextInput
                        style={[styles.nameInput, styles.nameInputLast]}
                        value={guestNamesById[item.id]?.lastName ?? ''}
                        onChangeText={(v) => setGuestName(item.id, 'lastName', v)}
                        placeholder={t('kbsLastNameOptional')}
                        placeholderTextColor="#94a3b8"
                        autoCapitalize="words"
                        editable={!saving}
                      />
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.roomSubmitBtn, (!roomNoTrimmed || saving) && styles.roomSubmitBtnDisabled]}
              onPress={() => void finalizeBulk()}
              disabled={!roomNoTrimmed || saving}
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
  overlay: { flex: 1, justifyContent: 'space-between' },
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
    marginTop: 10,
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
  },
  bottomSide: { flex: 1, justifyContent: 'center', alignItems: 'flex-start' },
  bottomSideEnd: { alignItems: 'flex-end' },
  bottomCenter: { width: 96, alignItems: 'center', justifyContent: 'center' },
  galleryBtn: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    gap: 2,
  },
  galleryBtnLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 9, fontWeight: '700' },
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
  roomHint: { marginTop: 10, minHeight: 20, fontSize: 14, fontWeight: '600', color: '#0369a1', textAlign: 'center' },
  roomHintHidden: { opacity: 0 },
  roomSheetScroll: { flexGrow: 0, flexShrink: 1, maxHeight: SCREEN_H * 0.62 },
  roomSheetScrollContent: { paddingBottom: 8 },
  nameSectionTitle: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  nameSectionHint: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
  },
  nameRowPair: { flexDirection: 'row', gap: 10 },
  nameField: { flex: 1 },
  nameFieldLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6 },
  nameInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 9,
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  nameInputLast: { marginTop: 8 },
  nameCard: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  nameCardFields: { flex: 1, minWidth: 0 },
  nameCardIndex: { fontSize: 12, fontWeight: '800', color: '#475569', marginBottom: 6 },
  roomThumb: {
    width: 64,
    height: 84,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f1f5f9',
  },
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
