import { memo } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import type { NotificationActorKind } from '@/lib/notificationActor';

const APP_ICON = require('@/assets/icon.png');

type Props = {
  kind: NotificationActorKind;
  name: string;
  avatarUrl?: string | null;
  size?: number;
  unread?: boolean;
  style?: StyleProp<ViewStyle>;
};

function ringColor(kind: NotificationActorKind, unread: boolean): string {
  if (unread) return '#2563eb';
  if (kind === 'admin') return '#7c3aed';
  if (kind === 'guest') return '#0d9488';
  if (kind === 'staff') return '#64748b';
  return '#0ea5e9';
}

export const NotificationActorAvatar = memo(function NotificationActorAvatar({
  kind,
  name,
  avatarUrl,
  size = 48,
  unread = false,
  style,
}: Props) {
  const radius = size / 2;
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase();
  const ring = ringColor(kind, unread);
  const trimmedUrl = avatarUrl?.trim() || null;
  const showAppIcon = kind === 'app' || kind === 'admin';

  return (
    <View
      style={[
        styles.ring,
        {
          width: size + 6,
          height: size + 6,
          borderRadius: (size + 6) / 2,
          borderColor: ring,
        },
        style,
      ]}
    >
      <View style={[styles.inner, { width: size, height: size, borderRadius: radius }]}>
        {showAppIcon ? (
          <Image source={APP_ICON} style={{ width: size, height: size, borderRadius: radius }} contentFit="cover" />
        ) : trimmedUrl ? (
          <CachedImage uri={trimmedUrl} style={{ width: size, height: size, borderRadius: radius }} contentFit="cover" />
        ) : (
          <View
            style={[
              styles.fallback,
              {
                width: size,
                height: size,
                borderRadius: radius,
                backgroundColor: kind === 'guest' ? '#0d9488' : kind === 'admin' ? '#7c3aed' : '#475569',
              },
            ]}
          >
            {kind === 'admin' ? (
              <Ionicons name="shield-checkmark" size={size * 0.42} color="#fff" />
            ) : (
              <Text style={[styles.initial, { fontSize: Math.max(14, size * 0.38) }]}>{initial}</Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  ring: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  inner: {
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: '#fff',
    fontWeight: '800',
  },
});
