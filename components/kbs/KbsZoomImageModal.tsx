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
const MAX_SCALE = 12;
const DOUBLE_TAP_SCALE = 4.5;
/** Butonla yakınlaştırma — kimlik yazısı okunacak kadar hızlı adım. */
const BUTTON_ZOOM_STEP = 1.85;
const DOUBLE_TAP_MS = 320;

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
  bottomInset,
}: {
  uri: string;
  pageH: number;
  onZoomChange?: (zoomed: boolean) => void;
  bottomInset: number;
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
  const lastTapPos = useRef({ x: 0, y: 0 });
  const pendingDoubleTap = useRef(false);
  const wasZoomed = useRef(false);
  const [scaleLabel, setScaleLabel] = useState('1×');

  const centerX = WIN_W / 2;
  const centerY = WIN_H / 2;

  const clampScale = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));

  const boundX = (s: number) => (WIN_W * (s - 1)) / 2;
  const boundY = (s: number) => (pageH * (s - 1)) / 2;
  const clampX = (v: number, s: number) => Math.min(boundX(s), Math.max(-boundX(s), v));
  const clampY = (v: number, s: number) => Math.min(boundY(s), Math.max(-boundY(s), v));

  const reportZoom = useCallback(
    (s: number) => {
      const rounded = Math.round(s * 10) / 10;
      setScaleLabel(rounded <= 1.05 ? '1×' : `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}×`);
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

  const applyScaleAtFocal = useCallback(
    (next: number, focalX: number, focalY: number, animated: boolean) => {
      const s0 = Math.max(savedScale.value, MIN_SCALE);
      const s1 = clampScale(next);
      const contentX = (focalX - savedTx.value) / s0;
      const contentY = (focalY - savedTy.value) / s0;
      const tx = clampX(focalX - s1 * contentX, s1);
      const ty = clampY(focalY - s1 * contentY, s1);

      if (animated) {
        scale.value = withSpring(s1, { damping: 18, stiffness: 220 });
        translateX.value = withSpring(tx, { damping: 18, stiffness: 220 });
        translateY.value = withSpring(ty, { damping: 18, stiffness: 220 });
      } else {
        scale.value = s1;
        translateX.value = tx;
        translateY.value = ty;
      }
      savedScale.value = s1;
      savedTx.value = tx;
      savedTy.value = ty;
      reportZoom(s1);
    },
    [scale, savedScale, translateX, translateY, savedTx, savedTy, reportZoom]
  );

  const resetZoom = useCallback(() => {
    scale.value = withSpring(1, { damping: 18, stiffness: 220 });
    savedScale.value = 1;
    translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
    translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
    savedTx.value = 0;
    savedTy.value = 0;
    reportZoom(1);
  }, [scale, savedScale, translateX, translateY, savedTx, savedTy, reportZoom]);

  const zoomIn = useCallback(() => {
    const next = clampScale(savedScale.value * BUTTON_ZOOM_STEP);
    applyScaleAtFocal(next, 0, 0, true);
  }, [savedScale, applyScaleAtFocal]);

  const zoomOut = useCallback(() => {
    const next = clampScale(savedScale.value / BUTTON_ZOOM_STEP);
    if (next <= MIN_SCALE + 0.02) {
      resetZoom();
      return;
    }
    applyScaleAtFocal(next, 0, 0, true);
  }, [savedScale, applyScaleAtFocal, resetZoom]);

  const wantsPinch = (touches: { length: number }) => touches.length >= 2;
  const isZoomed = () => savedScale.value > MIN_SCALE + 0.05;

  const panResponder = useRef(
    PanResponder.create({
      // İki parmak veya yakınlaştırılmış tek parmak — FlatList’ten önce yakala.
      onStartShouldSetPanResponderCapture: (evt) =>
        wantsPinch(evt.nativeEvent.touches) || isZoomed(),
      onMoveShouldSetPanResponderCapture: (evt) => {
        if (wantsPinch(evt.nativeEvent.touches)) return true;
        if (!isZoomed()) return false;
        const { dx, dy } = evt.nativeEvent;
        return Math.abs(dx) > 2 || Math.abs(dy) > 2;
      },
      onStartShouldSetPanResponder: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (wantsPinch(touches)) return true;
        if (isZoomed()) return true;

        const now = Date.now();
        const x = evt.nativeEvent.pageX;
        const y = evt.nativeEvent.pageY;
        const nearPrev =
          Math.hypot(x - lastTapPos.current.x, y - lastTapPos.current.y) < 48;
        if (now - lastTapAt.current < DOUBLE_TAP_MS && nearPrev) {
          pendingDoubleTap.current = true;
          return true;
        }
        lastTapAt.current = now;
        lastTapPos.current = { x, y };
        pendingDoubleTap.current = false;
        return false;
      },
      onMoveShouldSetPanResponder: (evt) => {
        if (wantsPinch(evt.nativeEvent.touches)) return true;
        return isZoomed();
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;

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
            applyScaleAtFocal(DOUBLE_TAP_SCALE, focal.x, focal.y, true);
          }
          return;
        }

        if (touches.length >= 2) {
          pinchStartDist.current = touchDistance(touches);
          pinchStartScale.current = Math.max(savedScale.value, MIN_SCALE);
          pinchFocal0.current = touchMidpointRelCenter(touches, centerX, centerY);
          pinchT0.current = { x: savedTx.value, y: savedTy.value };
          panActive.current = false;
          onZoomChange?.(true);
        } else {
          panActive.current = false;
        }
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length >= 2) {
          const d = touchDistance(touches);
          if (pinchStartDist.current < 8) {
            pinchStartDist.current = d;
            pinchStartScale.current = Math.max(savedScale.value, MIN_SCALE);
            pinchFocal0.current = touchMidpointRelCenter(touches, centerX, centerY);
            pinchT0.current = { x: savedTx.value, y: savedTy.value };
            return;
          }
          const s1 = clampScale(pinchStartScale.current * (d / pinchStartDist.current));
          const focalNow = touchMidpointRelCenter(touches, centerX, centerY);
          const cX = (pinchFocal0.current.x - pinchT0.current.x) / pinchStartScale.current;
          const cY = (pinchFocal0.current.y - pinchT0.current.y) / pinchStartScale.current;
          scale.value = s1;
          translateX.value = clampX(focalNow.x - s1 * cX, s1);
          translateY.value = clampY(focalNow.y - s1 * cY, s1);
          panActive.current = false;
          return;
        }

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
        if (scale.value < MIN_SCALE + 0.05) {
          resetZoom();
        } else {
          clampTranslate(scale.value);
          reportZoom(scale.value);
        }
      },
      onPanResponderTerminate: () => {
        savedScale.value = scale.value;
        savedTx.value = translateX.value;
        savedTy.value = translateY.value;
        pinchStartDist.current = 0;
        pendingDoubleTap.current = false;
        panActive.current = false;
        reportZoom(scale.value);
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

      <View
        style={[styles.zoomControls, { bottom: Math.max(bottomInset, 12) + 52 }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.zoomBtn}
          onPress={zoomIn}
          accessibilityLabel="Yakınlaştır"
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
        <View style={styles.scalePill}>
          <Text style={styles.scalePillText}>{scaleLabel}</Text>
        </View>
        <TouchableOpacity
          style={styles.zoomBtn}
          onPress={zoomOut}
          accessibilityLabel="Uzaklaştır"
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="remove" size={28} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.zoomBtn, styles.zoomBtnSecondary]}
          onPress={resetZoom}
          accessibilityLabel="Sıfırla"
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="scan-outline" size={22} color="#fff" />
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
  bottomInset,
}: {
  item: KbsCaptureGalleryItem;
  pageW: number;
  pageH: number;
  onZoomChange?: (zoomed: boolean) => void;
  bottomInset: number;
}) {
  return (
    <View style={{ width: pageW, height: pageH }}>
      <PinchZoomImage
        uri={item.uri}
        pageH={pageH}
        onZoomChange={onZoomChange}
        bottomInset={bottomInset}
      />
      <View style={[styles.imageOverlay, { bottom: Math.max(bottomInset, 12) + 120 }]} pointerEvents="none">
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
      <GalleryPage
        item={item}
        pageW={pageW}
        pageH={pageH}
        onZoomChange={handleZoomChange}
        bottomInset={insets.bottom}
      />
    ),
    [pageH, pageW, handleZoomChange, insets.bottom]
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
            <GalleryPage
              item={current}
              pageW={pageW}
              pageH={pageH}
              onZoomChange={handleZoomChange}
              bottomInset={insets.bottom}
            />
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

        <Text style={[styles.hint, { paddingBottom: Math.max(insets.bottom, 12) }]} pointerEvents="none">
          {list.length > 1
            ? 'Sağdaki + ile yakınlaştırın · Çift dokun · İki parmak · Yana kaydır'
            : 'Sağdaki + ile yakınlaştırın · Çift dokun veya iki parmak'}
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
    right: 14,
    flexDirection: 'column',
    gap: 10,
    alignItems: 'center',
    zIndex: 12,
  },
  zoomBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(13, 148, 136, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  zoomBtnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  scalePill: {
    minWidth: 44,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
  },
  scalePillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  imageOverlay: {
    position: 'absolute',
    left: 16,
    right: 80,
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
    right: 72,
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    textAlign: 'left',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
});
