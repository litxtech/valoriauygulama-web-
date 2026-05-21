import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  Pressable,
  Dimensions,
  useWindowDimensions,
  ActivityIndicator,
  type ViewStyle,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { theme } from '@/constants/theme';
import { LANGUAGES, LANG_STORAGE_KEY, type LangCode } from '@/i18n';
import { applyRTLAndReloadIfNeeded } from '@/lib/reloadForRTL';
import { CachedImage } from '@/components/CachedImage';
import { SharedAppLinks } from '@/components/SharedAppLinks';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { isAnonymousAuthUser } from '@/lib/isAnonymousAuthUser';
import { LinearGradient } from 'expo-linear-gradient';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';
import { ProfileStatsCard } from '@/components/ProfileStatsCard';
import { ProfileMenuRow } from '@/components/ProfileMenuRow';

const AVATAR_SIZE = P.avatar.size;
const COVER_BLOCK_HEIGHT = P.hero.height;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const coverImageBleed: ViewStyle = {
  ...StyleSheet.absoluteFillObject,
  width: '100%',
  height: '100%',
  minWidth: '100%',
  minHeight: '100%',
};

const LANGUAGE_FLAGS: Record<string, string> = {
  tr: '🇹🇷',
  en: '🇬🇧',
  ar: '🇸🇦',
  de: '🇩🇪',
  fr: '🇫🇷',
  ru: '🇷🇺',
  es: '🇪🇸',
};
function getDisplayName(t: (key: string) => string): string {
  const { user } = useAuthStore.getState();
  if (!user) return t('guestDefaultName');
  const name = user.user_metadata?.full_name ?? user.user_metadata?.name;
  if (name && typeof name === 'string') return name.trim();
  const email = user.email ?? (user.user_metadata?.email as string) ?? '';
  const part = email.split('@')[0];
  if (part) return part.charAt(0).toUpperCase() + part.slice(1);
  return t('guestDefaultName');
}

/** Apple ile giriş yapan hesaplar da mail ile kayıt sayılır; email user_metadata'da da olabilir. */
function getDisplayEmail(user: { email?: string | null; user_metadata?: Record<string, unknown> } | null): string {
  if (!user) return '';
  return (user.email ?? (user.user_metadata?.email as string) ?? '').trim();
}

