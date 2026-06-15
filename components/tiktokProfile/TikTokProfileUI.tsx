import { type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModernProfileCover } from '@/components/modernProfile/ModernProfileCover';
import { ProfileAvatarRing } from '@/components/modernProfile/ProfileAvatarRing';
import { StaffNameWithBadge } from '@/components/VerifiedBadge';
import type { VerificationBadgeType } from '@/components/VerifiedBadge';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';

export type TikTokProfileStat = { value: string | number; label: string };

export type TikTokProfileAction = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
};

const COVER_H = 132;
const AVATAR = 88;

type CoverProps = {
  coverUri?: string | null;
  topInset: number;
  onCoverPress?: () => void;
  onMenuPress?: () => void;
  onSettingsPress?: () => void;
  uploadingCover?: boolean;
  coverDisabled?: boolean;
  leftAction?: ReactNode;
};

export function TikTokProfileCoverHeader({
  coverUri,
  topInset,
  onCoverPress,
  onMenuPress,
  onSettingsPress,
  uploadingCover,
  coverDisabled,
  leftAction,
}: CoverProps) {
  const height = topInset + COVER_H;
  return (
    <View style={styles.coverWrap}>
      <ModernProfileCover
        imageUri={coverUri}
        height={height}
        edgeToEdge
        softenOverlay={false}
        onPress={onCoverPress}
        disabled={coverDisabled}
      />
      {uploadingCover ? (
        <View style={[styles.coverLoader, { height }]}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}
      <View style={[styles.topBar, { paddingTop: topInset + 6 }]}>
        {leftAction}
        <View style={styles.topBarSpacer} />
        <View style={styles.topBarActions}>
          {onMenuPress ? (
            <TouchableOpacity style={styles.topIconBtn} onPress={onMenuPress} activeOpacity={0.85}>
              <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
            </TouchableOpacity>
          ) : null}
          {onSettingsPress ? (
            <TouchableOpacity style={styles.topIconBtn} onPress={onSettingsPress} activeOpacity={0.85}>
              <Ionicons name="settings-outline" size={22} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

type BodyProps = {
  profileImage?: string | null;
  fullName: string;
  verificationBadge?: VerificationBadgeType | null;
  bio?: string | null;
  metaLine?: string | null;
  stats: TikTokProfileStat[];
  actions?: TikTokProfileAction[];
  onAvatarPress?: () => void;
  belowBio?: ReactNode;
  children: ReactNode;
  tabs: { key: string; label: string }[];
  activeTab: string;
  onTabChange: (key: string) => void;
  style?: ViewStyle;
};

export function TikTokProfileBody({
  profileImage,
  fullName,
  verificationBadge,
  bio,
  metaLine,
  stats,
  actions = [],
  onAvatarPress,
  belowBio,
  children,
  tabs,
  activeTab,
  onTabChange,
  style,
}: BodyProps) {
  return (
    <View style={[styles.body, style]}>
      <View style={styles.identityRow}>
        <ProfileAvatarRing
          uri={profileImage}
          name={fullName}
          size={AVATAR}
          borderWidth={3}
          verificationBadge={verificationBadge}
          onPress={onAvatarPress}
          showCameraHint={!!onAvatarPress && !profileImage}
        />
        <View style={styles.statsRow}>
          {stats.map((s, i) => (
            <View key={`${s.label}-${i}`} style={styles.statCell}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel} numberOfLines={1}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.nameBlock}>
        <StaffNameWithBadge
          name={fullName || '—'}
          badge={verificationBadge ?? null}
          badgeSize={18}
          textStyle={styles.displayName}
        />
        {metaLine ? (
          <Text style={styles.metaLine} numberOfLines={2}>
            {metaLine}
          </Text>
        ) : null}
        {bio?.trim() ? (
          <Text style={styles.bio} numberOfLines={4}>
            {bio.trim()}
          </Text>
        ) : null}
        {belowBio}
      </View>

      {actions.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.actionsScroll}
          style={styles.actionsWrap}
        >
          {actions.map((a) => (
            <TouchableOpacity key={a.id} style={styles.actionChip} onPress={a.onPress} activeOpacity={0.88}>
              <Ionicons name={a.icon} size={16} color={P.text} />
              <Text style={styles.actionChipText} numberOfLines={1}>
                {a.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => onTabChange(tab.key)}
              activeOpacity={0.85}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>
                {tab.label}
              </Text>
              {active ? <View style={styles.tabIndicator} /> : <View style={styles.tabIndicatorGhost} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.tabContent}>{children}</View>
    </View>
  );
}

export const tiktokProfileMetrics = { coverContentHeight: COVER_H, avatarSize: AVATAR };

/** Kapak üstü geri / menü — tüm profil ekranlarında aynı görünüm */
export function ProfileCoverIconButton({
  icon,
  onPress,
  size = 22,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity style={[styles.topIconBtn, style]} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name={icon} size={size} color="#fff" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  coverWrap: { position: 'relative', width: '100%' },
  coverLoader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 4,
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    zIndex: 8,
  },
  topBarSpacer: { flex: 1 },
  topBarActions: { flexDirection: 'row', gap: 8 },
  topIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15,23,42,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 12,
  },
  statsRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statCell: { alignItems: 'center', minWidth: 56 },
  statValue: { fontSize: 17, fontWeight: '800', color: P.text },
  statLabel: { fontSize: 12, color: P.subtext, marginTop: 2, fontWeight: '600' },
  nameBlock: { marginBottom: 10 },
  displayName: { fontSize: 17, fontWeight: '800', color: P.text },
  metaLine: { fontSize: 13, color: P.subtext, marginTop: 4, lineHeight: 18 },
  bio: { fontSize: 14, color: P.text, marginTop: 8, lineHeight: 20 },
  actionsWrap: { marginBottom: 12, marginHorizontal: -4 },
  actionsScroll: { gap: 8, paddingHorizontal: 4 },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: P.cardMuted,
    borderWidth: 1,
    borderColor: P.border,
  },
  actionChipText: { fontSize: 13, fontWeight: '700', color: P.text, maxWidth: 140 },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: P.border,
    marginHorizontal: -16,
    paddingHorizontal: 8,
  },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabLabel: { fontSize: 14, fontWeight: '600', color: P.subtext },
  tabLabelActive: { color: P.text, fontWeight: '800' },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    width: '56%',
    backgroundColor: P.text,
    borderRadius: 1,
  },
  tabIndicatorGhost: { height: 2 },
  tabContent: { marginTop: 4, minHeight: 120 },
});
