import { useState, memo, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import type { PersonelDesignPalette } from '@/constants/personelDesignSystem';
import { StaffNameWithBadge } from '@/components/VerifiedBadge';
import { OnlinePresenceDot } from '@/components/OnlinePresenceDot';
import { CachedImage } from '@/components/CachedImage';
import { getPostTagVisual } from '@/lib/feedPostTagTheme';
import type { PostTagValue } from '@/lib/feedPostTags';
import { feedSharedText } from '@/lib/feedSharedI18n';
import { useTranslation } from 'react-i18next';
import { FeedTextTranslate } from '@/components/FeedTextTranslate';
import { PressableScale } from '@/components/premium/PressableScale';
import { getFeedRoleBadge, detectFeedCelebration, type FeedCelebrationKind } from '@/lib/feedRoleBadge';

const SPACING = { xs: 4, sm: 8, md: 12, lg: 16 } as const;
const BODY_MAX_LINES = 4;

export type StaffFeedPostCardProps = {
  postTag: PostTagValue | string | null | undefined;
  authorName: string;
  authorAvatarUrl: string | null;
  authorBadge: 'blue' | 'yellow' | null;
  isGuestPost: boolean;
  authorIsOnline?: boolean;
  roleLabel: string | null;
  /** Departman (rol rozeti için) */
  department?: string | null;
  position?: string | null;
  hotelName?: string | null;
  hotelLocation?: string | null;
  timeAgo: string;
  /** @deprecated İkinci tarih satırı kaldırıldı */
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
  /** Akışa yeniden paylaş (repost) */
  onRepost?: () => void;
  reposting?: boolean;
  onViewers: () => void;
  onCardPress: () => void;
  onMenu: () => void;
  horizontalInset?: number;
};

const CELEBRATION_META: Record<
  FeedCelebrationKind,
  { emoji: string; title: string; bg: string; border: string }
> = {
  birthday: { emoji: '🎂', title: 'Doğum Günü', bg: '#fdf2f8', border: '#f9a8d4' },
  employee_of_month: { emoji: '🏆', title: 'Ayın Personeli', bg: '#fffbeb', border: '#fcd34d' },
  promotion: { emoji: '🎉', title: 'Terfi', bg: '#ecfdf5', border: '#6ee7b7' },
};

function formatCount(n: number, singular: string, plural: string): string {
  if (n === 0) return `0 ${singular}`;
  return `${n} ${n === 1 ? singular : plural}`;
}

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
  horizontalInset = SPACING.lg,
}: StaffFeedPostCardProps) {
  const { t } = useTranslation();
  const palette = usePersonelDesign();
  const { isNight } = usePremiumTheme();
  const styles = useMemo(() => createPostCardStyles(palette), [isNight]);
  const [expanded, setExpanded] = useState(false);

  const visual = getPostTagVisual(postTag);
  const isUrgent = isUrgentProp ?? visual.urgent ?? false;
  const celebrationKind = celebrationKindProp ?? detectFeedCelebration(title);
  const celebration = celebrationKind ? CELEBRATION_META[celebrationKind] : null;
  const roleBadge = getFeedRoleBadge(department, position);

  const rawTitle = (title ?? '').trim();
  const showReadMore = rawTitle.length > 180 || rawTitle.split('\n').length > BODY_MAX_LINES;

  const ringGlow = isGuestPost
    ? 'rgba(74,111,138,0.5)'
    : authorBadge === 'blue'
      ? 'rgba(59,130,246,0.45)'
      : authorBadge === 'yellow'
        ? 'rgba(234,179,8,0.45)'
        : visual.avatarGlow;

  const avatarUri = (authorAvatarUrl ?? '').trim() || null;
  const splitHeader = onAvatarPress != null && onAuthorPress != null;

  const avatarBlock = (
    <View style={styles.avatarOuter}>
      <View style={[styles.avatarWrap, { shadowColor: ringGlow }]}>
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
      {!isGuestPost && authorIsOnline ? <OnlinePresenceDot online size={11} borderColor={palette.cardBg} /> : null}
    </View>
  );

  const nameBlock = (
    <View style={styles.headerText}>
      <StaffNameWithBadge name={authorName} badge={authorBadge} textStyle={styles.name} />
      {roleBadge ? (
        <View style={styles.roleBadgeRow}>
          <Text style={styles.roleBadgeEmoji}>{roleBadge.emoji}</Text>
          <Text style={styles.roleBadgeLabel} numberOfLines={1}>
            {roleBadge.label}
          </Text>
        </View>
      ) : roleLabel && roleLabel !== '—' ? (
        <Text style={styles.roleFallback} numberOfLines={1}>
          {roleLabel}
        </Text>
      ) : null}
      {(hotelName || hotelLocation) ? (
        <View style={styles.orgRow}>
          {hotelName ? (
            <Text style={styles.orgLine} numberOfLines={1}>
              🏨 {hotelName}
            </Text>
          ) : null}
          {hotelLocation ? (
            <Text style={styles.orgLine} numberOfLines={1}>
              📍 {hotelLocation}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.outer, { marginHorizontal: horizontalInset }]}>
      <PressableScale onPress={onCardPress} scaleTo={0.985} haptic={false}>
        <View
          style={[
            styles.surface,
            isUrgent && styles.surfaceUrgent,
            celebration && { backgroundColor: celebration.bg, borderColor: celebration.border },
          ]}
        >
          {visual.label !== 'Diğer' ? (
            <View style={[styles.tagStripe, { backgroundColor: visual.bar }]} />
          ) : null}

          {isPinned ? (
            <View style={styles.pinnedBar}>
              <Ionicons name="pin" size={14} color={theme.colors.primary} />
              <Text style={styles.pinnedText}>Sabitlenmiş gönderi</Text>
            </View>
          ) : null}

          {isUrgent ? (
            <View style={styles.urgentBanner}>
              <Text style={styles.urgentBannerText}>🚨 ACİL DUYURU</Text>
            </View>
          ) : null}

          {celebration ? (
            <View style={[styles.celebrationBanner, { borderColor: celebration.border }]}>
              <Text style={styles.celebrationText}>
                {celebration.emoji} {celebration.title}
              </Text>
            </View>
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
                  <ActivityIndicator size="small" color={theme.colors.textMuted} />
                ) : (
                  <Ionicons name="ellipsis-horizontal" size={22} color={palette.subtext} />
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.tagTimeRow}>
              <View style={[styles.tagPill, { backgroundColor: visual.badgeBg }]}>
                <Text style={styles.tagEmoji}>{visual.emoji}</Text>
                <Text style={[styles.tagPillText, { color: visual.badgeText }]}>{visual.label}</Text>
              </View>
              <Text style={styles.timeAgo}>{timeAgo || t('feedNow')}</Text>
            </View>

            {rawTitle ? (
              <View style={styles.body}>
                <Text style={styles.postTitle} numberOfLines={expanded ? undefined : BODY_MAX_LINES}>
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

            {hasMedia ? <View style={styles.mediaSlot}>{media}</View> : null}

            {commentPreview && commentPreview.length > 0 ? (
              <Pressable style={styles.commentPreviewWrap} onPress={onComment}>
                {commentPreview.slice(0, 2).map((c, idx) => (
                  <View key={`${idx}-${c.author}`} style={styles.commentPreviewRow}>
                    <Text style={styles.commentPreviewAuthor} numberOfLines={1}>
                      {c.author}
                    </Text>
                    <Text style={styles.commentPreviewText} numberOfLines={1}>
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
              <View style={styles.statsRow}>
                {likeCount > 0 ? (
                  <Text style={styles.statText}>❤️ {formatCount(likeCount, 'Beğeni', 'Beğeni')}</Text>
                ) : null}
                {commentCount > 0 ? (
                  <Text style={styles.statText}>💬 {formatCount(commentCount, 'Yorum', 'Yorum')}</Text>
                ) : null}
                {showViewStats && viewCount > 0 ? (
                  <Pressable onPress={viewersListEnabled ? onViewers : undefined} disabled={!viewersListEnabled}>
                    <Text style={styles.statText}>👁️ {formatCount(viewCount, 'Görüntüleme', 'Görüntüleme')}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <View style={styles.quickActions} onStartShouldSetResponder={() => true}>
              <Pressable
                style={({ pressed }) => [styles.quickBtn, pressed && styles.quickBtnPressed]}
                onPress={onLike}
              >
                <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={liked ? theme.colors.error : palette.subtext} />
                <Text style={[styles.quickLabel, liked && styles.quickLabelActive]}>
                  Beğen{likeCount > 0 ? ` · ${likeCount}` : ''}
                </Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.quickBtn, pressed && styles.quickBtnPressed]} onPress={onComment}>
                <Ionicons name="chatbubble-outline" size={21} color={palette.subtext} />
                <Text style={styles.quickLabel}>Yorum</Text>
              </Pressable>
              {viewersListEnabled ? (
                <Pressable style={({ pressed }) => [styles.quickBtn, pressed && styles.quickBtnPressed]} onPress={onViewers}>
                  <Ionicons name="eye-outline" size={21} color={palette.subtext} />
                  <Text style={styles.quickLabel}>Görenler</Text>
                </Pressable>
              ) : null}
              {onRepost ? (
                <Pressable
                  style={({ pressed }) => [styles.quickBtn, pressed && styles.quickBtnPressed]}
                  onPress={onRepost}
                  disabled={reposting}
                >
                  {reposting ? (
                    <ActivityIndicator size="small" color={palette.subtext} />
                  ) : (
                    <Ionicons name="arrow-redo-outline" size={21} color={palette.subtext} />
                  )}
                  <Text style={styles.quickLabel}>Paylaş</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.footerRow}>
              <View style={{ flex: 1 }} />
              <Text style={styles.detailLink}>{feedSharedText('feedDetailsArrow')}</Text>
            </View>
          </View>
        </View>
      </PressableScale>
    </View>
  );
});

StaffFeedPostCard.displayName = 'StaffFeedPostCard';

function createPostCardStyles(p: PersonelDesignPalette) {
  return StyleSheet.create({
  outer: {
    marginTop: p.cardGap,
    borderRadius: p.cardRadius,
    ...p.shadowCard,
  },
  surface: {
    borderRadius: p.cardRadius,
    backgroundColor: p.cardBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: p.cardBorder,
    overflow: 'hidden',
    ...(p.cardInnerGlow !== 'transparent'
      ? { borderTopWidth: 1, borderTopColor: p.cardInnerGlow }
      : null),
  },
  surfaceUrgent: {
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  tagStripe: {
    height: 3,
    width: '100%',
  },
  pinnedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: p.cardPadding,
    paddingTop: 10,
    paddingBottom: 2,
  },
  pinnedText: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  urgentBanner: {
    marginHorizontal: p.cardPadding,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  urgentBannerText: { fontSize: 13, fontWeight: '800', color: '#b91c1c', letterSpacing: 0.4 },
  celebrationBanner: {
    marginHorizontal: p.cardPadding,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  celebrationText: { fontSize: 14, fontWeight: '800', color: p.text },
  inner: { padding: p.cardPadding },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10, minWidth: 0 },
  avatarOuter: { position: 'relative', width: 44, height: 44, flexShrink: 0 },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 2,
  },
  avatarImg: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.borderLight },
  avatarPh: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPhGuest: { backgroundColor: theme.colors.guestAvatarBg },
  avatarLetter: { fontSize: 17, fontWeight: '700', color: theme.colors.white },
  avatarLetterGuest: { color: theme.colors.guestAvatarLetter },
  headerText: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '700', color: p.text, lineHeight: 20 },
  roleBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  roleBadgeEmoji: { fontSize: 13 },
  roleBadgeLabel: { fontSize: 12, fontWeight: '700', color: p.muted, flexShrink: 1 },
  roleFallback: { fontSize: 12, fontWeight: '600', color: p.muted, marginTop: 3 },
  orgRow: { marginTop: 4, gap: 2 },
  orgLine: { fontSize: 11, fontWeight: '500', color: p.subtext },
  menuBtn: { padding: 4, marginTop: 2 },
  tagTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 8,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  tagEmoji: { fontSize: 11 },
  tagPillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
  timeAgo: { fontSize: 12, fontWeight: '600', color: p.muted },
  body: { marginTop: SPACING.md },
  postTitle: { fontSize: 15, fontWeight: '400', color: p.text, lineHeight: 22 },
  readMore: { marginTop: 6, fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  mediaSlot: {
    marginTop: SPACING.md,
    marginHorizontal: -p.cardPadding,
    overflow: 'hidden',
  },
  commentPreviewWrap: {
    marginTop: SPACING.md,
    padding: 12,
    borderRadius: 12,
    backgroundColor: p.commentPreviewBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: p.commentPreviewBorder,
  },
  commentPreviewRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  commentPreviewAuthor: { fontSize: 12, fontWeight: '800', color: p.text, maxWidth: '40%' },
  commentPreviewText: { flex: 1, fontSize: 12, color: p.subtext },
  commentPreviewMore: { marginTop: 4, fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: p.divider,
  },
  statText: { fontSize: 13, fontWeight: '600', color: p.subtext },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 4,
  },
  quickBtn: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    minWidth: 64,
    gap: 2,
    borderRadius: 12,
    backgroundColor: p.secondaryBtn,
  },
  quickBtnPressed: { opacity: 0.7 },
  quickLabel: { fontSize: 11, fontWeight: '600', color: p.subtext },
  quickLabelActive: { color: theme.colors.error },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 4,
  },
  detailLink: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
});
}