export default function CustomerProfile() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { user, signOut, loadSession, loading: authLoading } = useAuthStore();
  const isLoggedIn = !!user;

  const coverUrl = (user?.user_metadata?.cover_url as string) || null;
  const avatarUrl = (user?.user_metadata?.avatar_url as string) || null;

  const [coverUri, setCoverUri] = useState<string | null>(coverUrl);
  const [avatarUri, setAvatarUri] = useState<string | null>(avatarUrl);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [coverModalVisible, setCoverModalVisible] = useState(false);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [showConvertToFullAccount, setShowConvertToFullAccount] = useState(false);
  const [postCount, setPostCount] = useState(0);

  useEffect(() => {
    setCoverUri(coverUrl);
    setAvatarUri(avatarUrl);
  }, [coverUrl, avatarUrl]);

  useEffect(() => {
    if (!user) {
      setShowConvertToFullAccount(false);
      return;
    }
    if (isAnonymousAuthUser(user)) {
      setShowConvertToFullAccount(true);
      return;
    }
    const loginEmail = (user.email ?? '').trim().toLowerCase();
    if (loginEmail && !loginEmail.endsWith('@valoria.guest')) {
      setShowConvertToFullAccount(false);
      return;
    }
    (async () => {
      const g = await getOrCreateGuestForCurrentSession();
      if (!g?.guest_id) {
        setShowConvertToFullAccount(false);
        return;
      }
      const { data } = await supabase.from('guests').select('email, is_guest_app_account').eq('id', g.guest_id).maybeSingle();
      const row = data as { email: string | null; is_guest_app_account: boolean | null } | null;
      setShowConvertToFullAccount(
        !!row?.is_guest_app_account || !!row?.email?.toLowerCase().endsWith('@valoria.guest')
      );
    })();
  }, [user?.id, user?.email]);

  const loadPostCount = useCallback(async () => {
    if (!isLoggedIn) {
      setPostCount(0);
      return;
    }
    try {
      const guest = await getOrCreateGuestForCurrentSession();
      if (!guest?.guest_id) return;
      const { count, error } = await supabase
        .from('feed_posts')
        .select('id', { count: 'exact', head: true })
        .eq('guest_id', guest.guest_id);
      if (!error) setPostCount(count ?? 0);
    } catch {
      setPostCount(0);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    void loadPostCount();
  }, [loadPostCount, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadPostCount();
    }, [loadPostCount])
  );

  const saveUserMetadata = async (updates: Record<string, unknown>) => {
    if (!user) return;
    const next = { ...(user.user_metadata || {}), ...updates };
    await supabase.auth.updateUser({ data: next });
    await loadSession();
  };

  const pickCover = async () => {
    if (!user) return;
    const granted = await ensureMediaLibraryPermission({
      title: t('permission'),
      message: t('galleryRequired'),
      settingsMessage: t('galleryRequired'),
    });
    if (!granted) {
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 2],
        quality: 0.7,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      setUploadingCover(true);
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: 'profiles',
        uri: result.assets[0].uri,
        kind: 'image',
        subfolder: 'customer/cover',
      });
      await saveUserMetadata({ cover_url: publicUrl });
      setCoverUri(publicUrl);
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('coverUploadError'));
    } finally {
      setUploadingCover(false);
    }
  };

  const pickAvatar = async () => {
    if (!user) return;
    const granted = await ensureMediaLibraryPermission({
      title: t('permission'),
      message: t('galleryRequired'),
      settingsMessage: t('galleryRequired'),
    });
    if (!granted) {
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      setUploadingAvatar(true);
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: 'profiles',
        uri: result.assets[0].uri,
        kind: 'image',
        subfolder: 'customer/avatar',
      });
      await saveUserMetadata({ avatar_url: publicUrl });
      setAvatarUri(publicUrl);
      const guest = await getOrCreateGuestForCurrentSession();
      if (guest?.guest_id) {
        await supabase.rpc('update_my_guest_photo_url', { p_photo_url: publicUrl });
      }
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('avatarUploadError'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      t('signOut'),
      t('signOutConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('signOut'),
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/');
          },
        },
      ]
    );
  };

  const handleLanguageSelect = async (code: LangCode) => {
    i18n.changeLanguage(code);
    AsyncStorage.setItem(LANG_STORAGE_KEY, code);
    setLanguageModalVisible(false);
    await applyRTLAndReloadIfNeeded(code);
  };

  const displayName = getDisplayName(t);
  const displayEmail = getDisplayEmail(user);
  const showCover = coverUri || isLoggedIn;
  const showAvatarEdit = isLoggedIn;

  const headerTitle = useMemo(() => {
    if (!isLoggedIn) return displayName;
    return displayName;
  }, [displayName, isLoggedIn]);

  const headerSubtitle = useMemo(() => {
    const metaAbout = (user?.user_metadata?.about as string) || '';
    const metaJob = (user?.user_metadata?.job_title as string) || '';
    const metaEmail = (user?.user_metadata?.contact_email as string) || '';
    const bestLine = (metaJob || metaEmail || displayEmail).trim();
    if (bestLine) return bestLine;
    if (metaAbout.trim()) return metaAbout.trim();
    return t('customerProfileGuestSubtitle');
  }, [displayEmail, user?.user_metadata, t]);

  const guestStats = useMemo(
    () => [
      { value: isLoggedIn ? postCount : '—', label: t('post') },
      { value: isLoggedIn ? 0 : '—', label: t('localAreaGuideSectionTitle') },
      { value: isLoggedIn ? 0 : '—', label: t('notificationsSection') },
      { value: isLoggedIn ? 0 : '—', label: t('rating') },
    ],
    [isLoggedIn, postCount, t]
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingBottom: insets.bottom + 28,
          width: windowWidth,
          minWidth: windowWidth,
          alignItems: 'stretch' as const,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ height: insets.top + 8 }} />

      <View style={[styles.heroOverlap, { marginTop: 8 }]}>
        <TouchableOpacity
          style={styles.heroAvatarWrap}
          onPress={() => {
            if (uploadingAvatar) return;
            if (avatarUri) setAvatarModalVisible(true);
            else if (isLoggedIn) pickAvatar();
          }}
          activeOpacity={0.92}
          disabled={!isLoggedIn && !avatarUri}
        >
          <View style={styles.heroAvatarShadow}>
            {avatarUri ? (
              <CachedImage uri={avatarUri} style={styles.heroAvatarImg} contentFit="cover" />
            ) : (
              <View style={styles.heroAvatarPlaceholder}>
                <Text style={styles.heroAvatarInitial}>{displayName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>
          {showAvatarEdit ? (
            <TouchableOpacity style={styles.heroAvatarCam} onPress={(e) => { e.stopPropagation(); pickAvatar(); }} activeOpacity={0.9}>
              <Ionicons name="camera" size={16} color={theme.colors.white} />
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>

        <Text style={styles.heroName} numberOfLines={1}>
          {headerTitle}
        </Text>
        <Text style={styles.heroOrgLine} numberOfLines={1}>
          Valoria Hotel
        </Text>
        <Text style={styles.heroSubtitle} numberOfLines={2}>
          {headerSubtitle}
        </Text>
        <View style={styles.heroOnlineRow}>
          <View style={[styles.heroOnlineDot, isLoggedIn && styles.heroOnlineDotOn]} />
          <Text style={styles.heroOnlineText}>{isLoggedIn ? t('online') : t('offlineStatus')}</Text>
        </View>
        <View style={styles.statsWrap}>
          <ProfileStatsCard items={guestStats} />
        </View>

        {authLoading ? (
          <View style={[styles.heroEditCtaOuter, styles.heroEditCtaLoading]}>
            <ActivityIndicator color={P.gradient.start} />
          </View>
        ) : isLoggedIn ? (
          <View style={styles.heroActionsRow}>
            <TouchableOpacity
              onPress={() => router.push('/customer/profile/edit')}
              activeOpacity={0.88}
              style={styles.heroActionHalfOuter}
            >
              <LinearGradient
                colors={[P.gradient.start, P.gradient.end]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroEditCtaGradCompact}
              >
                <Ionicons name="create-outline" size={18} color="#fff" />
                <Text style={styles.heroEditCtaTextCompact}>{t('editProfileInfo')}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/customer/profile/my-posts')}
              activeOpacity={0.88}
              style={styles.heroActionHalfOuter}
            >
              <LinearGradient
                colors={[P.gradient.start, P.gradient.end]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroEditCtaGradCompact}
              >
                <Ionicons name="grid-outline" size={18} color="#fff" />
                <Text style={styles.heroEditCtaTextCompact} numberOfLines={2}>
                  {t('customerProfileMyPostsMenuTitle')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => router.push('/auth')} activeOpacity={0.88} style={styles.heroEditCtaOuter}>
            <LinearGradient
              colors={[P.gradient.start, P.gradient.end]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroEditCtaGrad}
            >
              <Ionicons name="log-in-outline" size={20} color="#fff" />
              <Text style={styles.heroEditCtaText}>{t('signInOrSignUp')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>

      {/* 1) Genel — dil, konaklama/çevre, güvenlik */}
      <View style={styles.section}>
        <Text style={styles.sectionTitleLively}>{t('customerProfileSectionGeneral')}</Text>
        <ProfileMenuRow
          icon="language"
          title={t('language')}
          subtitle={LANGUAGES.find((l) => l.code === (i18n.language || '').split('-')[0])?.label ?? t('selectLanguage')}
          onPress={() => setLanguageModalVisible(true)}
        />
        <ProfileMenuRow
          icon="leaf"
          variant="leaf"
          title={t('screenCarbonFootprint')}
          subtitle={t('customerProfileCarbonSub')}
          onPress={() => router.push('/customer/carbon')}
        />
        <ProfileMenuRow
          icon="medkit"
          variant="danger"
          title={t('customerProfileMenuEmergencyTitle')}
          subtitle={t('customerProfileEmergencySub')}
          titleDanger
          chevronColor={P.accent.red}
          onPress={() => router.push('/customer/emergency')}
        />
      </View>

      {/* 2) Giriş yapmış kullanıcı — bildirim, paylaşımlar, gizlilik */}
      {isLoggedIn && (
        <View style={styles.section}>
          <Text style={styles.sectionTitleLively}>{t('customerProfileSectionMyAccount')}</Text>
          {showConvertToFullAccount ? (
            <ProfileMenuRow
              icon="at"
              title={t('screenConvertToFullAccount')}
              subtitle={t('convertToFullAccountMenuSub')}
              onPress={() => router.push('/customer/convert-to-full-account')}
            />
          ) : null}
          <ProfileMenuRow
            icon="notifications"
            title={t('guestNotifSettingsScreenTitle')}
            subtitle={t('customerProfileNotifSettingsSub')}
            onPress={() => router.push('/customer/profile/notification-settings')}
          />
          <ProfileMenuRow
            icon="ban"
            variant="dangerSoft"
            title={t('blockedUsersTitle')}
            subtitle={t('customerProfileBlockedMenuSub')}
            onPress={() => router.push('/customer/profile/blocked-users')}
          />
        </View>
      )}

      {isLoggedIn && (
        <View style={styles.section}>
          <Text style={styles.sectionTitleLively}>{t('customerProfileSectionManage')}</Text>
          <ProfileMenuRow
            icon="trash"
            variant="danger"
            title={t('screenDeleteAccount')}
            subtitle={t('customerProfileDeleteAccountSub')}
            titleDanger
            chevronColor={P.accent.red}
            onPress={() => router.push('/customer/profile/delete-account')}
          />
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitleLively}>{t('localAreaGuideSectionTitle')}</Text>
        <ProfileMenuRow
          icon="trail-sign-outline"
          variant="leaf"
          title={t('localAreaGuideMenuTitle')}
          subtitle={t('localAreaGuideMenuSub')}
          onPress={() => router.push('/customer/local-area-guide')}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitleLively}>{t('legalAndContact')}</Text>
        <ProfileMenuRow
          icon="document-text"
          title={t('privacyPolicy')}
          onPress={() => router.push({ pathname: '/legal/[type]', params: { type: 'privacy' } })}
        />
        <ProfileMenuRow
          icon="book-outline"
          title={t('termsOfService')}
          onPress={() => router.push({ pathname: '/legal/[type]', params: { type: 'terms' } })}
        />
        <ProfileMenuRow
          icon="nutrition"
          title={t('cookiePolicy')}
          onPress={() => router.push({ pathname: '/legal/[type]', params: { type: 'cookies' } })}
        />
        <ProfileMenuRow
          icon="shield-checkmark"
          title={t('customerProfilePermissionsMenuTitle')}
          subtitle={t('customerProfilePermissionsMenuSub')}
          onPress={() => router.push('/permissions')}
        />
        <Text style={styles.contactLabel}>{t('contact')}: support@litxtech.com</Text>
      </View>

      <SharedAppLinks compact />

      {isLoggedIn && (
        <View style={styles.signOutSection}>
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.75}>
            <Ionicons name="log-out-outline" size={18} color={theme.colors.textSecondary} style={styles.signOutIcon} />
            <Text style={styles.signOutButtonText}>{t('signOut')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Kapak tam ekran */}
      <Modal visible={coverModalVisible} transparent animationType="fade" onRequestClose={() => setCoverModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setCoverModalVisible(false)}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            {coverUri ? <CachedImage uri={coverUri} style={styles.modalImage} contentFit="contain" /> : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Avatar tam ekran */}
      <Modal visible={avatarModalVisible} transparent animationType="fade" onRequestClose={() => setAvatarModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setAvatarModalVisible(false)}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            {avatarUri ? <CachedImage uri={avatarUri} style={styles.modalImage} contentFit="contain" /> : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Dil seçimi — modern kart */}
      <Modal visible={languageModalVisible} transparent animationType="fade" onRequestClose={() => setLanguageModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setLanguageModalVisible(false)}>
          <Pressable
            style={[
              styles.langModalContent,
              {
                paddingTop: insets.top + 24,
                paddingBottom: insets.bottom + 24,
                maxHeight: SCREEN_HEIGHT * 0.82,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.langModalHeader}>
              <View style={styles.langModalIconWrap}>
                <Ionicons name="globe-outline" size={32} color={theme.colors.primary} />
              </View>
              <Text style={styles.langModalTitle}>{t('selectLanguage')}</Text>
              <Text style={styles.langModalSubtitle}>{t('selectAppLanguage')}</Text>
            </View>
            <ScrollView
              style={styles.langScrollView}
              contentContainerStyle={styles.langScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {LANGUAGES.map(({ code, label }) => {
                const isActive = (i18n.language || '').split('-')[0] === code;
                const flag = LANGUAGE_FLAGS[code] ?? '🌐';
                return (
                  <TouchableOpacity
                    key={code}
                    style={[styles.langOptionCard, isActive && styles.langOptionCardActive]}
                    onPress={() => handleLanguageSelect(code)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.langOptionLeft, isActive && styles.langOptionLeftActive]}>
                      <Text style={styles.langOptionFlag}>{flag}</Text>
                      <Text style={[styles.langOptionLabel, isActive && styles.langOptionLabelActive]}>{label}</Text>
                    </View>
                    {isActive ? (
                      <View style={styles.langOptionCheckWrap}>
                        <Ionicons name="checkmark-circle" size={26} color={theme.colors.white} />
                      </View>
                    ) : (
                      <View style={styles.langOptionChevron}>
                        <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={styles.langCloseBtn}
              onPress={() => setLanguageModalVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.langCloseText}>{t('close')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: P.bg },
  content: { paddingBottom: theme.spacing.xxl + 24 },
  coverBlockInner: {
    alignSelf: 'stretch',
    width: '100%',
    minWidth: '100%',
    height: COVER_BLOCK_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
  },
  /** Kapak yokken gradient tam genişlik */
  heroGrad: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    minWidth: '100%',
    height: '100%',
    minHeight: '100%',
  },
  coverImageClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  coverPlaceholderLegacy: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.borderLight, justifyContent: 'center', alignItems: 'center', gap: 8 },
  coverPlaceholderTextLegacy: { color: theme.colors.textMuted, fontSize: 14, fontWeight: '600' },
  coverEditBtnLegacy: {
    position: 'absolute',
    bottom: 10,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  heroOverlap: {
    marginTop: -AVATAR_SIZE / 2,
    marginBottom: 8,
    paddingHorizontal: theme.spacing.lg,
    zIndex: 5,
    alignItems: 'center',
  },
  statsWrap: { width: '100%', marginTop: 14 },
  heroOrgLine: {
    fontSize: 14,
    fontWeight: '600',
    color: P.subtext,
    textAlign: 'center',
    marginTop: 4,
  },
  heroOnlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  heroOnlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: P.subtext,
  },
  heroOnlineDotOn: { backgroundColor: P.accent.green },
  heroOnlineText: { fontSize: 13, fontWeight: '600', color: P.subtext },
  heroAvatarShadow: {
    borderRadius: AVATAR_SIZE / 2,
    ...P.avatarShadow,
  },
  heroAvatarWrap: { position: 'relative', marginBottom: 8 },
  heroAvatarImg: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: P.avatar.border,
    borderColor: '#fff',
    backgroundColor: theme.colors.borderLight,
  },
  heroAvatarPlaceholder: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: P.accent.purple,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: P.avatar.border,
    borderColor: '#fff',
  },
  heroAvatarInitial: { fontSize: 34, fontWeight: '900', color: theme.colors.white },
  heroAvatarCam: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: P.accent.purple,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  heroName: { ...theme.typography.titleSmall, color: P.text, textAlign: 'center' },
  heroSubtitle: {
    fontSize: 14,
    color: P.subtext,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  heroEditCtaOuter: { marginTop: 16, alignSelf: 'stretch', borderRadius: 16, overflow: 'hidden' },
  heroActionsRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: 8,
  },
  heroActionHalfOuter: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    overflow: 'hidden',
  },
  heroEditCtaGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  heroEditCtaGradCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 4,
    minHeight: 48,
  },
  heroEditCtaLoading: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  heroEditCtaText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  heroEditCtaTextCompact: { fontSize: 12, fontWeight: '600', color: '#fff', flexShrink: 1, textAlign: 'center' },
  uploadText: { color: theme.colors.white, fontSize: 12 },
  section: {
    backgroundColor: 'transparent',
    borderRadius: theme.radius.md,
    paddingHorizontal: 0,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  sectionTight: {
    paddingBottom: 14,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 14,
    marginBottom: 12,
  },
  tokenSectionHeader: { flex: 1 },
  sectionTitle: {
    ...theme.typography.bodySmall,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 12,
    paddingTop: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionTitleLively: {
    fontSize: 13,
    fontWeight: '600',
    color: P.subtext,
    marginBottom: 10,
    paddingTop: 6,
    letterSpacing: 0.3,
  },
  signOutSection: {
    marginHorizontal: theme.spacing.lg,
    marginTop: 4,
    marginBottom: theme.spacing.lg,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: 20,
    backgroundColor: P.cardMuted,
    borderWidth: 1,
    borderColor: P.border,
  },
  signOutIcon: { marginTop: 1 },
  signOutButtonText: { fontSize: 15, fontWeight: '600', color: theme.colors.textSecondary },
  primaryMenuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingVertical: 16,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: 10,
    ...theme.shadows.md,
  },
  primaryMenuCardText: { fontSize: 16, fontWeight: '700', color: theme.colors.white },
  contactLabel: { ...theme.typography.bodySmall, color: theme.colors.textSecondary, marginTop: 16, marginBottom: 16 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.85, justifyContent: 'center' },
  modalImage: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.85 },
  langModalContent: {
    width: Math.min(SCREEN_WIDTH - 32, 400),
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    paddingHorizontal: 24,
    marginHorizontal: 16,
    ...theme.shadows.md,
    shadowRadius: 16,
    elevation: 8,
  },
  langModalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  langModalIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.primaryLight + '28',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  langModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  langModalSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  langScrollView: { maxHeight: 340 },
  langScrollContent: { paddingBottom: 8 },
  langOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 2,
    borderColor: 'transparent',
    ...theme.shadows.sm,
  },
  langOptionCardActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark,
    ...theme.shadows.md,
  },
  langOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  langOptionLeftActive: {},
  langOptionFlag: {
    fontSize: 28,
  },
  langOptionLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.text,
  },
  langOptionLabelActive: {
    color: theme.colors.white,
    fontWeight: '700',
  },
  langOptionCheckWrap: {},
  langOptionChevron: { opacity: 0.7 },
  langCloseBtn: {
    marginTop: 20,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  langCloseText: {
    fontSize: 16,
    color: theme.colors.primary,
    fontWeight: '700',
  },
});
