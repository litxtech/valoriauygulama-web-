import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { hapticImpactLight, hapticSelection } from '@/lib/hapticsSafe';

const BTN = 62;
const HOST = 78;

type Mode = 'talk' | 'talking' | 'join' | 'retry' | 'disabled';

type Props = {
  mode: Mode;
  talkLabel: string;
  joinLabel: string;
  connecting?: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
  onJoinOrRetry: () => void;
};

function PulseRing({ active, delay }: { active: boolean; delay: number }) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      v.stopAnimation();
      v.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, {
          toValue: 1,
          duration: 1200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, delay, v]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.32] }) }],
        },
      ]}
    />
  );
}

export function PttTalkPad({
  mode,
  talkLabel,
  joinLabel,
  connecting,
  onPressIn,
  onPressOut,
  onJoinOrRetry,
}: Props) {
  const talking = mode === 'talking';
  const canTalk = mode === 'talk' || talking;
  const ctaMode = mode === 'join' || mode === 'retry';
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    if (!canTalk) return;
    hapticImpactLight();
    Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 42, bounciness: 0 }).start();
    onPressIn();
  };

  const pressOut = () => {
    if (!canTalk) return;
    hapticSelection();
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 8 }).start();
    onPressOut();
  };

  const gradient: [string, string] = talking
    ? ['#16a34a', '#22c55e']
    : ctaMode
      ? ['#0f766e', '#14b8a6']
      : ['#0284c7', '#38bdf8'];

  return (
    <View style={styles.btnHost}>
      {talking ? (
        <>
          <PulseRing active delay={0} />
          <PulseRing active delay={360} />
        </>
      ) : null}
      <Animated.View style={{ transform: [{ scale: talking ? 1.04 : scale }] }}>
        <Pressable
          onPressIn={canTalk ? pressIn : undefined}
          onPressOut={canTalk ? pressOut : undefined}
          onPress={ctaMode ? onJoinOrRetry : undefined}
          disabled={mode === 'disabled'}
          accessibilityRole="button"
          accessibilityLabel={ctaMode ? joinLabel : talkLabel}
          style={[styles.btnShadow, mode === 'disabled' && styles.btnDisabled]}
        >
          <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btn}>
            {connecting && !talking ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons
                name={talking ? 'mic' : ctaMode ? 'enter-outline' : 'mic-outline'}
                size={26}
                color="#fff"
              />
            )}
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  btnHost: {
    width: HOST,
    height: HOST,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: BTN,
    height: BTN,
    left: (HOST - BTN) / 2,
    top: (HOST - BTN) / 2,
    borderRadius: BTN / 2,
    borderWidth: 2,
    borderColor: 'rgba(74,222,128,0.75)',
  },
  btnShadow: {
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 10,
  },
  btn: {
    width: BTN,
    height: BTN,
    borderRadius: BTN / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  btnDisabled: { opacity: 0.4 },
});
