import { View, StyleSheet, Platform } from 'react-native';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ISLAND_RADIUS = 28;
const HORIZONTAL_INSET = 14;

export type FloatingIslandTabBarProps = BottomTabBarProps & {
  /** Ada arka planı (expo-blur bazı build’lerde “Unimplemented component” verdiği için düz yüzey) */
  surfaceColor: string;
  /** İnce dış çerçeve */
  borderColor?: string;
};

/**
 * Tam genişlik düz tab yerine: kenarlardan içeri alınmış, gölgeli yüzen ada.
 * Blur kullanılmıyor — ExpoBlurView / New Architecture uyumsuzluğunda kırmızı hata bandı oluşmasın.
 */
export function FloatingIslandTabBar({
  surfaceColor,
  borderColor = 'rgba(15, 23, 42, 0.08)',
  ...props
}: FloatingIslandTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 10) + 8;

  const bar = (
    <BottomTabBar
      {...props}
      insets={{ top: 0, right: 0, bottom: 0, left: 0 }}
    />
  );

  return (
    <View style={[styles.shell, { backgroundColor: surfaceColor, paddingBottom: bottomGap, paddingHorizontal: HORIZONTAL_INSET }]}>
      <View style={styles.shadowHost}>
        <View style={[styles.ring, { borderColor }]}>
          <View style={[styles.islandFill, { backgroundColor: surfaceColor }]}>{bar}</View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Navigator şeffaf alanında “fazladan şerit”; ada ile aynı yüzey rengiyle doldurulur */
  shell: {
    width: '100%',
  },
  shadowHost: {
    borderRadius: ISLAND_RADIUS,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.14,
        shadowRadius: 22,
      },
      android: {
        elevation: 16,
      },
      default: {},
    }),
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
