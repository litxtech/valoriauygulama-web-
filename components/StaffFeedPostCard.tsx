import { useState, memo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/theme';
import { pds } from '@/constants/personelDesignSystem';
import { StaffNameWithBadge } from '@/components/VerifiedBadge';
import { OnlinePresenceDot } from '@/components/OnlinePresenceDot';
import { CachedImage } from '@/components/CachedImage';
import { getPostTagVisual } from '@/lib/feedPostTagTheme';
import type { PostTagValue } from '@/lib/feedPostTags';
import { feedSharedText } from '@/lib/feedSharedI18n';
import { useTranslation } from 'react-i18next';
import { FeedTextTranslate } from '@/components/FeedTextTranslate';
import { FastPress } from '@/components/ui/FastPress';

const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 } as const;

const SHORT_TITLE_MAX_LEN = 72;

export type StaffFeedPostCardProps = {
  postTag: PostTagValue | string | null | undefined;
  authorName: string;
  authorAvatarUrl: string | null;
  authorBadge: 'blue' | 'yellow' | null;
  isGuestPost: boolean;
  /** Personel çevrimiçi (yeşil nabız) */
  authorIsOnline?: boolean;
  /** Personel departmanı veya gösterilecek rol metni */
  roleLabel: string | null;
  timeAgo: string;
  createdAtLabel: string;
  title: string | null;
  media: React.ReactNode;
  hasMedia: boolean;
  liked: boolean;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  /** Görüntülenme satırını göster (misafir: yalnızca kendi paylaşımında) */
  showViewStats?: boolean;
  /** true: göz satırına basınca görüntüleyen listesi (yalnızca kendi personel paylaşımı) */
  viewersListEnabled?: boolean;
  commentPreview?: { author: string; text: string }[];
  notifOn?: boolean;
  togglingLike: boolean;
  togglingNotif?: boolean;
  deletingPost: boolean;
  onAuthorPress?: () => void;
  /** Avatar ayrı dokunulduğunda (ör. hikaye); yalnızca `onAuthorPress` ile birlikte anlamlı */
  onAvatarPress?: () => void;
  /** Hikaye varken uzun basınca profil (parent 1000ms kullanmalı) */
  onAvatarLongPress?: () => void;
  onLike: () => void;
  onComment: () => void;
  onViewers: () => void;
  /** Sağdaki premium “Detayları Gör” (genelde yorum sayfası) */
  onDetailsPress: () => void;
  onMenu: () => void;
  horizontalInset?: number;
};

