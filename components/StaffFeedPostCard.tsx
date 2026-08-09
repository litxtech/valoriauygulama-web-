import { useState, memo, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/theme';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import type { PersonelDesignPalette } from '@/constants/personelDesignSystem';
import { StaffNameWithBadge } from '@/components/VerifiedBadge';
import { OnlinePresenceDot } from '@/components/OnlinePresenceDot';
import { CachedImage } from '@/components/CachedImage';
import { getPostTagVisual } from '@/lib/feedPostTagTheme';
import type { PostTagValue } from '@/lib/feedPostTags';
import { useTranslation } from 'react-i18next';
import { FeedTextTranslate } from '@/components/FeedTextTranslate';
import { getFeedRoleBadge, detectFeedCelebration, type FeedCelebrationKind } from '@/lib/feedRoleBadge';

const LIKE_COLOR = '#E11D48';
const REPOST_COLOR = '#0D9488';
const REPLY_COLOR = '#0EA5E9';
const BODY_MAX_LINES = 8;
const AVATAR = 46;

export type StaffFeedPostCardProps = {
  postTag: PostTagValue | string | null | undefined;
  authorName: string;
  authorAvatarUrl: string | null;
  authorBadge: 'blue' | 'yellow' | null;
  isGuestPost: boolean;
  authorIsOnline?: boolean;
  roleLabel: string | null;
  department?: string | null;
  position?: string | null;
  hotelName?: string | null;
  hotelLocation?: string | null;
  timeAgo: string;
  createdAtLabel?: string;
  title: string | null;
  media: React.ReactNode;
  hasMedia: boolean;
  liked: boolean;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  showViewStats?: boolean;
  viewersListEnabled?: boolean;
  commentPreview?: { author: string; text: string }[];
  deletingPost?: boolean;
  isPinned?: boolean;
  isUrgent?: boolean;
  celebrationKind?: FeedCelebrationKind | null;
  onAuthorPress?: () => void;
  onAvatarPress?: () => void;
  onAvatarLongPress?: () => void;
  onLike: () => void;
  onComment: () => void;
  onRepost?: () => void;
  reposting?: boolean;
  onViewers: () => void;
  onCardPress: () => void;
  onMenu: () => void;
  horizontalInset?: number;
  socialHeader?: boolean;
};

const CELEBRATION_META: Record<FeedCelebrationKind, { emoji: string; title: string }> = {
  birthday: { emoji: '🎂', title: 'Doğum Günü' },
  employee_of_month: { emoji: '🏆', title: 'Ayın Personeli' },
  promotion: { emoji: '🎉', title: 'Terfi' },
};

function PremiumAction({
  icon,
  activeIcon,
  count,
  color,
  activeColor,
  active,
  onPress,
  loading,
  disabled,
  scale,
  showZeroCount,
  pressBg,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon?: keyof typeof Ionicons.glyphMap;
  count?: number;
  color: string;
  activeColor?: string;
  active?: boolean;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  scale?: Animated.Value;
  showZeroCount?: boolean;
  pressBg?: string;
}) {
  const tint = active ? (activeColor ?? color) : color;
  const iconNode = <Ionicons name={active && activeIcon ? activeIcon : icon} size={18} color={tint} />;
  const showCount = count != null && (showZeroCount || count > 0);
  return (
    <Pressable
      style={({ pressed }) => [
        actionStyles.action,
        pressed && pressBg ? { backgroundColor: pressBg } : null,
        pressed && actionStyles.actionPressed,
      ]}
      onPress={onPress}
      disabled={disabled || loading || !onPress}
      hitSlop={6}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : scale ? (
        <Animated.View style={{ transform: [{ scale }] }}>{iconNode}</Animated.View>
      ) : (
        iconNode
      )}
      {showCount ? <Text style={[actionStyles.actionCount, { color: tint }]}>{count}</Text> : null}
    </Pressable>
  );
}

const actionStyles = StyleSheet.create({
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minWidth: 48,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  actionPressed: { opacity: 0.9 },
  actionCount: { fontSize: 13, fontWeight: '700' },
});

