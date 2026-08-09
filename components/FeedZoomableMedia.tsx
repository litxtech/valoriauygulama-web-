import { type ReactNode, useCallback, useMemo, useRef } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_MS = 280;
const DOUBLE_TAP_SCALE = 2.4;

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onDismiss?: () => void;
  enabled?: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Pinch / pan / çift dokunuş zoom — native gesture-handler gerekmez.
 */
export function FeedZoomableMedia({ children, style, onDismiss, enabled = true }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;

  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const pinchStartScale = useRef(1);
  const pinchStartDist = useRef(0);
  const panStartTx = useRef(0);
  const panStartTy = useRef(0);
  const lastTapAt = useRef(0);
  const moved = useRef(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  }, []);

  const setScale = useCallback(
    (v: number, animate = false) => {
      const next = clamp(v, MIN_SCALE, MAX_SCALE);
      scaleRef.current = next;
      if (animate) {
        Animated.timing(scale, { toValue: next, duration: 180, useNativeDriver: true }).start();
      } else {
        scale.setValue(next);
      }
    },
    [scale]
  );

  const setTranslate = useCallback(
    (x: number, y: number, animate = false) => {
      txRef.current = x;
      tyRef.current = y;
      if (animate) {
        Animated.parallel([
          Animated.timing(tx, { toValue: x, duration: 180, useNativeDriver: true }),
          Animated.timing(ty, { toValue: y, duration: 180, useNativeDriver: true }),
        ]).start();
      } else {
        tx.setValue(x);
        ty.setValue(y);
      }
    },
    [tx, ty]
  );

  const resetZoom = useCallback(() => {
    setScale(1, true);
    setTranslate(0, 0, true);
  }, [setScale, setTranslate]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => enabled,
        onMoveShouldSetPanResponder: (_, g) =>
          enabled &&
          (g.numberActiveTouches >= 2 ||
            scaleRef.current > 1.05 ||
            Math.abs(g.dx) > 2 ||
            Math.abs(g.dy) > 2),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          moved.current = false;
          clearDismissTimer();
          const touches = e.nativeEvent.touches;
          if (touches.length >= 2) {
            const a = { x: touches[0]!.pageX, y: touches[0]!.pageY };
            const b = { x: touches[1]!.pageX, y: touches[1]!.pageY };
            pinchStartDist.current = distance(a, b) || 1;
            pinchStartScale.current = scaleRef.current;
          } else {
            panStartTx.current = txRef.current;
            panStartTy.current = tyRef.current;
          }
        },
        onPanResponderMove: (e, g) => {
          const touches = e.nativeEvent.touches;
          if (touches.length >= 2) {
            moved.current = true;
            const a = { x: touches[0]!.pageX, y: touches[0]!.pageY };
            const b = { x: touches[1]!.pageX, y: touches[1]!.pageY };
            const dist = distance(a, b) || 1;
            setScale(pinchStartScale.current * (dist / (pinchStartDist.current || 1)));
            return;
          }
          if (scaleRef.current > 1.05) {
            if (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2) moved.current = true;
            setTranslate(panStartTx.current + g.dx, panStartTy.current + g.dy);
          } else if (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6) {
            moved.current = true;
          }
        },
        onPanResponderRelease: () => {
          if (scaleRef.current < 1.05) {
            resetZoom();
            if (moved.current) return;

            const now = Date.now();
            if (now - lastTapAt.current < DOUBLE_TAP_MS) {
              clearDismissTimer();
              lastTapAt.current = 0;
              setScale(DOUBLE_TAP_SCALE, true);
              return;
            }

            lastTapAt.current = now;
            clearDismissTimer();
            dismissTimer.current = setTimeout(() => {
              dismissTimer.current = null;
              if (scaleRef.current <= 1.05) onDismiss?.();
            }, DOUBLE_TAP_MS);
            return;
          }

          if (!moved.current) {
            const now = Date.now();
            if (now - lastTapAt.current < DOUBLE_TAP_MS) {
              lastTapAt.current = 0;
              resetZoom();
            } else {
              lastTapAt.current = now;
            }
          }
        },
      }),
    [clearDismissTimer, enabled, onDismiss, resetZoom, setScale, setTranslate]
  );

  return (
    <View style={[styles.root, style]} collapsable={false} {...panResponder.panHandlers}>
      <Animated.View
        style={[
          styles.stage,
          { transform: [{ translateX: tx }, { translateY: ty }, { scale }] },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  stage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
