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
import { FLOAT_SIDE_INSET, FLOAT_BOTTOM_GAP } from '@/constants/floatingTabBarMetrics';

const ISLAND_RADIUS = 26;

export type FloatingIslandTabBarProps = BottomTabBarProps & {
  surfaceColor?: string;
  borderColor?: string;
  hidden?: boolean;
  /** Partner portal — koyu cam + her platformda yüzen ada */
  variant?: 'default' | 'partner';
  /** Tab slotu dışında, barın tam ortasında yüzen aksiyon (ör. kimlik çekim FAB). */
  centerAction?: ReactNode;
  /**
   * true: ada absolute yüzer, arka plan şeffaf → içerik (feed) barın arkasından akar.
   * Bu modda her sekme ekranı kendi alt boşluğunu eklemeli (getFloatingTabBarTotalHeight).
   * false (varsayılan): ada flex akışında yer kaplar, dolu yüzey (geriye dönük uyumlu).
   */
  floatOverContent?: boolean;
};

function TabBarGlassShell({
  variant,
  borderRadius,
  children,
}: {
  variant: 'default' | 'partner';
  borderRadius: number;
  children: ReactNode;
}) {
  if (variant === 'partner') {
    return <PartnerGlassTabBarShell borderRadius={borderRadius}>{children}</PartnerGlassTabBarShell>;
  }
  return <GlassTabBarShell borderRadius={borderRadius}>{children}</GlassTabBarShell>;
}

/**
 * Tüm platformlarda yüzen ada: alt/sol/sağ kenardan boşluklu, şeffaf buzlu cam.
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
  // floatOverContent: feed arkadan görünsün diye şeffaf. Aksi halde eski dolu yüzey.
  const resolvedSurface = floatOverContent ? 'transparent' : surfaceColor ?? tabBar.shellBackground;

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

  // floatOverContent: ada absolute yüzer, flex akışında yer kaplamaz → sahne tam
  // yükseklik alır, feed barın arkasından akar. Ekranlar kendi alt boşluğunu eklediği
  // için react-navigation'a 0 rapor ederek çift boşluğu önlüyoruz.
  // Aksi halde (eski mod) gerçek yükseklik raporlanır ve bar flex'te yer kaplar.
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

  return (
    <Animated.View
      onLayout={handleShellLayout}
      style={[
        styles.iosShell,
        floatOverContent ? styles.iosShellFloating : null,
        {
          backgroundColor: resolvedSurface,
          paddingBottom: resolvedInsets.bottom + FLOAT_BOTTOM_GAP,
          paddingHorizontal: FLOAT_SIDE_INSET,
          transform: [{ translateY }],
        },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.shadowHost,
          variant === 'partner' && styles.shadowHostPartner,
          isNight && variant === 'default' && styles.shadowHostNight,
        ]}
        pointerEvents="box-none"
      >
        <TabBarGlassShell variant={variant} borderRadius={ISLAND_RADIUS}>
          {tabBarNode}
        </TabBarGlassShell>
        {centerAction ? <View style={styles.centerActionSlot}>{centerAction}</View> : null}
      </View>
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
  shadowHost: {
    borderRadius: ISLAND_RADIUS,
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
  shadowHostNight: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
  },
});
