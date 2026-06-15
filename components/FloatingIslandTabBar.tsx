import { useCallback, useContext, useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, Animated, type LayoutChangeEvent } from 'react-native';
import { BottomTabBar, BottomTabBarHeightCallbackContext } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IOS_TAB_BAR_FLOAT_MARGIN } from '@/constants/floatingTabBarMetrics';
import { getEffectiveBottomInset } from '@/lib/effectiveSafeArea';
import { GlassTabBarShell } from '@/components/premium/GlassTabBarShell';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import { getAppTabBarColors } from '@/constants/tabBarTheme';
import { getPersonelDesign } from '@/constants/personelDesignSystem';

const ISLAND_RADIUS = 22;
const IOS_HORIZONTAL_INSET = 10;

export type FloatingIslandTabBarProps = BottomTabBarProps & {
  surfaceColor?: string;
  borderColor?: string;
  hidden?: boolean;
};

/**
 * Android: tam genişlik, sistem navigasyon inset’i BottomTabBar’da (eskisi gibi birleşir).
 * iOS: kompakt yüzen ada, alta yakın.
 */
export function FloatingIslandTabBar({
  surfaceColor,
  borderColor: borderColorProp,
  hidden = false,
  insets: navInsets,
  ...props
}: FloatingIslandTabBarProps) {
  const { isNight } = usePremiumTheme();
  const palette = getPersonelDesign(isNight);
  const tabBar = getAppTabBarColors(isNight);
  const resolvedSurface = surfaceColor ?? (isNight ? palette.pageBg : 'transparent');
  const resolvedBorder = borderColorProp ?? tabBar.border;

  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: hidden ? 120 : 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 0,
    }).start();
  }, [hidden, translateY]);

  const safeInsets = useSafeAreaInsets();
  const rawBottom = navInsets?.bottom ?? safeInsets.bottom;
  const resolvedInsets = {
    top: navInsets?.top ?? safeInsets.top,
    right: navInsets?.right ?? safeInsets.right,
    bottom: Platform.OS === 'android' ? getEffectiveBottomInset({ bottom: rawBottom }) : rawBottom,
    left: navInsets?.left ?? safeInsets.left,
  };
  const onTabBarHeightChange = useContext(BottomTabBarHeightCallbackContext);

  const handleShellLayout = useCallback(
    (e: LayoutChangeEvent) => {
      onTabBarHeightChange?.(e.nativeEvent.layout.height);
    },
    [onTabBarHeightChange]
  );

  if (Platform.OS === 'android') {
    return (
      <Animated.View
        onLayout={handleShellLayout}
        style={[
          styles.androidShell,
          {
            backgroundColor: resolvedSurface,
            borderTopColor: resolvedBorder,
            transform: [{ translateY }],
          },
        ]}
      >
        <GlassTabBarShell borderRadius={0}>
          <BottomTabBar
            {...props}
            insets={{
              top: 0,
              right: resolvedInsets.right,
              bottom: resolvedInsets.bottom,
              left: resolvedInsets.left,
            }}
          />
        </GlassTabBarShell>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      onLayout={handleShellLayout}
      style={[
        styles.iosShell,
        {
          backgroundColor: resolvedSurface,
          paddingBottom: IOS_TAB_BAR_FLOAT_MARGIN,
          paddingHorizontal: IOS_HORIZONTAL_INSET,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={[styles.shadowHost, isNight && styles.shadowHostNight]}>
        <GlassTabBarShell borderRadius={ISLAND_RADIUS}>
          <BottomTabBar
            {...props}
            insets={{
              top: 0,
              right: 0,
              bottom: resolvedInsets.bottom,
              left: 0,
            }}
          />
        </GlassTabBarShell>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  androidShell: {
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  iosShell: {
    width: '100%',
  },
  shadowHost: {
    borderRadius: ISLAND_RADIUS,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
  },
  shadowHostNight: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
  },
});
