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
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/theme';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import { StaffNameWithBadge } from '@/components/VerifiedBadge';
import { OnlinePresenceDot } from '@/components/OnlinePresenceDot';
import { CachedImage } from '@/components/CachedImage';
import { getPostTagVisual } from '@/lib/feedPostTagTheme';
import type { PostTagValue } from '@/lib/feedPostTags';
import { feedSharedText } from '@/lib/feedSharedI18n';
import { useTranslation } from 'react-i18next';
import { FeedTextTranslate } from '@/components/FeedTextTranslate';
import { PressableScale } from '@/components/premium/PressableScale';
import { GlassSurface } from '@/components/premium/GlassSurface';
import { getFeedRoleBadge, detectFeedCelebration, type FeedCelebrationKind } from '@/lib/feedRoleBadge';
import { pds } from '@/constants/personelDesignSystem';

const ACCENT = '#b8860b';
const BODY_MAX_LINES = 4;

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
};

const CELEBRATION_GRADIENT: Record<FeedCelebrationKind, { emoji: string; gradient: [string, string] }> = {
  birthday: { emoji: '🎂', gradient: ['#fdf2f8', '#fce7f3'] },
  employee_of_month: { emoji: '🏆', gradient: ['#fffbeb', '#fef3c7'] },
  promotion: { emoji: '🎉', gradient: ['#ecfdf5', '#d1fae5'] },
};

