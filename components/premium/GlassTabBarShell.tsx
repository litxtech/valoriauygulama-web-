import { type ReactNode } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { getPersonelDesign } from '@/constants/personelDesignSystem';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import { getAppTabBarColors } from '@/constants/tabBarTheme';

type Props = { children: ReactNode; borderRadius?: number };

export function GlassTabBarShell({ children, borderRadius = 22 }: Props) {
  const { isNight, colors } = usePremiumTheme();
  const palette = getPersonelDesign(isNight);
  const tabBar = getAppTabBarColors(isNight);
  const tint = isNight ? 'dark' : 'light';
  const fill = isNight ? colors.glassStrong : palette.barGlassStrong;
  const borderColor = isNight ? tabBar.border : 'rgba(15,23,42,0.08)';

  if (Platform.OS === 'ios') {
    return (
      <View style={[styles.host, { borderRadius }]}>
        <BlurView intensity={64} tint={tint} style={[StyleSheet.absoluteFill, { borderRadius }]} />
        <View style={[StyleSheet.absoluteFill, { borderRadius, backgroundColor: fill }]} />
        <View style={[styles.border, { borderRadius, borderColor }]} />
        {children}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.host,
        {
          borderRadius,
          backgroundColor: fill,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor,
        },
      ]}
    >
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
});
