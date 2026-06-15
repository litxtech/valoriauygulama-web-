import { type ReactNode } from 'react';
import { View, StyleSheet, Platform, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  borderRadius?: number;
  strong?: boolean;
  /** Scroll içinde blur titreme yapar — false = düz cam rengi */
  blur?: boolean;
};

/** Cam yüzey — iOS blur, Android yarı saydam fallback */
export function GlassSurface({
  children,
  style,
  intensity = 48,
  borderRadius = 20,
  strong,
  blur = true,
}: Props) {
  const { isNight, colors } = usePremiumTheme();
  const tint = isNight ? 'dark' : 'light';
  const fill = strong ? colors.glassStrong : colors.glass;

  if (Platform.OS === 'ios' && !blur) {
    return (
      <View
        style={[
          styles.wrap,
          {
            borderRadius,
            backgroundColor: fill,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.glassBorder,
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  if (Platform.OS === 'ios') {
    return (
      <View style={[styles.wrap, { borderRadius }, style]}>
        <BlurView
          intensity={intensity}
          tint={tint}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
          pointerEvents="none"
        />
        <View style={[StyleSheet.absoluteFill, styles.noise, { borderRadius, backgroundColor: fill }]} pointerEvents="none" />
        <LinearGradient
          colors={['rgba(255,255,255,0.12)', 'transparent']}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
          pointerEvents="none"
        />
        <View style={[styles.border, { borderRadius, borderColor: colors.glassBorder }]} pointerEvents="none" />
        {children}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.wrap,
        {
          borderRadius,
          backgroundColor: strong ? colors.glassStrong : colors.glass,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.glassBorder,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  noise: { opacity: 0.92 },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
