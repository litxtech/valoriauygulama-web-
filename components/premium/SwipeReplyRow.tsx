import { useRef, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  children: ReactNode;
  onReply: () => void;
  enabled?: boolean;
};

const THRESHOLD = 56;
const MAX_DRAG = 72;

/** Sağa kaydır → yanıtla (Telegram tarzı) */
export function SwipeReplyRow({ children, onReply, enabled = true }: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const triggered = useRef(false);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => enabled && g.dx > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        const x = Math.min(MAX_DRAG, Math.max(0, g.dx));
        translateX.setValue(x);
        if (x >= THRESHOLD && !triggered.current) {
          triggered.current = true;
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx >= THRESHOLD) onReply();
        triggered.current = false;
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 28, bounciness: 8 }).start();
      },
      onPanResponderTerminate: () => {
        triggered.current = false;
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  return (
    <View style={styles.wrap}>
      <View style={styles.iconSlot}>
        <Ionicons name="arrow-undo" size={20} color="#6366f1" />
      </View>
      <Animated.View style={{ transform: [{ translateX }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  iconSlot: {
    position: 'absolute',
    left: 8,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    opacity: 0.85,
  },
});
