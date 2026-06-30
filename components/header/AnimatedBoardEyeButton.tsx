import { useEffect, useRef } from 'react';
import {
  Animated,
  AppState,
  Easing,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const HIT = 40;
const EYE = 28;
const IRIS = 15;
const PUPIL = 7;
const TRAVEL = 2.5;

type Props = {
  active: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
  color?: string;
};

function CuteEye({ eyeX, irisColor }: { eyeX: Animated.Value | null; irisColor: string }) {
  const irisBody =
    Platform.OS === 'android' ? (
      <View style={[styles.iris, { backgroundColor: irisColor }]}>
        <View style={styles.pupil} />
        <View style={styles.shine} />
      </View>
    ) : (
      <LinearGradient
        colors={['#93c5fd', irisColor, '#1d4ed8']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={styles.iris}
      >
        <View style={styles.pupil} />
        <View style={styles.shine} />
      </LinearGradient>
    );

  return (
    <View style={styles.chip}>
      <View style={styles.sclera}>
        {eyeX ? (
          <Animated.View style={[styles.irisWrap, { transform: [{ translateX: eyeX }] }]}>{irisBody}</Animated.View>
        ) : (
          <View style={styles.irisWrap}>{irisBody}</View>
        )}
      </View>
    </View>
  );
}

export function AnimatedBoardEyeButton({
  active,
  onPress,
  style,
  accessibilityLabel,
  color = '#3b82f6',
}: Props) {
  const eyeX = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (Platform.OS === 'android') {
      loopRef.current?.stop();
      eyeX.setValue(0);
      return;
    }
    const legMs = active ? 520 : 760;
    const buildLoop = () =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(eyeX, {
            toValue: -TRAVEL,
            duration: legMs,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(eyeX, {
            toValue: TRAVEL,
            duration: legMs * 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(eyeX, {
            toValue: 0,
            duration: legMs,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );

    const start = () => {
      loopRef.current?.stop();
      eyeX.setValue(0);
      loopRef.current = buildLoop();
      loopRef.current.start();
    };
    const stop = () => {
      loopRef.current?.stop();
      eyeX.setValue(0);
    };

    // Uygulama arka plandayken animasyonu durdur — boşuna GPU/pil tüketimini önle
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });
    if (AppState.currentState === 'active') start();

    return () => {
      stop();
      sub.remove();
    };
  }, [active, eyeX]);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.hit, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <CuteEye eyeX={Platform.OS === 'android' ? null : eyeX} irisColor={color} />
      {active ? <View style={styles.badge} pointerEvents="none" /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: HIT,
    height: HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    width: EYE + 6,
    height: EYE + 6,
    borderRadius: (EYE + 6) / 2,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#dbeafe',
  },
  sclera: {
    width: EYE,
    height: EYE * 0.72,
    borderRadius: EYE / 2,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  irisWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iris: {
    width: IRIS,
    height: IRIS,
    borderRadius: IRIS / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pupil: {
    width: PUPIL,
    height: PUPIL,
    borderRadius: PUPIL / 2,
    backgroundColor: '#1e293b',
  },
  shine: {
    position: 'absolute',
    top: 2,
    left: 3,
    width: 5,
    height: 4,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
});
