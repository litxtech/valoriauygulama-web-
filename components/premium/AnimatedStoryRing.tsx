import { type ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
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

/**
 * Story halkası — görülmemiş: dönen gradient; görülmüş / online: sabit çember.
 * Taşma yok (pulse/glow yok) — kenarlar kırpılmaz.
 */
export function AnimatedStoryRing({
  children,
  hasStory,
  hasUnseen,
  isOnline = false,
  size = 68,
}: Props) {
  const palette = usePersonelDesign();
  const { isNight } = usePremiumTheme();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!(hasStory && hasUnseen)) {
      spin.stopAnimation();
      spin.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 2800,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [hasStory, hasUnseen, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const ringThickness = hasStory && hasUnseen ? 3 : hasStory ? 2.25 : isOnline ? 2 : 1.5;
  const gap = 2;
  const hole = size - ringThickness * 2;
  const innerSize = hole - gap * 2;
  const innerBg = isNight ? palette.pageBg : '#fff';

  if (hasStory && hasUnseen) {
    const colors = (palette.gradientStoryRing?.length
      ? palette.gradientStoryRing
      : ['#F59E0B', '#FB7185', '#0D9488', '#38BDF8', '#F59E0B']) as [
      string,
      string,
      ...string[],
    ];

    return (
      <View style={{ width: size, height: size }}>
        <Animated.View style={[StyleSheet.absoluteFillObject, { transform: [{ rotate }] }]}>
          <LinearGradient
            colors={colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
          />
        </Animated.View>
        <View
          style={{
            position: 'absolute',
            top: ringThickness,
            left: ringThickness,
            width: hole,
            height: hole,
            borderRadius: hole / 2,
            backgroundColor: innerBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: innerSize,
              height: innerSize,
              borderRadius: innerSize / 2,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {children}
          </View>
        </View>
      </View>
    );
  }

  const ringColor = hasStory
    ? palette.storySeen
    : isOnline
      ? palette.accent
      : isNight
        ? palette.storySeen
        : '#CFD9DE';

  return (
    <View
      style={[
        styles.outer,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ringThickness,
          borderColor: ringColor,
          padding: gap,
        },
      ]}
    >
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
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
