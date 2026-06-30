import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ListRenderItem,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { KbsCaptureGalleryItem } from '@/lib/kbsCaptureGallery';
import { prefetchImageUrls } from '@/lib/prefetchImageUrls';

type Props = {
  /** Geriye uyumluluk — tek görsel */
  uri?: string | null;
  items?: KbsCaptureGalleryItem[];
  initialIndex?: number;
  visible?: boolean;
  onClose: () => void;
};

const { width: WIN_W, height: WIN_H } = Dimensions.get('window');
const MIN_SCALE = 1;
const MAX_SCALE = 8;
const DOUBLE_TAP_SCALE = 3.5;

function touchDistance(touches: { pageX: number; pageY: number }[]): number {
  if (touches.length < 2) return 0;
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/** İki dokunuşun orta noktası — ekran merkezine göreli (focal point). */
function touchMidpointRelCenter(touches: { pageX: number; pageY: number }[], centerX: number, centerY: number) {
  if (touches.length >= 2) {
    const [a, b] = touches;
    return { x: (a.pageX + b.pageX) / 2 - centerX, y: (a.pageY + b.pageY) / 2 - centerY };
  }
  if (touches.length === 1) {
    return { x: touches[0].pageX - centerX, y: touches[0].pageY - centerY };
  }
  return { x: 0, y: 0 };
}

function PinchZoomImage({
  uri,
  pageH,
  onZoomChange,
}: {
  uri: string;
  pageH: number;
  onZoomChange?: (zoomed: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const pinchStartDist = useRef(0);
  const pinchStartScale = useRef(1);
  const pinchFocal0 = useRef({ x: 0, y: 0 });
  const pinchT0 = useRef({ x: 0, y: 0 });
  const lastTouch = useRef({ x: 0, y: 0 });
  const panActive = useRef(false);
  const lastTapAt = useRef(0);
  const pendingDoubleTap = useRef(false);
  const wasZoomed = useRef(false);

  // Görsel konteynerinin merkezi tam ekranın merkezindedir.
  const centerX = WIN_W / 2;
  const centerY = WIN_H / 2;

  const clampScale = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));

  const boundX = (s: number) => (WIN_W * (s - 1)) / 2;
  const boundY = (s: number) => (pageH * (s - 1)) / 2;
  const clampX = (v: number, s: number) => Math.min(boundX(s), Math.max(-boundX(s), v));
  const clampY = (v: number, s: number) => Math.min(boundY(s), Math.max(-boundY(s), v));

  const reportZoom = useCallback(
    (s: number) => {
      const zoomed = s > MIN_SCALE + 0.02;
      if (zoomed !== wasZoomed.current) {
        wasZoomed.current = zoomed;
        onZoomChange?.(zoomed);
      }
    },
    [onZoomChange]
  );

  const clampTranslate = useCallback(
    (s: number) => {
      const maxX = (WIN_W * (s - 1)) / 2;
      const maxY = (pageH * (s - 1)) / 2;
      translateX.value = Math.min(maxX, Math.max(-maxX, translateX.value));
      translateY.value = Math.min(maxY, Math.max(-maxY, translateY.value));
      savedTx.value = translateX.value;
      savedTy.value = translateY.value;
    },
    [pageH, translateX, translateY, savedTx, savedTy]
  );

  const resetZoom = useCallback(() => {
    scale.value = withSpring(1);
    savedScale.value = 1;
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    savedTx.value = 0;
    savedTy.value = 0;
    reportZoom(1);
  }, [scale, savedScale, translateX, translateY, savedTx, savedTy, reportZoom]);

  const zoomIn = useCallback(() => {
    const next = clampScale(savedScale.value * 1.35);
    scale.value = next;
    savedScale.value = next;
    reportZoom(next);
  }, [scale, savedScale, reportZoom]);

  const zoomOut = useCallback(() => {
    const next = clampScale(savedScale.value / 1.35);
    scale.value = next;
    savedScale.value = next;
    if (next <= MIN_SCALE + 0.02) {
      translateX.value = 0;
      translateY.value = 0;
      savedTx.value = 0;
      savedTy.value = 0;
    } else {
      clampTranslate(next);
    }
    reportZoom(next);
  }, [scale, savedScale, translateX, translateY, savedTx, savedTy, clampTranslate, reportZoom]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) return true;
        const now = Date.now();
        // İkinci dokunuş kısa süre içinde geldiyse: çift dokunma
        if (now - lastTapAt.current < 280) {
          pendingDoubleTap.current = true;
          return true;
        }
        lastTapAt.current = now;
        pendingDoubleTap.current = false;
        return false;
      },
      onMoveShouldSetPanResponder: (evt) => {
        if (evt.nativeEvent.touches.length >= 2) return true;
        return savedScale.value > MIN_SCALE + 0.05;
      },
      // Yakınlaştırılmışken hareketi dış galeri kaydırmasından önce yakala.
      onMoveShouldSetPanResponderCapture: (evt) => {
        if (evt.nativeEvent.touches.length >= 2) return true;
        return savedScale.value > MIN_SCALE + 0.05;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;

        // Çift dokunma: dokunulan noktaya yakınlaş / sıfırla
        if (pendingDoubleTap.current && touches.length < 2) {
          pendingDoubleTap.current = false;
          lastTapAt.current = 0;
          if (scale.value > MIN_SCALE + 0.05) {
            resetZoom();
          } else {
            const focal = touchMidpointRelCenter(
              touches.length ? touches : [{ pageX: evt.nativeEvent.pageX, pageY: evt.nativeEvent.pageY }],
              centerX,
              centerY
            );
            const next = DOUBLE_TAP_SCALE;
            // Dokunulan içerik noktasını parmağın altında tut
            const tx = clampX(focal.x * (1 - next), next);
            const ty = clampY(focal.y * (1 - next), next);
            scale.value = withSpring(next);
            savedScale.value = next;
            translateX.value = withSpring(tx);
            translateY.value = withSpring(ty);
            savedTx.value = tx;
            savedTy.value = ty;
            reportZoom(next);
          }
          return;
        }

        if (touches.length >= 2) {
          pinchStartDist.current = touchDistance(touches);
          pinchStartScale.current = savedScale.value;
          pinchFocal0.current = touchMidpointRelCenter(touches, centerX, centerY);
          pinchT0.current = { x: savedTx.value, y: savedTy.value };
          panActive.current = false;
        } else {
          // Tek parmak kaydırması artımlı çalışır; ilk harekette tohumlanır.
          panActive.current = false;
        }
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;

        // İki parmak: odak noktasına göre yakınlaştır (parmakların ortası sabit kalır)
        if (touches.length >= 2 && pinchStartDist.current > 8) {
          const d = touchDistance(touches);
          const s1 = clampScale(pinchStartScale.current * (d / pinchStartDist.current));
          const focalNow = touchMidpointRelCenter(touches, centerX, centerY);
          // Başlangıçta odak altındaki içerik noktası
          const cX = (pinchFocal0.current.x - pinchT0.current.x) / pinchStartScale.current;
          const cY = (pinchFocal0.current.y - pinchT0.current.y) / pinchStartScale.current;
          scale.value = s1;
          translateX.value = clampX(focalNow.x - s1 * cX, s1);
          translateY.value = clampY(focalNow.y - s1 * cY, s1);
          panActive.current = false; // tek parmağa geçişte yeniden tohumla
          return;
        }

        // Tek parmak: yakınlaştırılmışken görseli artımlı sürükle
        if (scale.value > MIN_SCALE + 0.02 && touches.length === 1) {
          const t = touches[0];
          if (!panActive.current) {
            lastTouch.current = { x: t.pageX, y: t.pageY };
            panActive.current = true;
            return;
          }
          const dx = t.pageX - lastTouch.current.x;
          const dy = t.pageY - lastTouch.current.y;
          lastTouch.current = { x: t.pageX, y: t.pageY };
          const s = scale.value;
          translateX.value = clampX(translateX.value + dx, s);
          translateY.value = clampY(translateY.value + dy, s);
        }
      },
      onPanResponderRelease: () => {
        savedScale.value = scale.value;
        savedTx.value = translateX.value;
        savedTy.value = translateY.value;
        pinchStartDist.current = 0;
        pendingDoubleTap.current = false;
        panActive.current = false;
        if (scale.value < MIN_SCALE) {
          resetZoom();
        } else {
          reportZoom(scale.value);
        }
      },
      onPanResponderTerminate: () => {
        pinchStartDist.current = 0;
        pendingDoubleTap.current = false;
        panActive.current = false;
      },
    })
  ).current;

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={[styles.zoomStage, { height: pageH }]}>
      <View style={styles.pinchArea} {...panResponder.panHandlers}>
        <Animated.View style={[styles.imageWrap, imageStyle]}>
          <Image source={{ uri }} style={{ width: WIN_W, height: pageH }} contentFit="contain" />
        </Animated.View>
      </View>
      <View style={styles.zoomControls} pointerEvents="box-none">
        <TouchableOpacity style={styles.zoomBtn} onPress={zoomOut} accessibilityLabel="Uzaklaştır">
          <Ionicons name="remove" size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.zoomBtn} onPress={resetZoom} accessibilityLabel="Sıfırla">
          <Ionicons name="scan-outline" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.zoomBtn} onPress={zoomIn} accessibilityLabel="Yakınlaştır">
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const GalleryPage = memo(function GalleryPage({
  item,
  pageW,
  pageH,
  onZoomChange,
}: {
  item: KbsCaptureGalleryItem;
  pageW: number;
  pageH: number;
  onZoomChange?: (zoomed: boolean) => void;
}) {
  return (
    <View style={{ width: pageW, height: pageH }}>
      <PinchZoomImage uri={item.uri} pageH={pageH} onZoomChange={onZoomChange} />
      <View style={styles.imageOverlay} pointerEvents="none">
        <View style={styles.roomBadge}>
          <Ionicons name="bed-outline" size={16} color="#fff" />
          <Text style={styles.roomBadgeText}>Oda {item.roomNumber?.trim() || '—'}</Text>
        </View>
        {item.label ? (
          <Text style={styles.nameOverlay} numberOfLines={2}>
            {item.label}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

export function KbsZoomImageModal({ uri, items, initialIndex = 0, visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<KbsCaptureGalleryItem>>(null);
  const didInitialScroll = useRef(false);
  const [page, setPage] = useState(0);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const list = useMemo(() => {
    if (items?.length) return items;
    if (uri) return [{ id: uri, uri }] satisfies KbsCaptureGalleryItem[];
    return [];
  }, [items, uri]);

  const isOpen = visible ?? (!!uri || list.length > 0);
  const pageW = WIN_W;
  const pageH = WIN_H;

  const handleZoomChange = useCallback((zoomed: boolean) => {
    setScrollEnabled(!zoomed);
  }, []);

  const getItemLayout = useCallback(
    (_: ArrayLike<KbsCaptureGalleryItem> | null | undefined, index: number) => ({
      length: pageW,
      offset: pageW * index,
      index,
    }),
    [pageW]
  );

  useEffect(() => {
    if (!isOpen) {
      didInitialScroll.current = false;
      setScrollEnabled(true);
      return;
    }
    const i = Math.min(Math.max(0, initialIndex), Math.max(0, list.length - 1));
    setPage(i);
    void prefetchImageUrls(
      list.slice(Math.max(0, i - 1), i + 2).map((item) => item.uri),
      3
    );
    if (didInitialScroll.current) return;
    didInitialScroll.current = true;
    if (list.length <= 1) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: i * pageW, animated: false });
    });
  }, [isOpen, initialIndex, list, pageW]);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.round(x / Math.max(1, pageW));
      const clamped = Math.min(Math.max(0, next), Math.max(0, list.length - 1));
      setPage(clamped);
      void prefetchImageUrls(
        list.slice(Math.max(0, clamped - 1), clamped + 2).map((item) => item.uri),
        3
      );
    },
    [list, pageW]
  );

  const renderItem: ListRenderItem<KbsCaptureGalleryItem> = useCallback(
    ({ item }) => (
      <GalleryPage item={item} pageW={pageW} pageH={pageH} onZoomChange={handleZoomChange} />
    ),
    [pageH, pageW, handleZoomChange]
  );

  if (!isOpen || list.length === 0) return null;

  const current = list[page];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        {list.length > 1 ? (
          <FlatList
            ref={listRef}
            data={list}
            horizontal
            pagingEnabled
            scrollEnabled={scrollEnabled}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumEnd}
            style={StyleSheet.absoluteFill}
            contentContainerStyle={{ alignItems: 'center' }}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            getItemLayout={getItemLayout}
            initialNumToRender={1}
            maxToRenderPerBatch={1}
            windowSize={3}
            removeClippedSubviews
          />
        ) : current ? (
          <View style={StyleSheet.absoluteFill}>
            <GalleryPage item={current} pageW={pageW} pageH={pageH} onZoomChange={handleZoomChange} />
          </View>
        ) : null}

        <View style={[styles.toolbar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          {list.length > 1 ? (
            <View style={styles.counterPill}>
              <Text style={styles.counterText}>
                {page + 1} / {list.length}
              </Text>
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Kapat">
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        <Text style={[styles.hint, { paddingBottom: Math.max(insets.bottom, 16) }]} pointerEvents="none">
          {list.length > 1
            ? 'Yana kaydırarak diğer kimliklere geçin · İki parmakla yakınlaştırın · Çift dokun: sıfırla'
            : 'İki parmakla yakınlaştırın / uzaklaştırın · Çift dokun: sıfırla'}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  toolbar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 10,
  },
  counterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  counterText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  closeBtn: { padding: 6, marginLeft: 'auto' },
  zoomStage: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pinchArea: { flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' },
  imageWrap: { justifyContent: 'center', alignItems: 'center' },
  zoomControls: {
    position: 'absolute',
    bottom: 48,
    flexDirection: 'row',
    gap: 12,
    alignSelf: 'center',
  },
  zoomBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 108,
    gap: 6,
  },
  roomBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(13, 148, 136, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  roomBadgeText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  nameOverlay: {
    alignSelf: 'flex-start',
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    maxWidth: '88%',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  hint: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
});
