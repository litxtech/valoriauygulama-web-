import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';

type Props = {
  children: ReactNode;
  hasStory: boolean;
  hasUnseen: boolean;
  isOnline?: boolean;
  size?: number;
};

/** Story halkası — kaydırmada titreme olmaması için statik gradyan (dönen animasyon yok). */
export function AnimatedStoryRing({ children, hasStory, hasUnseen, size = 68 }: Props) {
  const palette = usePersonelDesign();
  const { isNight } = usePremiumTheme();

  const ringColors = hasStory
    ? hasUnseen
      ? ([palette.gradientStoryRing[0], palette.gradientStoryRing[1]] as [string, string, ...string[]])
      : isNight
        ? ([palette.storySeen, palette.storySeen] as [string, string])
        : (['#FEC8A8', '#FD9BC2', '#F9A8D4'] as [string, string, ...string[]])
    : isNight
      ? ([palette.storySeen, palette.storySeen] as [string, string])
      : (['#e5e7eb', '#d1d5db'] as [string, string]);

  const innerSize = size - 6;
  const innerBg = isNight ? palette.pageBg : '#fff';

  return (
    <View style={[styles.outer, { width: size, height: size }]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {hasStory ? (
          <LinearGradient
            colors={ringColors as [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.ringFill, { borderRadius: size / 2 }]}
          />
        ) : (
          <View
            style={[
              styles.ringFill,
              { borderRadius: size / 2, backgroundColor: isNight ? palette.storySeen : '#e5e7eb' },
            ]}
          />
        )}
      </View>
      <View
        style={[
          styles.inner,
          {
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
            backgroundColor: innerBg,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { alignItems: 'center', justifyContent: 'center' },
  ringFill: { ...StyleSheet.absoluteFillObject },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    zIndex: 1,
  },
});
