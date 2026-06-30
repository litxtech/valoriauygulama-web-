import { type ReactNode } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import { appTabBarGlass } from '@/constants/tabBarTheme';

type Props = { children: ReactNode; borderRadius?: number };

/** Instagram tarzı buzlu cam tab bar — iOS + Android'de blur, çok şeffaf dolgu, parlak üst kenar. */
export function GlassTabBarShell({ children, borderRadius = 22 }: Props) {
  const { isNight } = usePremiumTheme();
  const glass = isNight ? appTabBarGlass.dark : appTabBarGlass.light;
  const tint = isNight ? 'dark' : 'light';

  return (
    <View style={[styles.host, { borderRadius }]}>
      <BlurView
        intensity={glass.blurIntensity}
        tint={tint}
        // Android'de gerçek blur (expo-blur 15) — iOS zaten native blur
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
      />
      <View style={[StyleSheet.absoluteFill, { borderRadius, backgroundColor: glass.fill }]} />
      <View style={[styles.border, { borderRadius, borderColor: glass.border }]} />
      {/* Buz parıltısı: cam üstünde ince ışık çizgisi */}
      <View style={[styles.topHighlight, { backgroundColor: glass.highlight }]} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { overflow: 'hidden' },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth,
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: StyleSheet.hairlineWidth,
  },
});
