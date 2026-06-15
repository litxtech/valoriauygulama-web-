import { useEffect, useRef, useState } from 'react';
import { Text, type TextStyle, type StyleProp } from 'react-native';
import { Animated, Easing } from 'react-native';

type Props = {
  value: number;
  style?: StyleProp<TextStyle>;
  suffix?: string;
  duration?: number;
};

function safeCount(n: number): number {
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Sayaç değişiminde yumuşak sayı geçişi */
export function AnimatedCountText({ value, style, suffix = '', duration = 520 }: Props) {
  const target = safeCount(value);
  const anim = useRef(new Animated.Value(0)).current;
  const fromRef = useRef(target);
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    if (fromRef.current === target) return;
    const from = fromRef.current;
    fromRef.current = target;
    anim.setValue(0);
    const listenerId = anim.addListener(({ value: t }) => {
      setDisplay(safeCount(from + (target - from) * t));
    });
    Animated.timing(anim, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      anim.removeListener(listenerId);
      setDisplay(target);
    });
    return () => anim.removeListener(listenerId);
  }, [anim, duration, target]);

  return (
    <Text style={style}>
      {safeCount(display).toLocaleString('tr-TR')}
      {suffix}
    </Text>
  );
}
