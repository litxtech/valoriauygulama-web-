import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import type { ChatThemePalette } from '@/hooks/useScreenTheme';

const DEFAULT_GROUP_COLOR = '#5B8DEF';

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(91, 141, 239, ${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

type Props = {
  displayName: string;
  avatarUri?: string | null;
  isGroup?: boolean;
  isAllStaff?: boolean;
  groupColor?: string;
  unread?: number;
  isOnline?: boolean;
  size?: number;
  accentColor: string;
  surfaceColor: string;
  pulseUnread?: boolean;
  showBadge?: boolean;
};

export function ChatLiveAvatar({
  displayName,
  avatarUri,
  isGroup,
  isAllStaff,
  groupColor,
  unread = 0,
  isOnline,
  size = 54,
  accentColor,
  surfaceColor,
  pulseUnread = true,
  showBadge = true,
}: Props) {
  const pulse = useRef(new Animated.Value(0)).current;
  const hasUnread = unread > 0;
  const bg = isGroup ? (groupColor || DEFAULT_GROUP_COLOR) : accentColor;
  const avatarRadius = isGroup ? size * 0.24 : size / 2;

  useEffect(() => {
    if (!pulseUnread || !hasUnread) {
      pulse.setValue(0);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [hasUnread, pulse, pulseUnread]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });

  return (
    <View style={[styles.wrap, { width: size + 8, height: size + 8 }]}>
      {hasUnread && pulseUnread ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulseRing,
            {
              width: size + 8,
              height: size + 8,
              borderRadius: (size + 8) / 2,
              borderColor: accentColor,
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
      ) : null}

      <View
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: avatarRadius,
            backgroundColor: bg,
          },
          hasUnread && styles.avatarUnreadBorder,
          hasUnread && { borderColor: accentColor },
        ]}
      >
        {isGroup ? (
          <>
            <View
              pointerEvents="none"
              style={[
                styles.groupAvatarSheen,
                { borderTopLeftRadius: avatarRadius, borderTopRightRadius: avatarRadius },
              ]}
            />
            {avatarUri ? (
              <CachedImage uri={avatarUri} style={{ width: size, height: size }} contentFit="cover" />
            ) : (
              <Ionicons name={isAllStaff ? 'people' : 'people-outline'} size={size * 0.4} color="#fff" />
            )}
          </>
        ) : avatarUri ? (
          <CachedImage uri={avatarUri} style={{ width: size, height: size }} contentFit="cover" />
        ) : (
          <Text style={[styles.letter, { fontSize: size * 0.38 }]}>
            {displayName.charAt(0).toUpperCase()}
          </Text>
        )}
      </View>

      {hasUnread && showBadge ? (
        <View style={[styles.unreadBadge, { backgroundColor: accentColor, borderColor: surfaceColor }]}>
          <Text style={styles.unreadText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}

      {isOnline && !isGroup ? (
        <View style={[styles.onlineDot, { borderColor: surfaceColor }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 2.5,
  },
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  groupAvatarSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '42%',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  avatarUnreadBorder: {
    borderWidth: 2,
  },
  letter: {
    color: '#fff',
    fontWeight: '700',
  },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
  },
  unreadText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#3CCB4A',
    borderWidth: 2,
  },
});

export function resolveGroupAvatarColor(
  groupThemeColor: string | null | undefined,
  isAllStaff: boolean
): string {
  if (isAllStaff) return '#6B9BD1';
  const theme = (groupThemeColor ?? '').trim();
  return theme || DEFAULT_GROUP_COLOR;
}
