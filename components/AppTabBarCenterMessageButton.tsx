import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/theme';
import { pds } from '@/constants/personelDesignSystem';
import { appTabBar } from '@/constants/tabBarTheme';

const { size: MSG_SIZE, icon: MSG_ICON } = appTabBar.centerMessage;

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: MSG_SIZE,
    height: MSG_SIZE,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
      android: {},
      default: {},
    }),
  },
  circle: {
    width: MSG_SIZE,
    height: MSG_SIZE,
    borderRadius: MSG_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: { elevation: 3 },
      default: {},
    }),
  },
  circleDim: { opacity: 0.78 },
  circleAndroid: {
    backgroundColor: pds.indigo,
    elevation: 0,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
});

type IconProps = {
  focused: boolean;
  unreadCount: number;
};

/**
 * Orta mesaj sekmesi — tabBarIcon ile kullan (özel tabBarButton ikon satırını atlar, aşağıda kalır).
 */
export function CenterMessageTabBarIcon({ focused, unreadCount }: IconProps) {
  const scale = focused ? 1.05 : 1;

  return (
    <View style={[styles.wrap, { transform: [{ scale }] }]}>
      {Platform.OS === 'android' ? (
        <View style={[styles.circle, styles.circleAndroid, !focused && styles.circleDim]}>
          <Ionicons name="chatbubbles" size={MSG_ICON} color="#fff" />
        </View>
      ) : (
        <LinearGradient
          colors={pds.gradientPremium}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.circle, !focused && styles.circleDim]}
        >
          <Ionicons name="chatbubbles" size={MSG_ICON} color="#fff" />
        </LinearGradient>
      )}
      {unreadCount > 0 ? (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </View>
      ) : null}
    </View>
  );
}
