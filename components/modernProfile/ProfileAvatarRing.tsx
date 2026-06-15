import { type ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { AvatarWithBadge } from '@/components/VerifiedBadge';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';
import type { VerificationBadgeType } from '@/components/VerifiedBadge';

type Props = {
  uri?: string | null;
  name?: string;
  size?: number;
  borderWidth?: number;
  verificationBadge?: VerificationBadgeType | null;
  onPress?: () => void;
  uploading?: boolean;
  showCameraHint?: boolean;
  showBadgeOnAvatar?: boolean;
  style?: ViewStyle;
  children?: ReactNode;
};

export function ProfileAvatarRing({
  uri,
  name = '?',
  size = P.avatar.size,
  borderWidth = P.avatar.border,
  verificationBadge = null,
  onPress,
  uploading = false,
  showCameraHint = false,
  showBadgeOnAvatar = false,
  style,
  children,
}: Props) {
  const letter = (name || '?').charAt(0).toUpperCase();
  const outer = size + borderWidth * 2 + 6;

  const inner = (
    <View style={[styles.ring, { width: outer, height: outer, borderRadius: outer / 2 }, P.avatarShadow, style]}>
      <LinearGradient colors={['#ffffff', '#f1f5f9']} style={[styles.ringGrad, { borderRadius: outer / 2 }]}>
        <AvatarWithBadge
          badge={verificationBadge}
          avatarSize={size}
          badgeSize={Math.round(size * 0.2)}
          showBadge={showBadgeOnAvatar}
        >
          {uri ? (
            <CachedImage uri={uri} style={[styles.img, { width: size, height: size, borderRadius: size / 2 }]} contentFit="cover" />
          ) : (
            <LinearGradient
              colors={[P.gradient.start, P.gradient.end]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.img, styles.placeholder, { width: size, height: size, borderRadius: size / 2 }]}
            >
              <Text style={[styles.letter, { fontSize: size * 0.36 }]}>{letter}</Text>
            </LinearGradient>
          )}
        </AvatarWithBadge>
      </LinearGradient>
      {uploading ? (
        <View style={[styles.uploadOverlay, { borderRadius: outer / 2 }]}>
          <ActivityIndicator color="#fff" size="small" />
        </View>
      ) : null}
      {showCameraHint && !uploading ? (
        <View style={styles.cameraBadge}>
          <Ionicons name="camera" size={14} color="#fff" />
        </View>
      ) : null}
      {children}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.9} onPress={onPress} disabled={uploading}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  ringGrad: {
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: {
    borderWidth: 2,
    borderColor: '#fff',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: { fontWeight: '800', color: '#fff' },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(15,23,42,0.72)',
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
