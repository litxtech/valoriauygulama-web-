import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type VerificationBadgeType = 'blue' | 'yellow' | null | undefined;

/** TikTok tarzı mavi/sarı tik boyutu: isim yanında ~14px */
const BADGE_SIZE = 14;

const COLORS = {
  blue: '#0095F6',
  yellow: '#FFC107',
} as const;

type AvatarWithBadgeProps = {
  badge: VerificationBadgeType;
  /** Avatar daire boyutu (örn. 44, 56) */
  avatarSize?: number;
  /** Avatar üzerindeki tik boyutu */
  badgeSize?: number;
  /** Avatar üzerinde tik gösterme (false ise sadece isim yanında tik kullanın) */
  showBadge?: boolean;
  children: React.ReactNode;
  style?: object;
};

/** Avatar sarmalayıcı; avatar köşesinde mavi/sarı tik gösterilir (showBadge false ise gösterilmez). */
export function AvatarWithBadge({ badge, avatarSize = 44, badgeSize, showBadge = true, children, style }: AvatarWithBadgeProps) {
  const size = badgeSize ?? Math.max(12, Math.round(avatarSize * 0.22));
  return (
    <View style={[styles.avatarWrap, { width: avatarSize, height: avatarSize }, style]}>
      {children}
      {showBadge && badge && (badge === 'blue' || badge === 'yellow') && (
        <View style={[styles.avatarBadge, { right: -2, bottom: -2, width: size, height: size }]} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={size} color={COLORS[badge]} />
        </View>
      )}
    </View>
  );
}

type Props = {
  badge: VerificationBadgeType;
  /** İsimle aynı hizada olsun diye kullanılabilir (örn. 2) */
  size?: number;
  style?: object;
};

export function VerifiedBadge({ badge, size = BADGE_SIZE, style }: Props) {
  if (!badge || (badge !== 'blue' && badge !== 'yellow')) return null;
  const color = COLORS[badge];
  return (
    <View style={[styles.wrap, { width: size, height: size }, style]} pointerEvents="none">
      <Ionicons name="checkmark-circle" size={size} color={color} />
    </View>
  );
}

type NameWithBadgeProps = {
  name: string;
  badge: VerificationBadgeType;
  textStyle?: object;
  badgeSize?: number;
  /** Profil sayfalarında isim+badge ortalanır */
  center?: boolean;
};

/** İsim + mavi/sarı tik satırı; tik isimle tam ortada hizalı. */
export function StaffNameWithBadge({ name, badge, textStyle, badgeSize = BADGE_SIZE, center }: NameWithBadgeProps) {
  const hasBadge = badge === 'blue' || badge === 'yellow';

  if (center) {
    return (
      <View style={styles.nameCenterOuter}>
        {hasBadge ? (
          <View style={styles.nameCenterBadgeRow}>
            <Text style={[textStyle, styles.nameCenterTextInline]} numberOfLines={1}>
              {name}
            </Text>
            <VerifiedBadge badge={badge} size={badgeSize} style={styles.badgeInline} />
          </View>
        ) : (
          <Text style={[textStyle, styles.nameCenterTextFull]} numberOfLines={1}>
            {name}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.nameRow}>
      <Text style={textStyle} numberOfLines={1}>
        {name}
      </Text>
      <VerifiedBadge badge={badge} size={badgeSize} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    flexShrink: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    alignContent: 'center',
    flexWrap: 'nowrap',
  },
  nameCenterOuter: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameCenterTextFull: {
    width: '100%',
    textAlign: 'center',
  },
  nameCenterBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
    gap: 4,
  },
  nameCenterTextInline: {
    flexShrink: 1,
    textAlign: 'center',
  },
  badgeInline: {
    marginLeft: 0,
  },
  avatarWrap: {
    position: 'relative',
    overflow: 'visible',
  },
  avatarBadge: {
    position: 'absolute',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
