import { useCallback, useContext } from 'react';
import { View, StyleSheet, Platform, type LayoutChangeEvent } from 'react-native';
import { BottomTabBar, BottomTabBarHeightCallbackContext } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IOS_TAB_BAR_FLOAT_MARGIN } from '@/constants/floatingTabBarMetrics';
import { getEffectiveBottomInset } from '@/lib/effectiveSafeArea';

const ISLAND_RADIUS = 22;
const IOS_HORIZONTAL_INSET = 10;

export type FloatingIslandTabBarProps = BottomTabBarProps & {
  surfaceColor: string;
  borderColor?: string;
};

/**
 * Android: tam genişlik, sistem navigasyon inset’i BottomTabBar’da (eskisi gibi birleşir).
 * iOS: kompakt yüzen ada, alta yakın.
 */
export function FloatingIslandTabBar({
  surfaceColor,
  borderColor = 'rgba(15, 23, 42, 0.08)',
  insets: navInsets,
  ...props
}: FloatingIslandTabBarProps) {
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
      <View
        onLayout={handleShellLayout}
        style={[styles.androidShell, { backgroundColor: surfaceColor, borderTopColor: borderColor }]}
      >
        <BottomTabBar
          {...props}
          insets={{
            top: 0,
            right: resolvedInsets.right,
            bottom: resolvedInsets.bottom,
            left: resolvedInsets.left,
          }}
        />
      </View>
    );
  }

  return (
    <View
      onLayout={handleShellLayout}
      style={[
        styles.iosShell,
        {
          backgroundColor: surfaceColor,
          paddingBottom: IOS_TAB_BAR_FLOAT_MARGIN,
          paddingHorizontal: IOS_HORIZONTAL_INSET,
        },
      ]}
    >
      <View style={styles.shadowHost}>
        <View style={[styles.ring, { borderColor }]}>
          <View style={[styles.islandFill, { backgroundColor: surfaceColor }]}>
            <BottomTabBar
              {...props}
              insets={{
                top: 0,
                right: 0,
                bottom: resolvedInsets.bottom,
                left: 0,
              }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  androidShell: {
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 2,
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
  ring: {
    borderRadius: ISLAND_RADIUS,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  islandFill: {
    overflow: 'hidden',
  },
});