function ActionButton({
  icon,
  activeIcon,
  label,
  count,
  active,
  activeColor,
  onPress,
  disabled,
  loading,
  isNight,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon?: keyof typeof Ionicons.glyphMap;
  label: string;
  count?: number;
  active?: boolean;
  activeColor?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  isNight: boolean;
}) {
  const color = active ? (activeColor ?? '#ef4444') : isNight ? 'rgba(255,255,255,0.65)' : pds.subtext;
  const bg = active
    ? (activeColor ?? '#ef4444') + '18'
    : isNight
      ? 'rgba(255,255,255,0.06)'
      : 'rgba(184,134,11,0.06)';
  const border = active
    ? (activeColor ?? '#ef4444') + '40'
    : isNight
      ? 'rgba(255,255,255,0.1)'
      : 'rgba(184,134,11,0.15)';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionBtn,
        { backgroundColor: bg, borderColor: border },
        pressed && styles.actionBtnPressed,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Ionicons name={active && activeIcon ? activeIcon : icon} size={18} color={color} />
      )}
      <Text style={[styles.actionBtnLabel, { color: active ? (activeColor ?? '#ef4444') : isNight ? 'rgba(255,255,255,0.85)' : pds.text }]}>
        {label}
        {count != null && count > 0 ? ` · ${count}` : ''}
      </Text>
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
  commentPreview,
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
}: CustomerFeedPostCardProps) {
  const { t } = useTranslation();
  const { isNight, colors } = usePremiumTheme();
  const [expanded, setExpanded] = useState(false);
  const likePulse = useRef(new Animated.Value(1)).current;

  const text = isNight ? colors.text : pds.text;
  const sub = isNight ? colors.subtext : pds.subtext;

  const visual = getPostTagVisual(postTag);
  const isUrgent = isUrgentProp ?? visual.urgent ?? false;
  const celebrationKind = celebrationKindProp ?? detectFeedCelebration(title);
  const celebration = useMemo(() => {
    if (!celebrationKind) return null;
    const base = CELEBRATION_GRADIENT[celebrationKind];
    const titleKey =
      celebrationKind === 'birthday'
        ? 'feedBadgeBirthday'
        : celebrationKind === 'employee_of_month'
          ? 'feedBadgeEmployeeOfMonth'
          : 'feedBadgePromotion';
    return { ...base, title: t(titleKey) };
  }, [celebrationKind, t]);
  const roleBadge = getFeedRoleBadge(department, position);

  const rawTitle = (title ?? '').trim();
  const showReadMore = rawTitle.length > 180 || rawTitle.split('\n').length > BODY_MAX_LINES;

  const avatarUri = (authorAvatarUrl ?? '').trim() || null;
  const splitHeader = onAvatarPress != null && onAuthorPress != null;

  const ringColors: [string, string, ...string[]] = isGuestPost
    ? ['#4a6f8a', '#6b9bb8', '#4a6f8a']
    : authorBadge === 'blue'
      ? ['#3b82f6', '#60a5fa', '#2563eb']
      : authorBadge === 'yellow'
        ? ['#eab308', '#fbbf24', '#ca8a04']
        : [visual.bar, visual.badgeBg, visual.bar];

  useEffect(() => {
    if (!liked) return;
    Animated.sequence([
      Animated.timing(likePulse, { toValue: 1.25, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(likePulse, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 8 }),
    ]).start();
  }, [liked, likePulse]);

  const avatarBlock = (
    <LinearGradient colors={ringColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatarRing}>
      <View style={[styles.avatarInner, { backgroundColor: isNight ? colors.glassStrong : '#fff' }]}>
        {avatarUri ? (
          <CachedImage uri={avatarUri} style={styles.avatarImg} contentFit="cover" transition={0} recyclingKey={avatarUri} />
        ) : (
          <View style={[styles.avatarPh, isGuestPost && styles.avatarPhGuest]}>
            <Text style={[styles.avatarLetter, isGuestPost && styles.avatarLetterGuest]}>
              {(authorName || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      {!isGuestPost && authorIsOnline ? (
        <View style={styles.onlineDotWrap}>
          <OnlinePresenceDot online size={12} borderColor={isNight ? colors.glassStrong : '#fff'} />
        </View>
      ) : null}
    </LinearGradient>
  );

  const nameBlock = (
    <View style={styles.headerText}>
      <StaffNameWithBadge name={authorName} badge={authorBadge} textStyle={[styles.name, { color: text }]} />
      {roleBadge ? (
        <View style={styles.roleBadgeRow}>
          <Text style={styles.roleBadgeEmoji}>{roleBadge.emoji}</Text>
          <Text style={[styles.roleBadgeLabel, { color: sub }]} numberOfLines={1}>
            {roleBadge.label}
          </Text>
        </View>
      ) : roleLabel && roleLabel !== '—' ? (
        <Text style={[styles.roleFallback, { color: sub }]} numberOfLines={1}>
          {roleLabel}
        </Text>
      ) : null}
      {(hotelName || hotelLocation) ? (
        <View style={styles.orgRow}>
          {hotelName ? (
            <View style={styles.orgChip}>
              <Ionicons name="business-outline" size={10} color={ACCENT} />
              <Text style={[styles.orgLine, { color: sub }]} numberOfLines={1}>{hotelName}</Text>
            </View>
          ) : null}
          {hotelLocation ? (
            <View style={styles.orgChip}>
              <Ionicons name="location-outline" size={10} color={ACCENT} />
              <Text style={[styles.orgLine, { color: sub }]} numberOfLines={1}>{hotelLocation}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.outer, { marginHorizontal: horizontalInset }]}>
      <View style={styles.glowWrap}>
        <LinearGradient
          colors={
            isUrgent
              ? ['#ef444422', '#ef444408', 'transparent']
              : isNight
                ? ['#b8860b28', '#6366f118', 'transparent']
                : ['#b8860b20', '#6366f110', 'transparent']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.glowBg}
        />
        <PressableScale onPress={onCardPress} scaleTo={0.985} haptic={false}>
          <GlassSurface style={styles.panel} borderRadius={22} intensity={52} blur={false} strong>
            {visual.label !== t('feedBadgeOther') ? (
              <LinearGradient
                colors={[visual.bar, visual.bar + '88']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.tagStripe}
              />
            ) : null}

            {isPinned ? (
              <View style={[styles.pinnedBar, { backgroundColor: ACCENT + '12' }]}>
                <Ionicons name="pin" size={13} color={ACCENT} />
                <Text style={[styles.pinnedText, { color: ACCENT }]}>{t('feedPinned')}</Text>
              </View>
            ) : null}

            {isUrgent ? (
              <LinearGradient colors={['#ef4444', '#dc2626']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.urgentBanner}>
                <Ionicons name="alert-circle" size={16} color="#fff" />
                <Text style={styles.urgentBannerText}>{t('feedUrgentBanner')}</Text>
              </LinearGradient>
            ) : null}

            {celebration ? (
              <LinearGradient colors={celebration.gradient} style={styles.celebrationBanner}>
                <Text style={[styles.celebrationText, { color: text }]}>
                  {celebration.emoji} {celebration.title}
                </Text>
              </LinearGradient>
            ) : null}

            <View style={styles.inner}>
              <View style={styles.headerRow}>
                {splitHeader ? (
                  <View style={styles.headerLeft}>
                    <TouchableOpacity
                      onPress={onAvatarPress}
                      onLongPress={onAvatarLongPress}
                      delayLongPress={1000}
                      activeOpacity={0.75}
                    >
                      {avatarBlock}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onAuthorPress} activeOpacity={0.75} style={{ flex: 1, minWidth: 0 }}>
                      {nameBlock}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.headerLeft}
                    onPress={onAuthorPress}
                    activeOpacity={onAuthorPress ? 0.75 : 1}
                    disabled={!onAuthorPress}
                  >
                    {avatarBlock}
                    {nameBlock}
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.menuBtn} onPress={onMenu} disabled={!!deletingPost} hitSlop={12}>
                  {deletingPost ? (
                    <ActivityIndicator size="small" color={sub} />
                  ) : (
                    <View style={[styles.menuBtnInner, { backgroundColor: isNight ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' }]}>
                      <Ionicons name="ellipsis-horizontal" size={18} color={sub} />
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.tagTimeRow}>
                <LinearGradient
                  colors={[visual.badgeBg, visual.badgeBg + 'cc']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.tagPill}
                >
                  <Text style={styles.tagEmoji}>{visual.emoji}</Text>
                  <Text style={[styles.tagPillText, { color: visual.badgeText }]}>{visual.label}</Text>
                </LinearGradient>
                <View style={[styles.timeChip, { backgroundColor: isNight ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                  <Ionicons name="time-outline" size={11} color={sub} />
                  <Text style={[styles.timeAgo, { color: sub }]}>{timeAgo || t('feedNow')}</Text>
                </View>
              </View>

              {rawTitle ? (
                <View style={styles.body}>
                  <Text style={[styles.postTitle, { color: text }]} numberOfLines={expanded ? undefined : BODY_MAX_LINES}>
                    {rawTitle}
                  </Text>
                  {showReadMore && !expanded ? (
                    <TouchableOpacity onPress={() => setExpanded(true)} hitSlop={8}>
                      <Text style={styles.readMore}>{t('feedReadMore')}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {expanded && showReadMore ? (
                    <TouchableOpacity onPress={() => setExpanded(false)} hitSlop={8}>
                      <Text style={styles.readMore}>{t('feedReadLess')}</Text>
                    </TouchableOpacity>
                  ) : null}
                  <FeedTextTranslate text={rawTitle} />
                </View>
              ) : null}

              {hasMedia ? (
                <View style={[styles.mediaSlot, { borderColor: isNight ? 'rgba(255,255,255,0.08)' : 'rgba(184,134,11,0.12)' }]}>
                  {media}
                </View>
              ) : null}

              {commentPreview && commentPreview.length > 0 ? (
                <Pressable
                  style={[styles.commentPreviewWrap, { backgroundColor: isNight ? 'rgba(255,255,255,0.05)' : 'rgba(184,134,11,0.06)', borderColor: isNight ? 'rgba(255,255,255,0.08)' : 'rgba(184,134,11,0.15)' }]}
                  onPress={onComment}
                >
                  {commentPreview.slice(0, 2).map((c, idx) => (
                    <View key={`${idx}-${c.author}`} style={styles.commentPreviewRow}>
                      <Text style={[styles.commentPreviewAuthor, { color: text }]} numberOfLines={1}>
                        {c.author}
                      </Text>
                      <Text style={[styles.commentPreviewText, { color: sub }]} numberOfLines={1}>
                        {c.text}
                      </Text>
                    </View>
                  ))}
                  <Text style={styles.commentPreviewMore}>
                    {commentCount > commentPreview.length ? t('feedSeeAllComments') : t('feedViewComments')}
                  </Text>
                </Pressable>
              ) : null}

              {(likeCount > 0 || commentCount > 0 || (showViewStats && viewCount > 0)) ? (
                <View style={[styles.statsRow, { borderTopColor: isNight ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                  {likeCount > 0 ? (
                    <View style={styles.statChip}>
                      <Ionicons name="heart" size={12} color="#ef4444" />
                      <Text style={[styles.statText, { color: sub }]}>{likeCount}</Text>
                    </View>
                  ) : null}
                  {commentCount > 0 ? (
                    <View style={styles.statChip}>
                      <Ionicons name="chatbubble" size={12} color={ACCENT} />
                      <Text style={[styles.statText, { color: sub }]}>{commentCount}</Text>
                    </View>
                  ) : null}
                  {showViewStats && viewCount > 0 ? (
                    <Pressable onPress={viewersListEnabled ? onViewers : undefined} disabled={!viewersListEnabled} style={styles.statChip}>
                      <Ionicons name="eye" size={12} color={sub} />
                      <Text style={[styles.statText, { color: sub }]}>{viewCount}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.actionsRow}>
                <Animated.View style={{ transform: [{ scale: likePulse }] }}>
                  <ActionButton
                    icon="heart-outline"
                    activeIcon="heart"
                    label={t('feedActionLike')}
                    count={likeCount}
                    active={liked}
                    activeColor="#ef4444"
                    onPress={onLike}
                    isNight={isNight}
                  />
                </Animated.View>
                <ActionButton
                  icon="chatbubble-outline"
                  label={t('feedActionComment')}
                  count={commentCount}
                  onPress={onComment}
                  isNight={isNight}
                />
                {onRepost ? (
                  <ActionButton
                    icon="arrow-redo-outline"
                    label={t('feedActionShare')}
                    onPress={onRepost}
                    loading={reposting}
                    isNight={isNight}
                  />
                ) : null}
                {viewersListEnabled ? (
                  <ActionButton icon="eye-outline" label={t('feedActionViewers')} onPress={onViewers} isNight={isNight} />
                ) : null}
              </View>

              <TouchableOpacity style={styles.detailCta} onPress={onCardPress} activeOpacity={0.85}>
                <LinearGradient
                  colors={isNight ? ['#b8860b33', '#b8860b18'] : ['#b8860b22', '#b8860b0c']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.detailCtaGrad}
                >
                  <Text style={[styles.detailCtaText, { color: ACCENT }]}>{feedSharedText('feedDetailsArrow')}</Text>
                  <Ionicons name="chevron-forward" size={16} color={ACCENT} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </GlassSurface>
        </PressableScale>
      </View>
    </View>
  );
});

CustomerFeedPostCard.displayName = 'CustomerFeedPostCard';

const styles = StyleSheet.create({
  outer: { marginTop: 4 },
  glowWrap: { position: 'relative' },
  glowBg: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 26,
    opacity: 0.85,
  },
  panel: {
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#b8860b', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 5 },
    }),
  },
  tagStripe: { height: 3, width: '100%' },
  pinnedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  pinnedText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  urgentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginTop: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  urgentBannerText: { fontSize: 12, fontWeight: '900', color: '#fff', letterSpacing: 0.6 },
  celebrationBanner: {
    marginHorizontal: 14,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  celebrationText: { fontSize: 13, fontWeight: '800' },
  inner: { padding: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12, minWidth: 0 },
  avatarRing: {
    width: 50,
    height: 50,
    borderRadius: 25,
    padding: 2.5,
    position: 'relative',
  },
  avatarInner: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
    overflow: 'hidden',
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
  onlineDotWrap: { position: 'absolute', bottom: 0, right: 0 },
  headerText: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '800', lineHeight: 20 },
  roleBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  roleBadgeEmoji: { fontSize: 12 },
  roleBadgeLabel: { fontSize: 11, fontWeight: '700', flexShrink: 1 },
  roleFallback: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  orgRow: { marginTop: 5, gap: 4 },
  orgChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  orgLine: { fontSize: 11, fontWeight: '600', flexShrink: 1 },
  menuBtn: { padding: 2 },
  menuBtnInner: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tagTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 8,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tagEmoji: { fontSize: 11 },
  tagPillText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.3 },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  timeAgo: { fontSize: 11, fontWeight: '700' },
  body: { marginTop: 12 },
  postTitle: { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  readMore: { marginTop: 6, fontSize: 13, fontWeight: '800', color: ACCENT },
  mediaSlot: {
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  commentPreviewWrap: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  commentPreviewRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  commentPreviewAuthor: { fontSize: 12, fontWeight: '800', maxWidth: '40%' },
  commentPreviewText: { flex: 1, fontSize: 12 },
  commentPreviewMore: { marginTop: 4, fontSize: 12, fontWeight: '800', color: ACCENT },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 12, fontWeight: '700' },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 0,
  },
  actionBtnPressed: { opacity: 0.75 },
  actionBtnLabel: { fontSize: 12, fontWeight: '800' },
  detailCta: { marginTop: 12, borderRadius: 12, overflow: 'hidden' },
  detailCtaGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  detailCtaText: { fontSize: 13, fontWeight: '800' },
});
