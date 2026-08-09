import { type ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView, type BlurTint } from 'expo-blur';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';

type Props = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
  /** 0–1 overlay opacity on top of blur (spec: 0.85 frosted feel via fill alpha) */
  opacity?: number;
};

/**
 * Valoria glass tab / chrome background.
 * Blur on capable devices; translucent fallback elsewhere.
 */
export function GlassBackground({
  children,
  style,
  borderRadius = 28,
  opacity = 0.85,
}: Props) {
  const { isNight } = usePremiumTheme();
  const tint: BlurTint = isNight
    ? Platform.OS === 'ios'
      ? 'systemChromeMaterialDark'
      : 'dark'
    : Platform.OS === 'ios'
      ? 'systemChromeMaterialLight'
      : 'light';

  const fill = isNight
    ? `rgba(8,18,16,${opacity * 0.55})`
    : `rgba(255,255,255,${opacity * 0.55})`;
  const border = isNight ? 'rgba(255,255,255,0.12)' : 'rgba(15,118,110,0.10)';
  const fallbackBg = isNight ? `rgba(14,28,26,${opacity})` : `rgba(255,255,255,${opacity})`;

  return (
    <View style={[styles.host, { borderRadius }, style]}>
      {Platform.OS !== 'web' ? (
        <BlurView
          intensity={90}
          tint={tint}
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
        />
      ) : null}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            backgroundColor: Platform.OS === 'web' ? fallbackBg : fill,
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[styles.border, { borderRadius, borderColor: border }]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
