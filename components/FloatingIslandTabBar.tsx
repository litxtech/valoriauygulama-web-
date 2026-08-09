import { useCallback, useContext, useEffect, useRef, type ReactNode, type LayoutChangeEvent } from 'react';
import { View, StyleSheet, Platform, Animated } from 'react-native';
import { BottomTabBar, BottomTabBarHeightCallbackContext } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getEffectiveBottomInset } from '@/lib/effectiveSafeArea';
import { GlassTabBarShell } from '@/components/premium/GlassTabBarShell';
import { PartnerGlassTabBarShell } from '@/components/breakfastPartner/PartnerGlassTabBarShell';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import { getAppTabBarColors } from '@/constants/tabBarTheme';
import {
  FLOAT_SIDE_INSET,
  FLOAT_BOTTOM_GAP,
  PARTNER_FLOAT_SIDE_INSET,
  PARTNER_FLOAT_BOTTOM_GAP,
} from '@/constants/floatingTabBarMetrics';

const DOCK_RADIUS = 0;
const PARTNER_ISLAND_RADIUS = 26;

export type FloatingIslandTabBarProps = BottomTabBarProps & {
  surfaceColor?: string;
  borderColor?: string;
  hidden?: boolean;
  /** Partner portal — koyu cam + yüzen ada */
  variant?: 'default' | 'partner';
  /** Tab slotu dışında, barın tam ortasında yüzen aksiyon (ör. kimlik çekim FAB). */
  centerAction?: ReactNode;
  /**
   * true: ada absolute yüzer, arka plan şeffaf → içerik (feed) barın arkasından akar.
   * Bu modda her sekme ekranı kendi alt boşluğunu eklemeli (getFloatingTabBarTotalHeight).
   * false (varsayılan): ada flex akışında yer kaplar.
   */
  floatOverContent?: boolean;
};

/**
 * Default: Instagram kenardan-kenara buzlu cam (blur tüm şeritte).
 * Partner: yüzen ada.
 */
export function FloatingIslandTabBar({
  surfaceColor,
  borderColor: _borderColorProp,
  hidden = false,
  variant = 'default',
  centerAction,
  floatOverContent = false,
  insets: navInsets,
  ...props
}: FloatingIslandTabBarProps) {
  const { isNight } = usePremiumTheme();
  const tabBar = getAppTabBarColors(isNight);
  const isPartner = variant === 'partner';

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
  const bottomInset =
    Platform.OS === 'android' ? getEffectiveBottomInset({ bottom: rawBottom }) : rawBottom;
  const onTabBarHeightChange = useContext(BottomTabBarHeightCallbackContext);
  const sideInset = isPartner ? PARTNER_FLOAT_SIDE_INSET : FLOAT_SIDE_INSET;
  const bottomGap = isPartner ? PARTNER_FLOAT_BOTTOM_GAP : FLOAT_BOTTOM_GAP;
  const radius = isPartner ? PARTNER_ISLAND_RADIUS : DOCK_RADIUS;
  const bottomPad = bottomInset + bottomGap;

  const handleShellLayout = useCallback(
    (e: LayoutChangeEvent) => {
      onTabBarHeightChange?.(floatOverContent ? 0 : e.nativeEvent.layout.height);
    },
    [onTabBarHeightChange, floatOverContent]
  );

  const tabBarNode = (
    <BottomTabBar
      {...props}
      insets={{ top: 0, right: 0, bottom: 0, left: 0 }}
    />
  );

  // Partner: eski yüzen ada (blur ada içinde)
  if (isPartner) {
    return (
      <Animated.View
        onLayout={handleShellLayout}
        style={[
          styles.iosShell,
          floatOverContent ? styles.iosShellFloating : null,
          {
            backgroundColor: surfaceColor ?? tabBar.shellBackground,
            paddingBottom: bottomPad,
            paddingHorizontal: sideInset,
            transform: [{ translateY }],
          },
        ]}
        pointerEvents="box-none"
      >
        <View style={[styles.shadowHost, styles.shadowHostPartner]} pointerEvents="box-none">
          <PartnerGlassTabBarShell borderRadius={radius}>{tabBarNode}</PartnerGlassTabBarShell>
          {centerAction ? <View style={styles.centerActionSlot}>{centerAction}</View> : null}
        </View>
      </Animated.View>
    );
  }

  // Instagram: buz cam tüm alt şeridi (butonlar + home indicator) kaplar
  return (
    <Animated.View
      onLayout={handleShellLayout}
      style={[
        styles.iosShell,
        floatOverContent ? styles.iosShellFloating : null,
        {
          backgroundColor: 'transparent',
          paddingHorizontal: sideInset,
          transform: [{ translateY }],
        },
      ]}
      pointerEvents="box-none"
    >
      <GlassTabBarShell borderRadius={radius} style={styles.glassFill}>
        <View style={{ paddingBottom: bottomPad }}>{tabBarNode}</View>
      </GlassTabBarShell>
      {centerAction ? <View style={styles.centerActionSlot}>{centerAction}</View> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  iosShell: {
    width: '100%',
  },
  iosShellFloating: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  glassFill: {
    width: '100%',
  },
  shadowHost: {
    borderRadius: PARTNER_ISLAND_RADIUS,
    overflow: 'visible',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  shadowHostPartner: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 12,
  },
  centerActionSlot: {
    position: 'absolute',
    top: Platform.OS === 'android' ? -30 : -26,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
    pointerEvents: 'box-none',
  },
});
