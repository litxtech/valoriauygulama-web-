import { memo, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

type Props = {
  active: boolean;
  bars?: number;
  color?: string;
  height?: number;
  barWidth?: number;
};

function makeLoop(v: Animated.Value, peak: number, dur: number) {
  return Animated.loop(
    Animated.sequence([
      Animated.timing(v, {
        toValue: peak,
        duration: dur,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(v, {
        toValue: 0.28,
        duration: dur,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ])
  );
}

/** Konuşma anında hareket eden ses çubukları. */
export const PttWaveform = memo(function PttWaveform({
  active,
  bars = 5,
  color = '#fff',
  height = 18,
  barWidth = 3,
}: Props) {
  const valuesRef = useRef<Animated.Value[]>([]);
  if (valuesRef.current.length !== bars) {
    valuesRef.current = Array.from({ length: bars }, () => new Animated.Value(0.4));
  }
  const values = valuesRef.current;

  useEffect(() => {
    const vs = valuesRef.current;
    if (!active) {
      vs.forEach((v, i) => {
        v.stopAnimation();
        v.setValue(0.28 + (i % 3) * 0.12);
      });
      return;
    }
    const loops = vs.map((v, i) => makeLoop(v, 0.92 + (i % 2) * 0.08, 240 + i * 55));
    loops.forEach((l) => l.start());
    return () => {
      loops.forEach((l) => l.stop());
    };
  }, [active, bars]);

  return (
    <View style={[styles.row, { height }]}>
      {values.map((v, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              width: barWidth,
              height,
              backgroundColor: color,
              transform: [{ scaleY: v }],
            },
          ]}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  bar: {
    borderRadius: 2,
  },
});
