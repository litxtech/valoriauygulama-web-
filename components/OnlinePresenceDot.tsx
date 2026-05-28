import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { theme } from '@/constants/theme';

type Position = 'bottom-right' | 'bottom-left';

type Props = {
  online: boolean;
  size?: number;
  position?: Position;
  borderColor?: string;
  style?: ViewStyle;
};

const GREEN = theme.colors.success;

export function OnlinePresenceDot({
  online,
  size = 12,
  position = 'bottom-right',
  borderColor = '#fff',
  style,
}: Props) {
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!online) return;
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.18, duration: 700, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [online, opacity, scale]);

  if (!online) return null;

  const pos =
    position === 'bottom-left'
      ? ({ left: -1, bottom: -1 } as const)
      : ({ right: -1, bottom: -1 } as const);

  return (
    <Animated.View
      style={[
        styles.dot,
        pos,
        style,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor,
          opacity,
          transform: [{ scale }],
        },
      ]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    zIndex: 6,
    backgroundColor: GREEN,
    borderWidth: 2,
  },
});
