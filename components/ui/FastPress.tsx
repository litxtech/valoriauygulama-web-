import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  TouchableOpacity,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = Omit<PressableProps, 'style'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Android ripple */
  rippleColor?: string;
  borderlessRipple?: boolean;
  /** iOS TouchableOpacity */
  activeOpacity?: number;
};

/**
 * Android: native ripple, no press-delay animasyonu.
 * iOS: TouchableOpacity (mevcut hissiyat).
 */
export function FastPress({
  children,
  onPress,
  style,
  rippleColor = 'rgba(99, 102, 241, 0.18)',
  borderlessRipple = false,
  activeOpacity = 0.72,
  disabled,
  ...rest
}: Props) {
  if (Platform.OS === 'android') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        unstable_pressDelay={0}
        android_ripple={
          disabled ? undefined : { color: rippleColor, borderless: borderlessRipple }
        }
        style={style}
        {...rest}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={activeOpacity}
      style={style}
      {...(rest as object)}
    >
      {children}
    </TouchableOpacity>
  );
}