export const StaffFeedPostCard = memo(function StaffFeedPostCard({
  postTag,
  authorName,
  authorAvatarUrl,
  authorBadge,
  isGuestPost,
  authorIsOnline = false,
  roleLabel,
  timeAgo,
  createdAtLabel,
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
  togglingLike,
  deletingPost,
  onAuthorPress,
  onAvatarPress,
  onAvatarLongPress,
  onLike,
  onComment,
  onViewers,
  onDetailsPress,
  onMenu,
  horizontalInset = SPACING.lg,
}: StaffFeedPostCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const introOpacity = useRef(new Animated.Value(0)).current;
  const introTranslateY = useRef(new Animated.Value(10)).current;
  const visual = getPostTagVisual(postTag);
  const rawTitle = (title ?? '').trim();
  const isShort = rawTitle.length > 0 && rawTitle.length <= SHORT_TITLE_MAX_LEN && !rawTitle.includes('\n\n');
  const showReadMore = rawTitle.length > 140;
  const showAuthorAvatar = true;

  const ringGlow = isGuestPost
    ? 'rgba(74,111,138,0.5)'
    : authorBadge === 'blue'
      ? 'rgba(59,130,246,0.45)'
      : authorBadge === 'yellow'
        ? 'rgba(234,179,8,0.45)'
        : visual.avatarGlow;

  const AuthorWrapper = onAuthorPress && !(showAuthorAvatar && onAvatarPress) ? TouchableOpacity : View;
  const authorProps =
    onAuthorPress && !(showAuthorAvatar && onAvatarPress)
      ? { onPress: onAuthorPress, activeOpacity: 0.75 as const }
      : {};

  const splitHeader = showAuthorAvatar && onAvatarPress != null && onAuthorPress != null;

  const showRoleChip =
    !!roleLabel &&
    roleLabel !== '—' &&
    roleLabel !== t('visitorTypeGuest') &&
    roleLabel !== t('visitorTypeStaff');

  const avatarUri = (authorAvatarUrl ?? '').trim() || null;

  const avatarBlock = showAuthorAvatar ? (
    <View style={styles.avatarOuter}>
      <View style={[styles.avatarWrap, { shadowColor: ringGlow }]}>
        {avatarUri ? (
          <CachedImage
            uri={avatarUri}
            style={styles.avatarImg}
            contentFit="cover"
            transition={0}
            recyclingKey={avatarUri}
          />
        ) : (
          <View style={[styles.avatarPh, isGuestPost && styles.avatarPhGuest]}>
            <Text style={[styles.avatarLetter, isGuestPost && styles.avatarLetterGuest]}>
              {(authorName || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      {!isGuestPost && authorIsOnline ? <OnlinePresenceDot online size={11} borderColor={pds.cardBg} /> : null}
    </View>
  ) : null;

  const nameAndMeta = (
    <>
      <StaffNameWithBadge name={authorName} badge={authorBadge} textStyle={styles.name} />
      <View style={styles.metaRow}>
        {showRoleChip ? (
          <View style={styles.roleChip}>
            <Text style={styles.roleChipText} numberOfLines={1}>
              {roleLabel}
            </Text>
          </View>
        ) : null}
        <Text style={styles.time} numberOfLines={1}>
          {timeAgo || t('feedNow')}
        </Text>
      </View>
      <Text style={styles.dateTime}>{createdAtLabel}</Text>
    </>
  );

  useEffect(() => {
    if (Platform.OS === 'android') {
      introOpacity.setValue(1);
      introTranslateY.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(introOpacity, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(introTranslateY, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();
  }, [introOpacity, introTranslateY]);

  const Outer = Platform.OS === 'android' ? View : Animated.View;
  const outerAnimStyle =
    Platform.OS === 'android'
      ? undefined
      : { opacity: introOpacity, transform: [{ translateY: introTranslateY }] };

  return (
    <Outer
      style={[styles.outer, { marginHorizontal: horizontalInset }, outerAnimStyle]}
    >
      <View style={styles.pressable}>
        <View style={styles.surface}>
          <View style={styles.row}>
            <View style={styles.inner}>
              <View style={styles.headerRow}>
                {splitHeader ? (
                  <View style={styles.headerLeft}>
                    <TouchableOpacity
                      onPress={onAvatarPress}
                      onLongPress={onAvatarLongPress}
                      delayLongPress={1000}
                      activeOpacity={0.75}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    >
                      {avatarBlock}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onAuthorPress} activeOpacity={0.75} style={styles.headerText}>
                      {nameAndMeta}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <AuthorWrapper style={styles.headerLeft} {...authorProps}>
                    {avatarBlock}
                    <View style={styles.headerText}>{nameAndMeta}</View>
                  </AuthorWrapper>
                )}
                <TouchableOpacity
                  style={styles.menuBtn}
                  onPress={onMenu}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  activeOpacity={0.7}
                  disabled={!!deletingPost}
                >
                  {deletingPost ? (
                    <ActivityIndicator size="small" color={theme.colors.textMuted} />
                  ) : (
                    <Ionicons name="ellipsis-vertical" size={20} color={theme.colors.textMuted} style={{ opacity: 0.5 }} />
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.tagRow}>
                <View style={[styles.tagPill, { backgroundColor: visual.badgeBg }]}>
                  <Text style={[styles.tagPillText, { color: visual.badgeText }]}>{visual.label}</Text>
                </View>
              </View>

              {hasMedia ? <View style={styles.mediaSlot}>{media}</View> : null}

              {rawTitle ? (
                <View style={styles.body}>
                  <Text
                    style={[styles.postTitle, isShort && styles.postTitleShort]}
                    numberOfLines={expanded ? undefined : 3}
                  >
                    {rawTitle}
                  </Text>
                  {showReadMore && !expanded ? (
                    <TouchableOpacity onPress={() => setExpanded(true)} hitSlop={8} activeOpacity={0.7}>
                      <Text style={styles.readMore}>{t('feedReadMore')}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {expanded && showReadMore ? (
                    <TouchableOpacity onPress={() => setExpanded(false)} hitSlop={8} activeOpacity={0.7}>
                      <Text style={styles.readMore}>{t('feedReadLess')}</Text>
                    </TouchableOpacity>
                  ) : null}
                  <FeedTextTranslate text={rawTitle} />
                </View>
              ) : null}

              {commentPreview && commentPreview.length > 0 ? (
                <FastPress style={styles.commentPreviewWrap} onPress={onComment} activeOpacity={0.85}>
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
                  {commentCount > commentPreview.length ? (
                    <Text style={styles.commentPreviewMore}>{t('feedSeeAllComments')}</Text>
                  ) : (
                    <Text style={styles.commentPreviewMore}>{t('feedViewComments')}</Text>
                  )}
                </FastPress>
              ) : null}

              <View style={styles.actionsRow}>
                <View style={styles.actionLeft}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionPill,
                      liked && styles.actionPillActive,
                      pressed && styles.actionPressed,
                    ]}
                    onPress={onLike}
                    disabled={!!togglingLike}
                  >
                    <Ionicons
                      name={liked ? 'heart' : 'heart-outline'}
                      size={18}
                      color={liked ? theme.colors.error : pds.subtext}
                    />
                    <Text style={[styles.actionPillText, liked && styles.actionPillTextActive]}>{likeCount}</Text>
                  </Pressable>

                  <Pressable style={({ pressed }) => [styles.actionPill, pressed && styles.actionPressed]} onPress={onComment}>
                    <Ionicons name="chatbubble-outline" size={17} color={pds.subtext} />
                    <Text style={styles.actionPillText}>{commentCount}</Text>
                  </Pressable>

                  {showViewStats ? (
                    viewersListEnabled ? (
                      <Pressable style={({ pressed }) => [styles.actionPill, pressed && styles.actionPressed]} onPress={onViewers}>
                        <Ionicons name="paper-plane-outline" size={17} color={pds.subtext} />
                        <Text style={styles.actionPillText}>{viewCount}</Text>
                      </Pressable>
                    ) : (
                      <View style={styles.actionPill}>
                        <Ionicons name="paper-plane-outline" size={17} color={pds.subtext} />
                        <Text style={styles.actionPillText}>{viewCount}</Text>
                      </View>
                    )
                  ) : null}
                </View>

                <FastPress onPress={onDetailsPress} activeOpacity={0.88} style={styles.detailsBtnWrap} rippleColor="rgba(255,255,255,0.2)">
                  {Platform.OS === 'android' ? (
                    <View style={[styles.detailsBtn, styles.detailsBtnAndroid]}>
                      <Text style={styles.detailsBtnText}>{feedSharedText('feedDetailsButton')}</Text>
                    </View>
                  ) : (
                    <LinearGradient colors={pds.gradientPremium} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.detailsBtn}>
                      <Text style={styles.detailsBtnText}>{feedSharedText('feedDetailsButton')}</Text>
                    </LinearGradient>
                  )}
                </FastPress>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Outer>
  );
});

StaffFeedPostCard.displayName = 'StaffFeedPostCard';

const styles = StyleSheet.create({
  outer: {
    marginTop: pds.cardGap,
    marginBottom: 0,
    borderRadius: pds.cardRadius,
    backgroundColor: pds.cardBg,
    ...pds.shadowCard,
  },
  pressable: {
    borderRadius: pds.cardRadius,
    overflow: 'hidden',
  },
  surface: {
    borderRadius: pds.cardRadius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F3F4F6',
    backgroundColor: pds.cardBg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  inner: {
    flex: 1,
    padding: pds.cardPadding,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    minWidth: 0,
  },
  avatarOuter: {
    position: 'relative',
    width: 36,
    height: 36,
    flexShrink: 0,
  },
  avatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 6,
    elevation: 3,
  },
  avatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.borderLight,
  },
  avatarPh: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPhGuest: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.guestAvatarBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: { fontSize: 15, fontWeight: '700', color: theme.colors.white },
  avatarLetterGuest: { fontSize: 15, fontWeight: '700', color: theme.colors.guestAvatarLetter },
  headerText: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '700', color: pds.text },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: 4,
  },
  roleChip: {
    maxWidth: '70%',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: theme.colors.borderLight,
  },
  roleChipText: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary },
  time: { fontSize: 12, fontWeight: '500', color: pds.subtext },
  dateTime: { fontSize: 11, color: pds.subtext, marginTop: 2 },
  menuBtn: { padding: SPACING.sm, marginTop: -4 },
  tagRow: { marginTop: 10 },
  tagPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  tagPillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  mediaSlot: {
    marginTop: 10,
    marginLeft: -pds.cardPadding,
    marginRight: -pds.cardPadding,
    borderRadius: pds.mediaRadius,
    overflow: 'hidden',
  },
  body: { marginTop: SPACING.md },
  postTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: pds.text,
    lineHeight: 24,
  },
  postTitleShort: {
    fontSize: 18,
    lineHeight: 1.45 * 18,
    fontWeight: '500',
  },
  readMore: {
    marginTop: SPACING.sm,
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  commentPreviewWrap: {
    marginTop: SPACING.md,
    padding: 12,
    borderRadius: 16,
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  commentPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  commentPreviewAuthor: { fontSize: 12, fontWeight: '900', color: theme.colors.text, maxWidth: '42%' },
  commentPreviewText: { flex: 1, fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  commentPreviewMore: { marginTop: 2, fontSize: 12, fontWeight: '800', color: theme.colors.primary },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F3F4F6',
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    flexWrap: 'wrap',
    gap: 8,
  },
  actionPressed: { opacity: 0.75 },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: pds.actionBtnRadius,
    backgroundColor: pds.pageBg,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  actionPillActive: {
    backgroundColor: `${theme.colors.error}10`,
    borderColor: `${theme.colors.error}33`,
  },
  actionPillText: { fontSize: 13, fontWeight: '800', color: pds.subtext, minWidth: 16 },
  actionPillTextActive: { color: theme.colors.error },
  detailsBtnWrap: { flexShrink: 0 },
  detailsBtn: {
    borderRadius: pds.actionBtnRadius,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  detailsBtnAndroid: {
    backgroundColor: pds.indigo,
  },
  detailsBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
