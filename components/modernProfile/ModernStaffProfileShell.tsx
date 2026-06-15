import { useMemo, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Linking,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';
import { CachedImage } from '@/components/CachedImage';
import {
  TikTokProfileBody,
  TikTokProfileCoverHeader,
  type TikTokProfileAction,
} from '@/components/tiktokProfile/TikTokProfileUI';
import { StaffProfileFeedGrid } from '@/components/StaffProfileFeedGrid';
import { LinkifiedText } from '@/components/LinkifiedText';
import { AnimatedCounter } from '@/components/modernProfile/AnimatedCounter';
import {
  deriveProfileBadges,
  computeProfileCompletion,
  achievementTierFromCount,
  type ModernProfileStaffInput,
} from '@/lib/modernProfileModel';
import {
  formatStatCompact,
  formatProfileDateShort,
  formatLastActiveShort,
  tenureBreakdown,
} from '@/lib/modernProfileTenure';
import { getDepartmentLabel } from '@/lib/departmentLabels';
import type { StaffProfileVisitRow } from '@/lib/staffProfileVisits';
import { ProfileQrCardModal } from '@/components/modernProfile/ProfileQrCardModal';
import { ProfileBadgesSheet } from '@/components/modernProfile/ProfileBadgesSheet';
import { ProfileMenuSheet, type ProfileMenuAction } from '@/components/modernProfile/ProfileMenuSheet';
import {
  ProfileContactActionsBar,
  type ProfileContactAction,
} from '@/components/modernProfile/ProfileContactActionsBar';
import { useRouter } from 'expo-router';
import { openStaffProfileVisitor } from '@/lib/staffProfileVisits';
import { shareStaffProfile } from '@/lib/profileShare';
import {
  ProfileTabCard,
  ProfileSectionTitle,
  ProfileTenureHighlight,
  ProfileBioBlock,
  ProfileInfoRow,
  ProfileInfoGroup,
  ProfileChipGroup,
  ProfileChip,
  ProfileSocialButton,
  ProfileCompletionBlock,
  ProfileAchievementItem,
  ProfileVisitorRow,
  ProfileEmptyState,
} from '@/components/modernProfile/ProfileTabCards';
import { STAFF_SOCIAL_KEYS, staffSocialOpenUrl, type StaffSocialKey } from '@/lib/staffSocialLinks';

export type ModernProfileContentTab = 'posts' | 'media' | 'achievements' | 'about' | 'visitors';

/** @deprecated menuActions kullanın */
export type QuickAction = ProfileMenuAction;

type Props = {
  input: ModernProfileStaffInput;
  mode: 'self' | 'staff_viewer' | 'guest_viewer';
  staffId: string;
  feedLinkVariant: 'staff' | 'customer';
  /** Avatar altı — yalnızca çevrim içi vb. minimal ek */
  belowIdentity?: ReactNode;
  /** Kapak ⋯ menüsü (controlled) */
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  /** ⋯ menüdeki ek işlemler (paylaş, QR vb. menüde kalır) */
  menuActions?: ProfileMenuAction[];
  /** Avatar altında görünen iletişim kısayolları (ara, mesaj, e-posta, WhatsApp, bahşiş) */
  contactActions?: ProfileContactAction[];
  extraMenuItems?: ProfileMenuAction[];
  showCompletion?: boolean;
  showVisitorsTab?: boolean;
  profileVisits?: StaffProfileVisitRow[];
  profileVisitsLoading?: boolean;
  onTenurePress?: () => void;
  onReviewsPress?: () => void;
  onLanguagesPress?: () => void;
  onEditPress?: () => void;
  onSignOutPress?: () => void;
  onCertificatesPress?: () => void;
  profileLinkViewer?: 'staff' | 'customer';
  allowOwnPostDelete?: boolean;
  viewerStaffId?: string | null;
  cardStyle?: ViewStyle;
  restricted?: boolean;
  /** Instagram vb. — Hakkında sekmesinde */
  socialLinks?: Record<string, string> | null;
  topInset?: number;
  onCoverPress?: () => void;
  onAvatarPress?: () => void;
  onAccountPress?: () => void;
  uploadingCover?: boolean;
  coverLeftAction?: ReactNode;
};

const TAB_KEYS: ModernProfileContentTab[] = ['posts', 'media', 'achievements', 'about'];

const TIER_COLORS: Record<string, string> = {
  bronze: '#b45309',
  silver: '#64748b',
  gold: '#ca8a04',
  platinum: '#6366f1',
  diamond: '#0ea5e9',
};

export function ModernStaffProfileShell({
  input,
  mode,
  staffId,
  feedLinkVariant,
  belowIdentity,
  menuOpen: menuOpenProp,
  onMenuOpenChange,
  menuActions = [],
  contactActions = [],
  extraMenuItems = [],
  showCompletion = false,
  showVisitorsTab = false,
  profileVisits = [],
  profileVisitsLoading = false,
  onTenurePress,
  onReviewsPress,
  onLanguagesPress,
  onEditPress,
  onSignOutPress,
  onCertificatesPress,
  profileLinkViewer = 'staff',
  allowOwnPostDelete = false,
  viewerStaffId = null,
  cardStyle,
  restricted = false,
  socialLinks,
  topInset = 0,
  onCoverPress,
  onAvatarPress,
  onAccountPress,
  uploadingCover = false,
  coverLeftAction,
}: Props) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'tr';
  const [contentTab, setContentTab] = useState<ModernProfileContentTab>('posts');
  const [menuInternal, setMenuInternal] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);
  const [badgesVisible, setBadgesVisible] = useState(false);
  const menuVisible = menuOpenProp ?? menuInternal;
  const setMenuVisible = (v: boolean) => {
    onMenuOpenChange?.(v);
    if (menuOpenProp === undefined) setMenuInternal(v);
  };

  const badges = useMemo(() => deriveProfileBadges(input), [input]);
  const completion = useMemo(() => computeProfileCompletion(input), [input]);
  const days = input.daysWithUs ?? 0;
  const breakdown = tenureBreakdown(days);
  const joinIso = input.hireDate ?? input.createdAt ?? null;

  const tiktokStats = useMemo(() => {
    const s = input.stats;
    return [
      { value: formatStatCompact(s?.tasksCompleted ?? 0, lang), label: t('modernProfileStatTasks') },
      { value: formatStatCompact(s?.visits ?? 0, lang), label: t('modernProfileStatVisits') },
      { value: formatStatCompact(s?.likes ?? 0, lang), label: t('modernProfileStatLikes') },
    ];
  }, [input.stats, lang, t]);

  const profileActions: TikTokProfileAction[] = useMemo(() => {
    const list: TikTokProfileAction[] = [];
    if (mode === 'self') {
      if (onEditPress) {
        list.push({ id: 'edit', icon: 'create-outline', label: t('editProfileInfo'), onPress: onEditPress });
      }
      if (onAccountPress) {
        list.push({ id: 'account', icon: 'person-outline', label: t('account'), onPress: onAccountPress });
      }
      if (onReviewsPress) {
        list.push({
          id: 'reviews',
          icon: 'star-outline',
          label: t('modernProfileReviews'),
          onPress: onReviewsPress,
        });
      }
      return list;
    }
    if (onReviewsPress) {
      list.push({
        id: 'reviews',
        icon: 'star-outline',
        label: t('modernProfileReviews'),
        onPress: onReviewsPress,
      });
    }
    if (onTenurePress && days > 0) {
      list.push({
        id: 'tenure',
        icon: 'ribbon-outline',
        label: t('modernProfileCareerTitle'),
        onPress: onTenurePress,
      });
    }
    return list;
  }, [mode, onEditPress, onAccountPress, onReviewsPress, onTenurePress, days, t]);

  const tabs = useMemo(() => {
    const list = [...TAB_KEYS];
    if (showVisitorsTab) list.push('visitors');
    return list;
  }, [showVisitorsTab]);

  const positionLine = [
    input.position?.trim() ? getDepartmentLabel(input.position.trim()) : null,
    input.department?.trim() ? getDepartmentLabel(input.department.trim()) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const lastActiveLabel = formatLastActiveShort(input.stats?.lastActive ?? null, lang);

  const allMenuItems = useMemo(() => {
    const items: ProfileMenuAction[] = [...menuActions];
    if (onReviewsPress) {
      items.push({
        id: 'reviews',
        icon: 'star-outline',
        label: t('modernProfileReviews'),
        onPress: onReviewsPress,
      });
    }
    if (onLanguagesPress && (input.languages?.length ?? 0) > 0) {
      items.push({
        id: 'languages',
        icon: 'language-outline',
        label: t('modernProfileLanguages', { count: input.languages!.length }),
        onPress: onLanguagesPress,
      });
    }
    if (onTenurePress && days > 0) {
      items.push({
        id: 'tenure',
        icon: 'ribbon-outline',
        label: t('modernProfileCareerTitle'),
        onPress: onTenurePress,
      });
    }
    items.push({
      id: 'share',
      icon: 'share-outline',
      label: t('modernProfileMenuShare'),
      onPress: () => {
        void shareStaffProfile({
          staffId,
          fullName: input.fullName || '',
          organizationName: input.organizationName,
          viewer: profileLinkViewer,
        });
      },
    });
    items.push({
      id: 'qr',
      icon: 'qr-code-outline',
      label: t('modernProfileMenuQr'),
      onPress: () => setQrVisible(true),
    });
    if (mode === 'self') {
      items.push({
        id: 'badges',
        icon: 'medal-outline',
        label: t('modernProfileMenuBadges'),
        onPress: () => setBadgesVisible(true),
      });
      if (onCertificatesPress) {
        items.push({
          id: 'certificates',
          icon: 'document-text-outline',
          label: t('modernProfileMenuCertificates'),
          onPress: onCertificatesPress,
        });
      }
      if (onEditPress) {
        items.push({
          id: 'edit',
          icon: 'create-outline',
          label: t('editProfileInfo'),
          onPress: onEditPress,
        });
      }
      if (onSignOutPress) {
        items.push({
          id: 'signout',
          icon: 'log-out-outline',
          label: t('modernProfileMenuSignOut'),
          destructive: true,
          onPress: onSignOutPress,
        });
      }
    }
    items.push(...extraMenuItems);
    const seen = new Set<string>();
    return items.filter((it) => {
      if (seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });
  }, [
    menuActions,
    extraMenuItems,
    mode,
    staffId,
    input,
    days,
    profileLinkViewer,
    onReviewsPress,
    onLanguagesPress,
    onTenurePress,
    onEditPress,
    onCertificatesPress,
    onSignOutPress,
    t,
  ]);

  if (restricted) {
    return (
      <View style={styles.restrictedBanner}>
        <Ionicons name="eye-off-outline" size={22} color="#92400e" />
        <Text style={styles.restrictedText}>{t('staffProfileHiddenByAdminBanner')}</Text>
      </View>
    );
  }

  const tabDefs = tabs.map((tab) => ({
    key: tab,
    label:
      tab === 'posts'
        ? t('modernProfileTabPosts')
        : tab === 'media'
          ? t('modernProfileTabMedia')
          : tab === 'achievements'
            ? t('modernProfileTabAchievements')
            : tab === 'about'
              ? t('modernProfileTabAbout')
              : t('profileVisitorsTab'),
  }));

  const metaParts = [positionLine, input.organizationName, input.officeLocation?.trim()].filter(Boolean);

  return (
    <View style={styles.shell}>
      <TikTokProfileCoverHeader
        coverUri={input.coverImage}
        topInset={topInset}
        onCoverPress={onCoverPress}
        onMenuPress={restricted ? undefined : () => setMenuVisible(true)}
        onSettingsPress={mode === 'self' && onAccountPress ? onAccountPress : undefined}
        uploadingCover={uploadingCover}
        leftAction={coverLeftAction}
      />

      <TikTokProfileBody
        profileImage={input.profileImage}
        fullName={input.fullName || '—'}
        verificationBadge={input.verificationBadge ?? null}
        bio={input.bio}
        metaLine={metaParts.join(' · ') || undefined}
        stats={tiktokStats}
        actions={profileActions}
        onAvatarPress={onAvatarPress}
        tabs={tabDefs}
        activeTab={contentTab}
        onTabChange={(k) => setContentTab(k as ModernProfileContentTab)}
        belowBio={
          <>
            <View
              style={[
                styles.statusPill,
                { backgroundColor: input.isOnline ? P.pill.online.bg : P.pill.offline.bg },
              ]}
            >
              <View
                style={[
                  styles.onlineDot,
                  { backgroundColor: input.isOnline ? P.pill.online.dot : P.pill.offline.dot },
                ]}
              />
              <Text
                style={[
                  styles.onlineText,
                  { color: input.isOnline ? P.pill.online.text : P.pill.offline.text },
                ]}
              >
                {input.isOnline ? t('online') : t('offlineStatus')}
              </Text>
            </View>
            {belowIdentity}
            {contactActions.length > 0 ? <ProfileContactActionsBar actions={contactActions} /> : null}
          </>
        }
      >
        {contentTab === 'posts' ? (
          <StaffProfileFeedGrid
            staffId={staffId}
            linkVariant={feedLinkVariant}
            showEmptyHint
            allowOwnPostDelete={allowOwnPostDelete}
            viewerStaffId={viewerStaffId}
            edgeToEdge
            feedFilter="all"
            showEngagementOverlay
          />
        ) : null}
        {contentTab === 'media' ? (
          <StaffProfileFeedGrid
            staffId={staffId}
            linkVariant={feedLinkVariant}
            showEmptyHint
            allowOwnPostDelete={allowOwnPostDelete}
            viewerStaffId={viewerStaffId}
            edgeToEdge
            feedFilter="media"
            showEngagementOverlay
          />
        ) : null}
        {contentTab === 'achievements' ? (
          <ProfileTabCard style={cardStyle}>
            <ProfileSectionTitle title={t('modernProfileTabAchievements')} icon="trophy-outline" />
            {(input.achievements?.length ?? 0) > 0 || badges.length > 0 ? (
              <View style={styles.achievementsList}>
                {(input.achievements ?? []).map((a, i) => {
                  const tier = achievementTierFromCount(i + 1);
                  return (
                    <ProfileAchievementItem
                      key={`${a}-${i}`}
                      title={a}
                      subtitle={tier.toUpperCase()}
                      accentColor={TIER_COLORS[tier]}
                    />
                  );
                })}
                {badges.map((b) => (
                  <ProfileAchievementItem
                    key={`ach-${b.id}`}
                    title={t(b.labelKey, { years: breakdown.years })}
                    emoji={b.emoji}
                    accentColor={P.accent.purple}
                  />
                ))}
              </View>
            ) : (
              <ProfileEmptyState
                icon="trophy-outline"
                title={t('modernProfileAchievementsEmpty')}
              />
            )}
          </ProfileTabCard>
        ) : null}
        {contentTab === 'about' ? (
          <ProfileTabCard style={cardStyle}>
            <ProfileSectionTitle title={t('profileUiAboutSection')} icon="information-circle-outline" />
            {days > 0 ? (
              <ProfileTenureHighlight
                title={t('modernProfileCareerTitle')}
                daysNode={<AnimatedCounter value={days} style={styles.tenureDaysCounter} />}
                unitLabel={t('modernProfileStatWorkDays')}
                meta={
                  breakdown.years > 0
                    ? t('modernProfileTenureYears', { years: breakdown.years })
                    : t('modernProfileTenureMonths', { months: breakdown.months })
                }
                onPress={onTenurePress}
              />
            ) : null}
            {input.bio?.trim() ? (
              <ProfileBioBlock>
                <LinkifiedText text={input.bio} textStyle={styles.aboutText} linkStyle={styles.aboutLink} />
              </ProfileBioBlock>
            ) : null}
            <ProfileInfoGroup>
              {lastActiveLabel ? (
                <ProfileInfoRow icon="time-outline" label={t('modernProfileLastActive')} value={lastActiveLabel} />
              ) : null}
              <ProfileInfoRow
                icon="calendar-outline"
                label={t('staffProfileHireDate')}
                value={formatProfileDateShort(joinIso, lang)}
              />
              <ProfileInfoRow
                icon="briefcase-outline"
                label={t('modernProfileAboutPosition')}
                value={positionLine || t('unspecified')}
              />
              <ProfileInfoRow
                icon="business-outline"
                label={t('modernProfileAboutDepartment')}
                value={input.department ? getDepartmentLabel(input.department) : t('unspecified')}
              />
              {input.phone?.trim() ? (
                <ProfileInfoRow
                  icon="call-outline"
                  label={t('phone')}
                  value={input.phone}
                  onPress={() => Linking.openURL(`tel:${input.phone!.trim()}`)}
                />
              ) : null}
              {input.email?.trim() ? (
                <ProfileInfoRow
                  icon="mail-outline"
                  label={t('email')}
                  value={input.email}
                  onPress={() => Linking.openURL(`mailto:${input.email!.trim()}`)}
                />
              ) : null}
              {input.whatsapp?.trim() && mode !== 'guest_viewer' ? (
                <ProfileInfoRow
                  icon="logo-whatsapp"
                  label={t('modernProfileQuickWhatsApp')}
                  value={input.whatsapp}
                  onPress={() => {
                    const digits = input.whatsapp!.trim().replace(/\D/g, '');
                    if (digits) void Linking.openURL(`https://wa.me/${digits}`);
                  }}
                />
              ) : null}
              {input.shiftLabel ? (
                <ProfileInfoRow icon="time-outline" label={t('workHours')} value={input.shiftLabel} />
              ) : null}
              <ProfileInfoRow
                icon="pulse-outline"
                label={t('modernProfileAboutWorkStatus')}
                value={input.isOnline ? t('online') : t('offlineStatus')}
                valueColor={input.isOnline ? P.accent.green : P.subtext}
                trailing={
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: input.isOnline ? P.pill.online.dot : P.pill.offline.dot },
                    ]}
                  />
                }
              />
            </ProfileInfoGroup>
            {input.specialties?.length ? (
              <ProfileChipGroup label={t('modernProfileSpecialties')}>
                {input.specialties.map((s, i) => (
                  <ProfileChip key={i} label={s} />
                ))}
              </ProfileChipGroup>
            ) : null}
            {socialLinks && Object.keys(socialLinks).length > 0 ? (
              <SocialLinksAboutRow links={socialLinks} />
            ) : null}
            {showCompletion ? (
              <ProfileCompletionBlock
                title={t('modernProfileCompletion')}
                percent={completion.percent}
                missingLabels={completion.missing.slice(0, 3).map((m) => t(m.labelKey))}
              />
            ) : null}
          </ProfileTabCard>
        ) : null}
        {contentTab === 'visitors' ? (
          <ProfileTabCard style={cardStyle}>
            <ProfileSectionTitle title={t('profileVisitorsTab')} icon="eye-outline" />
            {profileVisitsLoading && profileVisits.length === 0 ? (
              <ProfileEmptyState icon="hourglass-outline" title={t('loading')} />
            ) : profileVisits.length === 0 ? (
              <ProfileEmptyState
                icon="eye-off-outline"
                title={t('profileVisitorsEmpty')}
                hint={t('profileVisitorsHint')}
              />
            ) : (
              profileVisits.map((item) => {
                const canOpenProfile = !!(item.visitor_staff_id || item.visitor_guest_id);
                return (
                  <ProfileVisitorRow
                    key={item.id}
                    name={item.visitor_name || '—'}
                    meta={`${item.visitor_kind === 'staff' ? t('visitorTypeStaff') : t('visitorTypeGuest')} · ${new Date(item.visited_at).toLocaleString(lang.split('-')[0], {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`}
                    canOpenProfile={canOpenProfile}
                    onPress={() => openStaffProfileVisitor(router, item, profileLinkViewer)}
                    avatar={
                      <CachedImage
                        uri={item.visitor_photo || undefined}
                        style={styles.visitAvatar}
                        contentFit="cover"
                      />
                    }
                  />
                );
              })
            )}
          </ProfileTabCard>
        ) : null}
      </TikTokProfileBody>

      <ProfileMenuSheet visible={menuVisible} onClose={() => setMenuVisible(false)} items={allMenuItems} />

      <ProfileQrCardModal
        visible={qrVisible}
        onClose={() => setQrVisible(false)}
        staffId={staffId}
        fullName={input.fullName || '—'}
        positionLine={positionLine || null}
        organizationName={input.organizationName}
        viewer={profileLinkViewer}
      />
      <ProfileBadgesSheet
        visible={badgesVisible}
        onClose={() => setBadgesVisible(false)}
        badges={badges}
        yearsExperience={breakdown.years}
      />
    </View>
  );
}

