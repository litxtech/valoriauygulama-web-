import { type ReactNode } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { appTabBarPartnerGlass } from '@/constants/tabBarTheme';

type Props = { children: ReactNode; borderRadius?: number };

/** Partner tab bar — iOS blur; Android düz cam. */
export function PartnerGlassTabBarShell({ children, borderRadius = 22 }: Props) {
  const glass = appTabBarPartnerGlass;
  const useBlur = Platform.OS === 'ios';

  return (
    <View style={[styles.host, { borderRadius }]}>
      {useBlur ? (
        <BlurView intensity={glass.blurIntensity} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius }]} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { borderRadius, backgroundColor: glass.fill }]} />
      <View style={[styles.border, { borderRadius, borderColor: glass.border }]} />
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
