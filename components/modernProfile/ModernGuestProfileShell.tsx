import { useMemo, useState, type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';
import { GuestProfileFeedGrid } from '@/components/GuestProfileFeedGrid';
import { LinkifiedText } from '@/components/LinkifiedText';
import { ProfileMenuSheet, type ProfileMenuAction } from '@/components/modernProfile/ProfileMenuSheet';
import {
  ProfileTabCard,
  ProfileSectionTitle,
  ProfileBioBlock,
  ProfileInfoRow,
  ProfileInfoGroup,
  ProfileEmptyState,
} from '@/components/modernProfile/ProfileTabCards';
import type { ModernGuestProfileInput } from '@/lib/modernGuestProfileModel';
import type { GuestFeedVisibility } from '@/lib/guestProfileFeedThumbnails';
import { formatStatCompact } from '@/lib/modernProfileTenure';
import {
  TikTokProfileBody,
  TikTokProfileCoverHeader,
  type TikTokProfileAction,
} from '@/components/tiktokProfile/TikTokProfileUI';

export type ModernGuestProfileTab = 'posts' | 'media' | 'about';

type Props = {
  input: ModernGuestProfileInput;
  guestId: string | null;
  mode: 'self' | 'viewer';
  feedVisibility?: GuestFeedVisibility;
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  menuActions?: ProfileMenuAction[];
  onEditPress?: () => void;
  onSettingsPress?: () => void;
  onAccountPress?: () => void;
  onAvatarPress?: () => void;
  onCoverPress?: () => void;
  onMessagePress?: () => void;
  messageLoading?: boolean;
  topInset?: number;
  uploadingCover?: boolean;
  belowIdentity?: ReactNode;
  /** Kapak sol üst (geri vb.) */
  coverLeftAction?: ReactNode;
};

const TAB_KEYS: ModernGuestProfileTab[] = ['posts', 'media', 'about'];

export function ModernGuestProfileShell({
  input,
  guestId,
  mode,
  feedVisibility = mode === 'self' ? 'own' : 'public',
  menuOpen: menuOpenProp,
  onMenuOpenChange,
  menuActions = [],
  onEditPress,
  onSettingsPress,
  onAccountPress,
  onAvatarPress,
  onCoverPress,
  onMessagePress,
  messageLoading = false,
  topInset = 0,
  uploadingCover = false,
  belowIdentity,
  coverLeftAction,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'tr';
  const [contentTab, setContentTab] = useState<ModernGuestProfileTab>('posts');
  const [menuInternal, setMenuInternal] = useState(false);
  const menuVisible = menuOpenProp ?? menuInternal;
  const setMenuVisible = (v: boolean) => {
    onMenuOpenChange?.(v);
    if (menuOpenProp === undefined) setMenuInternal(v);
  };

  const allMenuItems = useMemo(() => {
    const items: ProfileMenuAction[] = [...menuActions];
    if (mode === 'self' && onEditPress) {
      items.push({
        id: 'edit',
        icon: 'create-outline',
        label: t('editProfileInfo'),
        onPress: onEditPress,
      });
    }
    const seen = new Set<string>();
    return items.filter((it) => {
      if (seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });
  }, [menuActions, mode, onEditPress, t]);

  const metaLine = [input.jobTitle?.trim(), input.contactEmail?.trim()].filter(Boolean).join(' · ');
  const accountHandler = onAccountPress ?? onSettingsPress;

  const actions: TikTokProfileAction[] = useMemo(() => {
    if (mode === 'viewer') {
      if (!onMessagePress) return [];
      return [
        {
          id: 'message',
          icon: 'chatbubble-outline',
          label: messageLoading ? '…' : t('modernProfileQuickMessage'),
          onPress: onMessagePress,
        },
      ];
    }
    const list: TikTokProfileAction[] = [];
    if (onEditPress) {
      list.push({ id: 'edit', icon: 'create-outline', label: t('editProfileInfo'), onPress: onEditPress });
    }
    if (accountHandler) {
      list.push({
        id: 'account',
        icon: 'person-outline',
        label: t('account'),
        onPress: accountHandler,
      });
    }
    return list;
  }, [mode, onEditPress, accountHandler, onMessagePress, messageLoading, t]);

  const tabs = TAB_KEYS.map((key) => ({
    key,
    label:
      key === 'posts'
        ? t('modernProfileTabPosts')
        : key === 'media'
          ? t('modernProfileTabMedia')
          : t('modernProfileTabAbout'),
  }));

  return (
    <View style={styles.shell}>
      <TikTokProfileCoverHeader
        coverUri={input.coverImage}
        topInset={topInset}
        onCoverPress={onCoverPress}
        onMenuPress={mode === 'self' ? () => setMenuVisible(true) : menuActions.length > 0 ? () => setMenuVisible(true) : undefined}
        onSettingsPress={mode === 'self' && onSettingsPress ? onSettingsPress : undefined}
        uploadingCover={uploadingCover}
        leftAction={coverLeftAction}
      />

      <TikTokProfileBody
        profileImage={input.profileImage}
        fullName={input.fullName || '—'}
        verificationBadge={input.verificationBadge ?? null}
        bio={input.bio}
        metaLine={metaLine || input.organizationName || undefined}
        stats={[
          { value: formatStatCompact(input.postCount ?? 0, lang), label: t('post') },
          { value: '—', label: t('modernProfileStatLikes') },
          { value: '—', label: t('rating') },
        ]}
        actions={actions}
        onAvatarPress={onAvatarPress}
        tabs={tabs}
        activeTab={contentTab}
        onTabChange={(k) => setContentTab(k as ModernGuestProfileTab)}
        belowBio={
          <>
            {input.organizationName ? (
              <View style={styles.guestPill}>
                <Ionicons name="business-outline" size={13} color={P.accent.blue} />
                <Text style={styles.guestPillText}>{input.organizationName}</Text>
              </View>
            ) : null}
            {mode === 'viewer' ? (
              <View style={styles.viewerBadge}>
                <Text style={styles.viewerBadgeText}>{t('visitorTypeGuest')}</Text>
              </View>
            ) : null}
            {belowIdentity}
          </>
        }
      >
        {contentTab === 'posts' && guestId ? (
          <GuestProfileFeedGrid
            guestId={guestId}
            visibility={feedVisibility}
            showEmptyHint
            allowOwnPostDelete={mode === 'self'}
            viewerGuestId={mode === 'self' ? guestId : null}
            edgeToEdge
            feedFilter="all"
          />
        ) : null}
        {contentTab === 'media' && guestId ? (
          <GuestProfileFeedGrid
            guestId={guestId}
            visibility={feedVisibility}
            showEmptyHint
            allowOwnPostDelete={mode === 'self'}
            viewerGuestId={mode === 'self' ? guestId : null}
            edgeToEdge
            feedFilter="media"
          />
        ) : null}
        {contentTab === 'about' ? (
          <ProfileTabCard>
            <ProfileSectionTitle title={t('profileUiAboutSection')} icon="information-circle-outline" />
            {input.bio?.trim() ? (
              <ProfileBioBlock>
                <LinkifiedText text={input.bio} textStyle={styles.aboutText} linkStyle={styles.aboutLink} />
              </ProfileBioBlock>
            ) : (
              <ProfileEmptyState icon="document-text-outline" title={t('customerProfileGuestSubtitle')} />
            )}
            {input.jobTitle?.trim() || input.contactEmail?.trim() ? (
              <ProfileInfoGroup>
                {input.jobTitle?.trim() ? (
                  <ProfileInfoRow
                    icon="briefcase-outline"
                    label={t('customerEditJobTitle')}
                    value={input.jobTitle.trim()}
                  />
                ) : null}
                {input.contactEmail?.trim() ? (
                  <ProfileInfoRow icon="mail-outline" label={t('email')} value={input.contactEmail.trim()} />
                ) : null}
              </ProfileInfoGroup>
            ) : null}
          </ProfileTabCard>
        ) : null}
        {!guestId && contentTab !== 'about' ? (
          <Text style={styles.emptyTab}>{t('signInOrSignUp')}</Text>
        ) : null}
      </TikTokProfileBody>

      <ProfileMenuSheet visible={menuVisible} onClose={() => setMenuVisible(false)} items={allMenuItems} />
    </View>
  );
}

function AboutRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.aboutRow}>
      <Ionicons name={icon} size={18} color={P.subtext} />
      <View style={styles.aboutRowText}>
        <Text style={styles.aboutRowLabel}>{label}</Text>
        <Text style={styles.aboutRowValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { width: '100%', backgroundColor: '#fff' },
  guestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: P.iconBg,
  },
  guestPillText: { fontSize: 12, fontWeight: '700', color: P.accent.blue },
  viewerBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(99,102,241,0.12)',
  },
  viewerBadgeText: { fontSize: 11, fontWeight: '800', color: P.accent.blue },
  aboutText: { fontSize: 15, lineHeight: 22, color: P.text },
  aboutLink: { color: P.accent.blue, textDecorationLine: 'underline', fontWeight: '600' },
  emptyTab: { textAlign: 'center', fontSize: 14, color: P.subtext, padding: 24 },
});