function SocialLinksAboutRow({ links }: { links: Record<string, string> }) {
  const { t } = useTranslation();
  const entries = STAFF_SOCIAL_KEYS.map((key) => {
    const raw = links[key]?.trim();
    if (!raw) return null;
    const href = staffSocialOpenUrl(key as StaffSocialKey, raw);
    if (!href) return null;
    const icon =
      key === 'instagram'
        ? ('logo-instagram' as const)
        : key === 'facebook'
          ? ('logo-facebook' as const)
          : key === 'linkedin'
            ? ('logo-linkedin' as const)
            : ('logo-twitter' as const);
    const label =
      key === 'instagram'
        ? 'Instagram'
        : key === 'facebook'
          ? 'Facebook'
          : key === 'linkedin'
            ? 'LinkedIn'
            : 'X';
    return { key, href, icon, label };
  }).filter(Boolean) as { key: string; href: string; icon: keyof typeof Ionicons.glyphMap; label: string }[];

  if (entries.length === 0) return null;

  return (
    <ProfileChipGroup label={t('modernProfileSocialLinks')}>
      {entries.map((e) => (
        <ProfileSocialButton key={e.key} icon={e.icon} label={e.label} onPress={() => Linking.openURL(e.href)} />
      ))}
    </ProfileChipGroup>
  );
}

const styles = StyleSheet.create({
  shell: { width: '100%', backgroundColor: '#fff' },
  restrictedBanner: {
    margin: 16,
    padding: 14,
    backgroundColor: '#fffbeb',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fcd34d',
    gap: 8,
  },
  restrictedText: { fontSize: 14, color: '#78350f', fontWeight: '600' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  onlineText: { fontSize: 12, fontWeight: '700' },
  aboutPremiumBlock: {
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: P.border,
  },
  aboutPremiumLine: { fontSize: 15, fontWeight: '800', color: P.text, lineHeight: 22 },
  aboutPremiumSub: { fontSize: 13, color: P.subtext, marginTop: 4 },
  tenureDaysCounter: { fontSize: 32, fontWeight: '900', color: '#fff' },
  achievementsList: { gap: 8 },
  aboutText: { fontSize: 15, lineHeight: 22, color: P.text },
  aboutLink: { color: P.accent.blue, textDecorationLine: 'underline', fontWeight: '600' },
  visitAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: P.cardMuted },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
});
