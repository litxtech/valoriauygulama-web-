import { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Animated, useWindowDimensions, AppState } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { lobbyTheme } from '@/constants/lobbyTheme';

const SPARKLE_SEEDS = [
  { top: 0.1, left: 0.14, size: 3, delay: 0 },
  { top: 0.18, left: 0.82, size: 2, delay: 400 },
  { top: 0.32, left: 0.06, size: 2, delay: 800 },
  { top: 0.44, left: 0.76, size: 4, delay: 200 },
  { top: 0.58, left: 0.22, size: 2, delay: 1200 },
  { top: 0.72, left: 0.88, size: 3, delay: 600 },
  { top: 0.26, left: 0.48, size: 2, delay: 1000 },
  { top: 0.64, left: 0.52, size: 2, delay: 300 },
];

function Sparkle({ top, left, size, delay }: (typeof SPARKLE_SEEDS)[number]) {
  const opacity = useRef(new Animated.Value(0.25)).current;
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    const buildAnim = () =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(opacity, { toValue: 1, duration: 1400, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.2, duration: 1400, useNativeDriver: true }),
        ])
      );
    let anim = buildAnim();
    const start = () => {
      anim.stop();
      anim = buildAnim();
      anim.start();
    };
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else anim.stop();
    });
    if (AppState.currentState === 'active') anim.start();
    return () => {
      anim.stop();
      sub.remove();
    };
  }, [delay, opacity]);

  return (
    <Animated.View
      style={[
        styles.sparkle,
        {
          width: size,
          height: size,
          borderRadius: size,
          top: top * height,
          left: left * width,
          opacity,
        },
      ]}
    />
  );
}

export function LobbyAnimatedBackground() {
  const { width, height } = useWindowDimensions();
  const drift1 = useRef(new Animated.Value(0)).current;
  const drift2 = useRef(new Animated.Value(0)).current;
  const drift3 = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = (val: Animated.Value, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration, useNativeDriver: true }),
        ])
      );
    const a1 = loop(drift1, 16000);
    const a2 = loop(drift2, 22000);
    const a3 = loop(drift3, 19000);
    const a4 = loop(pulse, 3600);
    const a5 = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 48000, useNativeDriver: true })
    );
    const anims = [a1, a2, a3, a4, a5];
    const start = () => anims.forEach((a) => a.start());
    const stop = () => anims.forEach((a) => a.stop());
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });
    if (AppState.currentState === 'active') start();
    return () => {
      stop();
      sub.remove();
    };
  }, [drift1, drift2, drift3, pulse, spin]);

  const orbSize = Math.max(width, height) * 0.72;
  const y1 = drift1.interpolate({ inputRange: [0, 1], outputRange: [0, 48] });
  const x2 = drift2.interpolate({ inputRange: [0, 1], outputRange: [0, -44] });
  const y3 = drift3.interpolate({ inputRange: [0, 1], outputRange: [0, -36] });
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={[...lobbyTheme.heroGradient]} locations={[0, 0.35, 0.72, 1]} style={StyleSheet.absoluteFill} />

      <LinearGradient
        colors={['transparent', 'rgba(45,212,191,0.08)', 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.auroraBand, { top: height * 0.22, width: width * 1.4, marginLeft: -width * 0.2 }]}
      />

      <Animated.View
        style={[
          styles.orb,
          {
            width: orbSize,
            height: orbSize,
            borderRadius: orbSize / 2,
            left: -orbSize * 0.42,
            top: -orbSize * 0.18,
            backgroundColor: 'rgba(45, 212, 191, 0.32)',
            transform: [{ translateY: y1 }],
            opacity: glow,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.orb,
          {
            width: orbSize * 0.88,
            height: orbSize * 0.88,
            borderRadius: (orbSize * 0.88) / 2,
            right: -orbSize * 0.4,
            top: height * 0.12,
            backgroundColor: 'rgba(167, 139, 250, 0.26)',
            transform: [{ translateX: x2 }, { rotate }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.orb,
          {
            width: orbSize * 0.62,
            height: orbSize * 0.62,
            borderRadius: (orbSize * 0.62) / 2,
            left: width * 0.05,
            bottom: -orbSize * 0.08,
            backgroundColor: 'rgba(56, 189, 248, 0.2)',
            transform: [{ translateY: y3 }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.orb,
          {
            width: orbSize * 0.38,
            height: orbSize * 0.38,
            borderRadius: (orbSize * 0.38) / 2,
            right: width * 0.08,
            bottom: height * 0.06,
            backgroundColor: 'rgba(251, 191, 36, 0.16)',
            opacity: glow,
          },
        ]}
      />

      {useMemo(
        () => SPARKLE_SEEDS.map((s, i) => <Sparkle key={i} {...s} />),
        []
      )}

      <View style={styles.gridOverlay} />
    </View>
  );
}

const styles = StyleSheet.create({
  orb: { position: 'absolute' },
  auroraBand: {
    position: 'absolute',
    height: 120,
    transform: [{ rotate: '-8deg' }],
  },
  sparkle: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#fff',
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.04,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
});
