import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { chatTheme } from '@/constants/chatTheme';

type Props = {
  children: ReactNode;
  onReply: () => void;
  enabled?: boolean;
};

const THRESHOLD = 48;
const MAX_DRAG = 72;
const REPLY_BTN = 36;
/** Yatay parmağın pan'i devralmadan önceki minimum hareketi (px). */
const MOVE_ACTIVATE = 6;
/** Yatay hareketin dikeyi geçmesi gereken pay — dikey kaydırmaya yol verir. */
const MOVE_DOMINANCE = 4;

/** Sağa kaydır → yanıtla (Telegram tarzı). Dikey listeyi engellemez. */
export function SwipeReplyRow({ children, onReply, enabled = true }: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [replyVisible, setReplyVisible] = useState(false);

  // Stale closure'u önlemek için en güncel değerleri ref'te tut.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;
  const armedRef = useRef(false);

  const finishSwipe = (triggerReply: boolean) => {
    if (triggerReply) onReplyRef.current();
    armedRef.current = false;
    setReplyVisible(false);
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 28, bounciness: 8 }).start();
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Başlangıçta yakalama — çocuk dokunuşları (uzun bas, medya) çalışsın.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => {
          if (!enabledRef.current) return false;
          // Sağa, yeterince yatay ve dikeyden baskın → pan'i devral.
          return (
            g.dx > MOVE_ACTIVATE &&
            Math.abs(g.dx) > Math.abs(g.dy) + MOVE_DOMINANCE
          );
        },
        onPanResponderMove: (_, g) => {
          const x = Math.min(MAX_DRAG, Math.max(0, g.dx));
          translateX.setValue(x);
          setReplyVisible(x >= 18);
          if (!armedRef.current && x >= THRESHOLD) {
            armedRef.current = true;
            void Haptics.selectionAsync().catch(() => {});
          } else if (armedRef.current && x < THRESHOLD) {
            armedRef.current = false;
          }
        },
        onPanResponderRelease: (_, g) => {
          finishSwipe(g.dx >= THRESHOLD);
        },
        onPanResponderTerminate: () => finishSwipe(false),
        // Dikey kaydırma başlarsa listeye bırak.
        onPanResponderTerminationRequest: () => true,
      }),
    // translateX sabit (useRef), bağımlılık yok — handler'lar ref üzerinden güncel kalır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const iconOpacity = translateX.interpolate({
    inputRange: [0, 14, THRESHOLD],
    outputRange: [0, 0.4, 1],
    extrapolate: 'clamp',
  });

  const iconScale = translateX.interpolate({
    inputRange: [0, THRESHOLD],
    outputRange: [0.55, 1],
    extrapolate: 'clamp',
  });

  const handleReplyPress = () => {
    if (!enabled || !replyVisible) return;
    finishSwipe(true);
  };

  return (
    <View style={styles.wrap}>
      <Animated.View
        pointerEvents={replyVisible ? 'auto' : 'none'}
        style={[
          styles.replySlot,
          { opacity: iconOpacity, transform: [{ scale: iconScale }] },
        ]}
      >
        <Pressable
          onPress={handleReplyPress}
          disabled={!enabled || !replyVisible}
          hitSlop={8}
          style={({ pressed }) => [styles.replyBtn, pressed && styles.replyBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Reply"
        >
          <Ionicons name="arrow-undo" size={17} color={chatTheme.accent} />
        </Pressable>
      </Animated.View>

      <Animated.View
        style={[styles.slide, { transform: [{ translateX }] }]}
        {...(enabled ? pan.panHandlers : {})}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'hidden',
    width: '100%',
  },
  replySlot: {
    position: 'absolute',
    left: 10,
    top: 0,
    bottom: 0,
    width: REPLY_BTN,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
  },
  replyBtn: {
    width: REPLY_BTN,
    height: REPLY_BTN,
    borderRadius: REPLY_BTN / 2,
    backgroundColor: chatTheme.selected,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(42,171,238,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  replyBtnPressed: {
    backgroundColor: 'rgba(42,171,238,0.22)',
    transform: [{ scale: 0.94 }],
  },
  slide: {
    zIndex: 1,
    width: '100%',
  },
});
