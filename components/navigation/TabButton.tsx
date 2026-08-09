import { memo, useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  Vibration,
} from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { TabBadge } from '@/components/navigation/TabBadge';
import { pds, pdsNight } from '@/constants/personelDesignSystem';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import { isExpoHapticsNativeAvailable } from '@/lib/hapticsSafe';
import * as Haptics from 'expo-haptics';

const ACTIVE_SCALE = 1.15;
const PRESS_SCALE = 1.06;
const HIT = 48;

type Props = {
  label: string;
  icon: LucideIcon;
  focused: boolean;
  onPress: () => void;
  badgeCount?: number;
  accessibilityLabel?: string;
};

function triggerTabHaptic() {
  if (Platform.OS === 'android') {
    Vibration.vibrate(10);
    return;
  }
  if (!isExpoHapticsNativeAvailable()) return;
  void Haptics.selectionAsync().catch(() => undefined);
}

/** Single tab slot with spring scale + animated oval indicator. */
export const TabButton = memo(function TabButton({
  label,
  icon: Icon,
  focused,
  onPress,
  badgeCount,
  accessibilityLabel,
}: Props) {
  const { isNight } = usePremiumTheme();
  const colors = isNight ? pdsNight : pds;
  const activeColor = colors.accent;
  const inactiveColor = isNight ? '#8FA39E' : '#7A8F89';
  const color = focused ? activeColor : inactiveColor;

  const focusAnim = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const pressAnim = useRef(new Animated.Value(1)).current;
  const indicatorX = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(focusAnim, {
      toValue: focused ? 1 : 0,
      damping: 16,
      stiffness: 260,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
    Animated.spring(indicatorX, {
      toValue: focused ? 1 : 0,
      damping: 14,
      stiffness: 280,
      mass: 0.65,
      useNativeDriver: true,
    }).start();
  }, [focused, focusAnim, indicatorX]);

  const iconScale = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, ACTIVE_SCALE],
  });
  const labelOpacity = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1],
  });
  const indicatorScale = indicatorX.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 1],
  });
  const indicatorOpacity = indicatorX;

  return (
    <Pressable
      onPress={() => {
        triggerTabHaptic();
        onPress();
      }}
      onPressIn={() => {
        Animated.spring(pressAnim, {
          toValue: PRESS_SCALE,
          damping: 18,
          stiffness: 420,
          useNativeDriver: true,
        }).start();
      }}
      onPressOut={() => {
        Animated.spring(pressAnim, {
          toValue: 1,
          damping: 16,
          stiffness: 360,
          useNativeDriver: true,
        }).start();
      }}
      style={styles.hit}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={4}
    >
      <Animated.View style={[styles.inner, { transform: [{ scale: pressAnim }] }]}>
        <View style={styles.iconWrap}>
          <Animated.View style={{ transform: [{ scale: iconScale }] }}>
            <Icon
              size={focused ? 24 : 22}
              color={color}
              strokeWidth={focused ? 2.35 : 1.9}
            />
          </Animated.View>
          <TabBadge count={badgeCount} />
        </View>
        <Animated.Text
          style={[styles.label, { color, opacity: labelOpacity }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.35}
        >
          {label}
        </Animated.Text>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              backgroundColor: activeColor,
              opacity: indicatorOpacity,
              transform: [{ scaleX: indicatorScale }],
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  hit: {
    flex: 1,
    minWidth: HIT,
    minHeight: HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 4,
    minWidth: HIT,
  },
  iconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.1,
    maxWidth: 72,
  },
  indicator: {
    marginTop: 3,
    width: 18,
    height: 4,
    borderRadius: 999,
  },
});
