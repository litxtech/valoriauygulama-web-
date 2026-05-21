import { View, Text, TouchableOpacity, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { theme } from '@/constants/theme';
import { pds } from '@/constants/personelDesignSystem';
import { appTabBar } from '@/constants/tabBarTheme';

const { size: MSG_SIZE, icon: MSG_ICON, lift: MSG_LIFT } = appTabBar.centerMessage;

const styles = StyleSheet.create({
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  column: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
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
    top: -5,
    right: -7,
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

type Props = BottomTabBarButtonProps & {
  unreadCount: number;
  accessibilityLabel: string;
};

export function AppTabBarCenterMessageButton({
  accessibilityLabel,
  unreadCount,
  style,
  onPress,
  accessibilityState,
  testID,
  href,
}: Props) {
  const focused = !!accessibilityState?.selected;
  const scale = focused ? 1.1 : 1;

  const iconColumn = (
    <View style={styles.column}>
      <View style={[styles.iconWrap, { transform: [{ translateY: -MSG_LIFT }, { scale }] }]}>
        {Platform.OS === 'android' ? (
          <View style={[styles.circle, styles.circleAndroid, !focused && styles.circleDim]}>
            <Ionicons name="paper-plane" size={MSG_ICON} color="#fff" />
          </View>
        ) : (
          <LinearGradient
            colors={pds.gradientPremium}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.circle, !focused && styles.circleDim]}
          >
            <Ionicons name="paper-plane" size={MSG_ICON} color="#fff" />
          </LinearGradient>
        )}
        {unreadCount > 0 ? (
          <View style={styles.badge} pointerEvents="none">
            <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  if (Platform.OS === 'android') {
    return (
      <Pressable
        style={[style, styles.tabBtn, { borderWidth: 0 }]}
        onPress={onPress}
        android_ripple={{ color: 'rgba(99,102,241,0.2)', borderless: false }}
        testID={testID}
        accessibilityRole="button"
        accessibilityState={accessibilityState}
        accessibilityLabel={accessibilityLabel}
      >
        {iconColumn}
      </Pressable>
    );
  }

  return (
    <TouchableOpacity
      style={[style, styles.tabBtn]}
      onPress={onPress}
      activeOpacity={0.88}
      testID={testID}
      href={href}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
    >
      {iconColumn}
    </TouchableOpacity>
  );
}
