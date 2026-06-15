import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

type Props = { playing: boolean; barCount?: number; color?: string };

export function VoiceWaveformBars({ playing, barCount = 12, color = '#6366F1' }: Props) {
  const bars = useRef(Array.from({ length: barCount }, () => new Animated.Value(0.3))).current;

  useEffect(() => {
    const loops = bars.map((v, i) => {
      if (!playing) {
        v.setValue(0.25);
        return null;
      }
      return Animated.loop(
        Animated.sequence([
          Animated.delay(i * 40),
          Animated.timing(v, { toValue: 0.35 + Math.random() * 0.65, duration: 200 + i * 15, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.2, duration: 200, useNativeDriver: true }),
        ])
      );
    });
    loops.forEach((l) => l?.start());
    return () => loops.forEach((l) => l?.stop());
  }, [playing, bars]);

  return (
    <View style={styles.row}>
      {bars.map((v, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              backgroundColor: color,
              transform: [{ scaleY: v }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 22 },
  bar: { width: 3, height: 22, borderRadius: 2 },
});
