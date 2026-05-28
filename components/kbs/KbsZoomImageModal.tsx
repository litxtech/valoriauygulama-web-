import { useCallback, useRef } from 'react';
import {
  Dimensions,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

type Props = {
  uri: string | null;
  onClose: () => void;
};

const { width: WIN_W, height: WIN_H } = Dimensions.get('window');
const IMAGE_H = WIN_H * 0.72;
const MIN_SCALE = 1;
const MAX_SCALE = 5;

function touchDistance(touches: { pageX: number; pageY: number }[]): number {
  if (touches.length < 2) return 0;
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

function PinchZoomImage({ uri }: { uri: string }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const pinchStartDist = useRef(0);
  const pinchStartScale = useRef(1);
  const panStart = useRef({ x: 0, y: 0 });
  const lastTapAt = useRef(0);

  const clampScale = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));

  const resetZoom = useCallback(() => {
    scale.value = withSpring(1);
    savedScale.value = 1;
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    savedTx.value = 0;
    savedTy.value = 0;
  }, [scale, savedScale, translateX, translateY, savedTx, savedTy]);

  const zoomIn = useCallback(() => {
    const next = clampScale(savedScale.value * 1.35);
    scale.value = next;
    savedScale.value = next;
  }, [scale, savedScale]);

  const zoomOut = useCallback(() => {
    const next = clampScale(savedScale.value / 1.35);
    scale.value = next;
    savedScale.value = next;
    if (next <= MIN_SCALE + 0.02) {
      translateX.value = 0;
      translateY.value = 0;
      savedTx.value = 0;
      savedTy.value = 0;
    }
  }, [scale, savedScale, translateX, translateY, savedTx, savedTy]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const now = Date.now();
        if (now - lastTapAt.current < 280) {
          if (scale.value > MIN_SCALE + 0.05) resetZoom();
          else {
            const next = 2.5;
            scale.value = withSpring(next);
            savedScale.value = next;
          }
          lastTapAt.current = 0;
          return;
        }
        lastTapAt.current = now;

        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          pinchStartDist.current = touchDistance(touches);
          pinchStartScale.current = savedScale.value;
        } else {
          panStart.current = { x: savedTx.value, y: savedTy.value };
        }
      },
      onPanResponderMove: (evt, gesture) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2 && pinchStartDist.current > 8) {
          const d = touchDistance(touches);
          scale.value = clampScale(pinchStartScale.current * (d / pinchStartDist.current));
          return;
        }
        if (scale.value > MIN_SCALE + 0.02) {
          translateX.value = panStart.current.x + gesture.dx;
          translateY.value = panStart.current.y + gesture.dy;
        }
      },
      onPanResponderRelease: () => {
        savedScale.value = scale.value;
        savedTx.value = translateX.value;
        savedTy.value = translateY.value;
        pinchStartDist.current = 0;
        if (scale.value < MIN_SCALE) {
          resetZoom();
        }
      },
      onPanResponderTerminate: () => {
        pinchStartDist.current = 0;
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
    <View style={styles.zoomStage}>
      <View style={styles.pinchArea} {...panResponder.panHandlers}>
        <Animated.View style={[styles.imageWrap, imageStyle]}>
          <Image source={{ uri }} style={{ width: WIN_W, height: IMAGE_H }} contentFit="contain" />
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

export function KbsZoomImageModal({ uri, onClose }: Props) {
  if (!uri) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.toolbar}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        <PinchZoomImage uri={uri} />

        <Text style={styles.hint}>İki parmakla yakınlaştırın / uzaklaştırın · Çift dokun: sıfırla</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 48,
    paddingHorizontal: 16,
  },
  closeBtn: { padding: 6 },
  zoomStage: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pinchArea: { flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' },
  imageWrap: { justifyContent: 'center', alignItems: 'center' },
  zoomControls: {
    position: 'absolute',
    bottom: 12,
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
  hint: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
});
