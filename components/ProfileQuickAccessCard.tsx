import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Animated, Easing, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';

type IconName = keyof typeof Ionicons.glyphMap;

type Props = {
  label: string;
  icon: IconName;
  accent: string;
  onPress: () => void;
  badge?: number;
  animated?: boolean;
  /** Hamburger dinamik slot — öncelikli modül vurgusu */
  promoted?: boolean;
  promotedLabel?: string;
  width?: number;
  /** Hamburger menü — daha küçük kart */
  compact?: boolean;
};

export function ProfileQuickAccessCard({
  label,
  icon,
  accent,
  onPress,
  badge,
  animated = false,
  promoted = false,
  promotedLabel,
  width,
  compact = false,
}: Props) {
  const cardScale = useRef(new Animated.Value(1)).current;
  const iconFloat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animated) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(iconFloat, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(iconFloat, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [animated, iconFloat]);

  const handlePressIn = () => {
    if (Platform.OS === 'android') return;
    Animated.spring(cardScale, { toValue: 0.97, friction: 8, tension: 200, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    if (Platform.OS === 'android') return;
    Animated.spring(cardScale, { toValue: 1, friction: 8, tension: 200, useNativeDriver: true }).start();
  };

  const useFlatIcon = Platform.OS === 'android' && compact;
  const iconNode = useFlatIcon ? (
    <View style={[styles.iconGrad, styles.iconGradFlat, compact && styles.iconGradCompact, { backgroundColor: accent + '22' }]}>
      <Ionicons name={icon} size={compact ? 17 : 20} color={accent} />
    </View>
  ) : (
    <LinearGradient
      colors={[accent + '22', accent + '0D']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.iconGrad, compact && styles.iconGradCompact]}
    >
      <Ionicons name={icon} size={compact ? 17 : 20} color={accent} />
    </LinearGradient>
  );

  const cardInner = (
      <Animated.View
        style={[
          styles.card,
          compact && styles.cardCompact,
          P.cardShell,
          Platform.OS === 'android' && compact && styles.cardShellAndroid,
          width != null && { width: '100%' },
          promoted && {
            borderColor: accent,
            borderWidth: 2,
            ...(Platform.OS === 'android' && compact
              ? { elevation: 0 }
              : {
                  shadowColor: accent,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.28,
                  shadowRadius: 10,
                  elevation: 5,
                }),
          },
          { transform: [{ scale: cardScale }] },
        ]}
      >
        {promoted && promotedLabel ? (
          <View style={[styles.promotedPill, { backgroundColor: accent }]}>
            <Text style={styles.promotedPillText} numberOfLines={1}>
              {promotedLabel}
            </Text>
          </View>
        ) : null}
        {badge != null && badge > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        ) : null}
        {animated || promoted ? (
          <Animated.View
            style={{
              transform: [{ translateY: iconFloat.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) }],
            }}
          >
            {iconNode}
          </Animated.View>
        ) : (
          iconNode
        )}
        <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={2}>
          {label}
        </Text>
      </Animated.View>
  );

  if (Platform.OS === 'android') {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: accent + '33', borderless: false }}
        style={width != null ? { width } : undefined}
      >
        {cardInner}
      </Pressable>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.92}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={width != null ? { width } : undefined}
    >
      {cardInner}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 92,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cardCompact: {
    minHeight: 72,
    paddingVertical: 9,
    paddingHorizontal: 6,
    gap: 5,
  },
  iconGrad: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.05)',
  },
  iconGradCompact: {
    width: 34,
    height: 34,
    borderRadius: 11,
  },
  iconGradFlat: {
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  cardShellAndroid: {
    elevation: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: P.text,
    textAlign: 'center',
    lineHeight: 16,
    letterSpacing: 0.1,
  },
  labelCompact: {
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0,
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: P.accent.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    zIndex: 2,
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  promotedPill: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 3,
    maxWidth: 56,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  promotedPillText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
