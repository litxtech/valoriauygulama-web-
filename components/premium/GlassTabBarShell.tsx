import { type ReactNode } from 'react';
import { View, StyleSheet, Platform, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView, type BlurTint } from 'expo-blur';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import { appTabBarGlass } from '@/constants/tabBarTheme';

type Props = {
  children: ReactNode;
  /** 0 = kenardan-kenara dock; >0 = yuvarlak ada */
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Instagram tab bar arka planı: gerçek buzlu cam.
 * iOS systemChromeMaterial + Android dimezis blur; dolgu çok ince tutulur ki buz görünsün.
 */
export function GlassTabBarShell({ children, borderRadius = 0, style }: Props) {
  const { isNight } = usePremiumTheme();
  const glass = isNight ? appTabBarGlass.dark : appTabBarGlass.light;
  const tint: BlurTint = isNight
    ? Platform.OS === 'ios'
      ? 'systemChromeMaterialDark'
      : 'dark'
    : Platform.OS === 'ios'
      ? 'systemChromeMaterialLight'
      : 'light';
  const isDock = borderRadius <= 0;

  return (
    <View style={[styles.host, { borderRadius }, style]}>
      <BlurView
        intensity={glass.blurIntensity}
        tint={tint}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
      />
      {/* İnce buz cilası — blur’u kapatmayacak kadar düşük alpha */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderRadius, backgroundColor: glass.fill }]}
      />
      <View
        pointerEvents="none"
        style={[
          isDock ? styles.topHairline : styles.border,
          isDock ? { borderTopColor: glass.border } : { borderRadius, borderColor: glass.border },
        ]}
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
  topHairline: {
    ...StyleSheet.absoluteFillObject,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
});
