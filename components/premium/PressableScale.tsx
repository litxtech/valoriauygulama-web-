import { useRef, type ReactNode } from 'react';
import { Animated, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { playPremiumTap } from '@/lib/premiumSounds';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  scaleTo?: number;
  haptic?: boolean;
};

export function PressableScale({
  children,
  onPress,
  onLongPress,
  style,
  disabled,
  scaleTo = 0.96,
  haptic = true,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 6 }).start();
  };

  return (
    <Pressable
      disabled={disabled}
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={() => {
        if (haptic) void playPremiumTap();
        onPress?.();
      }}
      onLongPress={onLongPress}
      style={style}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}
