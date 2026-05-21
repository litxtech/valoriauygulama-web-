import { ReactNode, useMemo, useRef } from 'react';
import { Animated, I18nManager, PanResponder, Platform, StyleSheet, View } from 'react-native';

type SwipeToDeleteProps = {
  children: ReactNode;
  enabled?: boolean;
  onSwipeDelete: () => void;
};

/** Distance (px) finger must travel in the delete direction to confirm delete */
const SWIPE_TRIGGER = 52;
/** Max visual slide while dragging */
const SWIPE_MAX = 76;

function swipeTowardDeleteDx(gestureDx: number) {
  // LTR: sola kaydır → negatif dx. RTL: ekranda aynı “sil” yönü çoğu listede ters.
  return I18nManager.isRTL ? gestureDx : -gestureDx;
}

export function SwipeToDelete({
  children,
  enabled = true,
  onSwipeDelete,
}: SwipeToDeleteProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const lockedRef = useRef(false);

  const resetPosition = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 6,
    }).start();
  };

  const triggerDelete = () => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    const out = I18nManager.isRTL ? SWIPE_MAX : -SWIPE_MAX;
    Animated.sequence([
      Animated.timing(translateX, {
        toValue: out,
        duration: 110,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start(() => {
      lockedRef.current = false;
      onSwipeDelete();
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (!enabled || lockedRef.current) return false;
          const toward = swipeTowardDeleteDx(gesture.dx);
          // Hafif çapraz kaydırmada dikey listeyi çalmaması için yatay baskı
          return (
            toward > MOVE_ACTIVATE && Math.abs(gesture.dx) > Math.abs(gesture.dy) + MOVE_DOMINANCE
          );
        },
        onPanResponderMove: (_, gesture) => {
          const toward = swipeTowardDeleteDx(gesture.dx);
          const clamped = Math.max(0, Math.min(SWIPE_MAX, toward));
          const tx = I18nManager.isRTL ? clamped : -clamped;
          translateX.setValue(tx);
        },
        onPanResponderRelease: (_, gesture) => {
          if (swipeTowardDeleteDx(gesture.dx) >= SWIPE_TRIGGER) {
            triggerDelete();
            return;
          }
          resetPosition();
        },
        onPanResponderTerminate: resetPosition,
      }),
    [enabled, onSwipeDelete]
  );

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.swipeLayer, { transform: [{ translateX }] }]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  swipeLayer: {
    zIndex: 1,
  },
});
