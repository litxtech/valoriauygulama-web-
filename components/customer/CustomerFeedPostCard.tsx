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
import { theme } from '@/constants/theme';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import { StaffNameWithBadge } from '@/components/VerifiedBadge';
import { OnlinePresenceDot } from '@/components/OnlinePresenceDot';
import { CachedImage } from '@/components/CachedImage';
import { getPostTagVisual } from '@/lib/feedPostTagTheme';
import type { PostTagValue } from '@/lib/feedPostTags';
import { useTranslation } from 'react-i18next';
import { FeedTextTranslate } from '@/components/FeedTextTranslate';
import { getFeedRoleBadge, detectFeedCelebration, type FeedCelebrationKind } from '@/lib/feedRoleBadge';

const LIKE_COLOR = '#f91880';
const REPOST_COLOR = '#00ba7c';
const BODY_MAX_LINES = 8;

export type CustomerFeedPostCardProps = {
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
  /** Akışta sade başlık — rol/otel satırları gizlenir (personel feed ile aynı) */
  socialHeader?: boolean;
};

const CELEBRATION_META: Record<FeedCelebrationKind, { emoji: string; key: string }> = {
  birthday: { emoji: '🎂', key: 'feedBadgeBirthday' },
  employee_of_month: { emoji: '🏆', key: 'feedBadgeEmployeeOfMonth' },
  promotion: { emoji: '🎉', key: 'feedBadgePromotion' },
};

function XAction({
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
}) {
  const tint = active ? (activeColor ?? color) : color;
  const iconNode = (
    <Ionicons name={active && activeIcon ? activeIcon : icon} size={18} color={tint} />
  );
  return (
    <Pressable
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
      onPress={onPress}
      disabled={disabled || loading || !onPress}
      hitSlop={8}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : scale ? (
        <Animated.View style={{ transform: [{ scale }] }}>{iconNode}</Animated.View>
      ) : (
        iconNode
      )}
      {count != null && count > 0 ? (
        <Text style={[styles.actionCount, { color: tint }]}>{count}</Text>
      ) : null}
    </Pressable>
  );
}