export const StaffFeedPostCard = memo(function StaffFeedPostCard({
  postTag,
  authorName,
  authorAvatarUrl,
  authorBadge,
  isGuestPost,
  authorIsOnline = false,
  roleLabel,
  department,
  position,
  hotelName,
  timeAgo,
  title,
  media,
  hasMedia,
  liked,
  likeCount,
  commentCount,
  viewCount,
  showViewStats = true,
  viewersListEnabled = true,
  deletingPost,
  isPinned = false,
  isUrgent: isUrgentProp,
  celebrationKind: celebrationKindProp,
  onAuthorPress,
  onAvatarPress,
  onAvatarLongPress,
  onLike,
  onComment,
  onRepost,
  reposting = false,
  onViewers,
  onCardPress,
  onMenu,
  horizontalInset = 0,
  socialHeader = false,
}: StaffFeedPostCardProps) {
  const { t } = useTranslation();
  const palette = usePersonelDesign();
  const { isNight } = usePremiumTheme();
  const styles = useMemo(() => createPostCardStyles(palette), [isNight]); // eslint-disable-line react-hooks/exhaustive-deps
  const [expanded, setExpanded] = useState(false);
  const likePulse = useRef(new Animated.Value(1)).current;

  const sub = palette.subtext;
  const visual = getPostTagVisual(postTag);
  const isUrgent = isUrgentProp ?? visual.urgent ?? false;
  const celebrationKind = celebrationKindProp ?? detectFeedCelebration(title);
  const celebration = celebrationKind ? CELEBRATION_META[celebrationKind] : null;
  const roleBadge = getFeedRoleBadge(department, position);

  const rawTitle = (title ?? '').trim();
  const showReadMore = rawTitle.length > 280 || rawTitle.split('\n').length > BODY_MAX_LINES;
  const avatarUri = (authorAvatarUrl ?? '').trim() || null;

  const metaParts: string[] = [];
  if (socialHeader) {
    if (roleLabel && roleLabel !== '—') metaParts.push(roleLabel.split(' • ')[0]);
  } else {
    if (roleBadge) metaParts.push(roleBadge.label);
    else if (roleLabel && roleLabel !== '—') metaParts.push(roleLabel);
    if (hotelName) metaParts.push(hotelName);
  }
  metaParts.push(timeAgo || t('feedNow'));

  useEffect(() => {
    if (!liked) return;
    Animated.sequence([
      Animated.timing(likePulse, {
        toValue: 1.28,
        duration: 120,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(likePulse, { toValue: 1, useNativeDriver: true, speed: 26, bounciness: 10 }),
    ]).start();
  }, [liked, likePulse]);

  const avatarInner = avatarUri ? (
    <CachedImage
      uri={avatarUri}
      style={styles.avatarImg}
      contentFit="cover"
      transition={0}
      recyclingKey={avatarUri}
    />
  ) : (
    <LinearGradient
      colors={isGuestPost ? ['#94A3B8', '#64748B'] : [palette.accent, '#14B8A6']}
      style={styles.avatarPh}
    >
      <Text style={styles.avatarLetter}>{(authorName || '?').charAt(0).toUpperCase()}</Text>
    </LinearGradient>
  );

  return (
    <View
      style={[
        styles.post,
        {
          marginHorizontal: horizontalInset,
          borderColor: isUrgent ? 'rgba(239,68,68,0.35)' : palette.divider,
        },
      ]}
    >
      {(isPinned || isUrgent || celebration) && (
        <View style={styles.bannerRow}>
          {isPinned ? (
            <View
              style={[
                styles.chip,
                {
                  backgroundColor: '#FFFFFF',
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: palette.borderLight,
                },
              ]}
            >
              <Ionicons name="pin" size={12} color={palette.accent} />
              <Text style={[styles.chipText, { color: palette.accent }]}>Sabit</Text>
            </View>
          ) : null}
          {!isPinned && isUrgent ? (
            <View style={[styles.chip, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
              <Ionicons name="alert-circle" size={12} color="#ef4444" />
              <Text style={[styles.chipText, { color: '#ef4444' }]}>ACİL</Text>
            </View>
          ) : null}
          {celebration ? (
            <View style={[styles.chip, { backgroundColor: 'rgba(217,119,6,0.12)' }]}>
              <Text style={styles.chipText}>
                {celebration.emoji} {celebration.title}
              </Text>
            </View>
          ) : null}
        </View>
      )}

      <View style={styles.header}>
        <TouchableOpacity
          onPress={onAvatarPress ?? onAuthorPress}
          onLongPress={onAvatarLongPress}
          delayLongPress={1000}
          activeOpacity={0.75}
          style={styles.avatarCol}
        >
          <View style={[styles.avatarRing, { borderColor: authorIsOnline ? palette.online : palette.borderLight }]}>
            <View style={styles.avatarWrap}>{avatarInner}</View>
          </View>
          {!isGuestPost && authorIsOnline ? (
            <View style={styles.onlineDot}>
              <OnlinePresenceDot online size={12} borderColor={palette.cardBg} />
            </View>
          ) : null}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.identity}
          onPress={onAuthorPress}
          activeOpacity={onAuthorPress ? 0.7 : 1}
          disabled={!onAuthorPress}
        >
          <StaffNameWithBadge name={authorName} badge={authorBadge} textStyle={styles.name} />
          <Text style={styles.meta} numberOfLines={1}>
            {metaParts.join(' · ')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuBtn} onPress={onMenu} disabled={!!deletingPost} hitSlop={12}>
          {deletingPost ? (
            <ActivityIndicator size="small" color={theme.colors.textMuted} />
          ) : (
            <Ionicons name="ellipsis-horizontal" size={18} color={sub} />
          )}
        </TouchableOpacity>
      </View>

      <Pressable onPress={onCardPress}>
        {rawTitle ? (
          <View style={styles.body}>
            <Text style={styles.postText} numberOfLines={expanded ? undefined : BODY_MAX_LINES}>
              {rawTitle}
            </Text>
            {showReadMore ? (
              <TouchableOpacity onPress={() => setExpanded((v) => !v)} hitSlop={8}>
                <Text style={styles.readMore}>{expanded ? t('feedReadLess') : t('feedReadMore')}</Text>
              </TouchableOpacity>
            ) : null}
            <FeedTextTranslate text={rawTitle} />
          </View>
        ) : null}

        {hasMedia ? (
          <View style={[styles.mediaSlot, { marginHorizontal: -palette.cardPadding }]}>{media}</View>
        ) : null}
      </Pressable>

      <View style={styles.actionsRow}>
        <PremiumAction
          icon="chatbubble-outline"
          count={commentCount}
          color={REPLY_COLOR}
          pressBg="rgba(14,165,233,0.16)"
          activeColor={REPLY_COLOR}
          onPress={onComment}
        />
        {onRepost ? (
          <PremiumAction
            icon="repeat-outline"
            color={REPOST_COLOR}
            activeColor={REPOST_COLOR}
            pressBg="rgba(13,148,136,0.16)"
            onPress={onRepost}
            loading={reposting}
          />
        ) : (
          <View style={actionStyles.action} />
        )}
        <PremiumAction
          icon="heart-outline"
          activeIcon="heart"
          count={likeCount}
          color={liked ? LIKE_COLOR : palette.muted}
          activeColor={LIKE_COLOR}
          active={liked}
          pressBg="rgba(225,29,72,0.14)"
          onPress={onLike}
          scale={likePulse}
        />
        {showViewStats ? (
          <PremiumAction
            icon="stats-chart-outline"
            count={viewCount}
            showZeroCount
            color={palette.accent}
            pressBg="rgba(15,118,110,0.12)"
            onPress={viewersListEnabled ? onViewers : undefined}
            disabled={!viewersListEnabled}
          />
        ) : (
          <View style={actionStyles.action} />
        )}
      </View>
    </View>
  );
});

StaffFeedPostCard.displayName = 'StaffFeedPostCard';

function createPostCardStyles(p: PersonelDesignPalette) {
  return StyleSheet.create({
    post: {
      marginBottom: 0,
      paddingTop: 12,
      paddingBottom: 10,
      paddingHorizontal: p.cardPadding,
      backgroundColor: p.cardBg,
      borderRadius: 0,
      borderWidth: 0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
    },
    bannerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 10,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
    },
    chipText: { fontSize: 11, fontWeight: '800' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      marginBottom: 10,
    },
    avatarCol: { width: AVATAR + 4, height: AVATAR + 4, position: 'relative' },
    avatarRing: {
      width: AVATAR + 4,
      height: AVATAR + 4,
      borderRadius: (AVATAR + 4) / 2,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 1.5,
    },
    avatarWrap: {
      width: AVATAR,
      height: AVATAR,
      borderRadius: AVATAR / 2,
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
    },
    avatarImg: { width: '100%', height: '100%' },
    avatarPh: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarLetter: { fontSize: 18, fontWeight: '800', color: '#fff' },
    onlineDot: { position: 'absolute', bottom: 0, right: 0 },
    identity: { flex: 1, minWidth: 0 },
    name: { fontSize: 15, fontWeight: '800', color: p.text, lineHeight: 20 },
    meta: { marginTop: 2, fontSize: 12, fontWeight: '600', color: p.muted },
    menuBtn: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFFFFF',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.borderLight,
    },
    body: { marginBottom: 4 },
    postText: { fontSize: 15, fontWeight: '400', color: p.text, lineHeight: 22 },
    readMore: { marginTop: 6, fontSize: 13, fontWeight: '700', color: p.accent },
    mediaSlot: {
      marginTop: 10,
      borderRadius: 0,
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
    },
    actionsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 12,
      borderRadius: 0,
      paddingHorizontal: 0,
      paddingVertical: 2,
      backgroundColor: 'transparent',
      borderWidth: 0,
    },
  });
}