export const CustomerFeedPostCard = memo(function CustomerFeedPostCard({
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
  hotelLocation,
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
}: CustomerFeedPostCardProps) {
  const { t } = useTranslation();
  const { isNight, colors } = usePremiumTheme();
  const [expanded, setExpanded] = useState(false);
  const likePulse = useRef(new Animated.Value(1)).current;

  const text = isNight ? colors.text : '#0f1419';
  const sub = isNight ? colors.subtext : '#536471';
  const border = isNight ? 'rgba(255,255,255,0.1)' : '#eff3f4';
  const mediaBorder = isNight ? 'rgba(255,255,255,0.12)' : '#eff3f4';

  const visual = getPostTagVisual(postTag);
  const isUrgent = isUrgentProp ?? visual.urgent ?? false;
  const celebrationKind = celebrationKindProp ?? detectFeedCelebration(title);
  const celebration = useMemo(() => {
    if (!celebrationKind) return null;
    const base = CELEBRATION_META[celebrationKind];
    return { emoji: base.emoji, title: t(base.key) };
  }, [celebrationKind, t]);
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
  if (timeAgo) metaParts.push(timeAgo);
  else metaParts.push(t('feedNow'));

  useEffect(() => {
    if (!liked) return;
    Animated.sequence([
      Animated.timing(likePulse, { toValue: 1.3, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(likePulse, { toValue: 1, useNativeDriver: true, speed: 26, bounciness: 10 }),
    ]).start();
  }, [liked, likePulse]);

  const avatarInner = avatarUri ? (
    <CachedImage uri={avatarUri} style={styles.avatarImg} contentFit="cover" transition={0} recyclingKey={avatarUri} />
  ) : (
    <View style={[styles.avatarPh, isGuestPost && styles.avatarPhGuest]}>
      <Text style={[styles.avatarLetter, isGuestPost && styles.avatarLetterGuest]}>
        {(authorName || '?').charAt(0).toUpperCase()}
      </Text>
    </View>
  );

  return (
    <View style={[styles.post, { borderBottomColor: border, marginHorizontal: horizontalInset }]}>
      {isPinned ? (
        <View style={styles.topLabel}>
          <Ionicons name="pin" size={13} color={sub} />
          <Text style={[styles.topLabelText, { color: sub }]}>{t('feedPinned')}</Text>
        </View>
      ) : null}
      {!isPinned && isUrgent ? (
        <View style={styles.topLabel}>
          <Ionicons name="alert-circle" size={13} color="#ef4444" />
          <Text style={[styles.topLabelText, { color: '#ef4444' }]}>{t('feedUrgentBanner')}</Text>
        </View>
      ) : null}
      {celebration ? (
        <View style={styles.topLabel}>
          <Text style={styles.topLabelText}>{celebration.emoji}</Text>
          <Text style={[styles.topLabelText, { color: sub }]}>{celebration.title}</Text>
        </View>
      ) : null}

      <View style={styles.row}>
        <TouchableOpacity
          onPress={onAvatarPress ?? onAuthorPress}
          onLongPress={onAvatarLongPress}
          delayLongPress={1000}
          activeOpacity={0.75}
          style={styles.avatarCol}
        >
          <View style={styles.avatarWrap}>{avatarInner}</View>
          {!isGuestPost && authorIsOnline ? (
            <View style={styles.onlineDot}>
              <OnlinePresenceDot online size={12} borderColor={isNight ? colors.pageBg : '#fff'} />
            </View>
          ) : null}
        </TouchableOpacity>

        <View style={styles.content}>
          <View style={styles.topRow}>
            <TouchableOpacity
              style={styles.identity}
              onPress={onAuthorPress}
              activeOpacity={onAuthorPress ? 0.7 : 1}
              disabled={!onAuthorPress}
            >
              <View style={styles.nameWrap}>
                <StaffNameWithBadge name={authorName} badge={authorBadge} textStyle={[styles.name, { color: text }]} />
              </View>
              <Text style={[styles.meta, { color: sub }]} numberOfLines={1}>
                {'  ·  '}
                {metaParts.join('  ·  ')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuBtn} onPress={onMenu} disabled={!!deletingPost} hitSlop={12}>
              {deletingPost ? (
                <ActivityIndicator size="small" color={sub} />
              ) : (
                <Ionicons name="ellipsis-horizontal" size={18} color={sub} />
              )}
            </TouchableOpacity>
          </View>

          <Pressable onPress={onCardPress}>
            {rawTitle ? (
              <View style={styles.body}>
                <Text style={[styles.postText, { color: text }]} numberOfLines={expanded ? undefined : BODY_MAX_LINES}>
                  {rawTitle}
                </Text>
                {showReadMore ? (
                  <TouchableOpacity onPress={() => setExpanded((v) => !v)} hitSlop={8}>
                    <Text style={[styles.readMore, { color: sub }]}>
                      {expanded ? t('feedReadLess') : t('feedReadMore')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <FeedTextTranslate text={rawTitle} />
              </View>
            ) : null}

            {hasMedia ? (
              <View style={[styles.mediaSlot, { borderColor: mediaBorder }]}>{media}</View>
            ) : null}
          </Pressable>

          <View style={styles.actionsRow}>
            <XAction icon="chatbubble-outline" count={commentCount} color={sub} onPress={onComment} />
            {onRepost ? (
              <XAction
                icon="repeat-outline"
                color={sub}
                activeColor={REPOST_COLOR}
                onPress={onRepost}
                loading={reposting}
              />
            ) : (
              <View style={styles.action} />
            )}
            <XAction
              icon="heart-outline"
              activeIcon="heart"
              count={likeCount}
              color={sub}
              activeColor={LIKE_COLOR}
              active={liked}
              onPress={onLike}
              scale={likePulse}
            />
            {showViewStats ? (
              <XAction
                icon="stats-chart-outline"
                count={viewCount}
                color={sub}
                onPress={viewersListEnabled ? onViewers : undefined}
                disabled={!viewersListEnabled}
              />
            ) : (
              <View style={styles.action} />
            )}
          </View>
        </View>
      </View>
    </View>
  );
});

CustomerFeedPostCard.displayName = 'CustomerFeedPostCard';

const AVATAR = 44;

const styles = StyleSheet.create({
  post: {
    paddingTop: 12,
    paddingBottom: 4,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: AVATAR + 12,
    marginBottom: 2,
  },
  topLabelText: { fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 12 },
  avatarCol: { width: AVATAR, height: AVATAR, position: 'relative' },
  avatarWrap: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    overflow: 'hidden',
    backgroundColor: theme.colors.borderLight,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarPh: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPhGuest: { backgroundColor: theme.colors.guestAvatarBg },
  avatarLetter: { fontSize: 18, fontWeight: '800', color: theme.colors.white },
  avatarLetterGuest: { color: theme.colors.guestAvatarLetter },
  onlineDot: { position: 'absolute', bottom: 0, right: 0 },
  content: { flex: 1, minWidth: 0 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start' },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  nameWrap: { flexShrink: 1 },
  name: { fontSize: 15, fontWeight: '800', lineHeight: 20 },
  meta: { flexShrink: 1, fontSize: 14, fontWeight: '400' },
  menuBtn: { paddingLeft: 8, marginTop: -2 },
  body: { marginTop: 2 },
  postText: { fontSize: 15, fontWeight: '400', lineHeight: 21 },
  readMore: { marginTop: 4, fontSize: 14, fontWeight: '600' },
  mediaSlot: {
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingRight: 12,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 44, paddingVertical: 4 },
  actionPressed: { opacity: 0.6 },
  actionCount: { fontSize: 13, fontWeight: '600' },
});
