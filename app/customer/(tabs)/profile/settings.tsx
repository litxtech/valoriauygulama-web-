import { useState, useEffect, useCallback } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { LANGUAGES, LANG_STORAGE_KEY, changeAppLanguage, type LangCode } from '@/i18n';
import { applyRTLAndReloadIfNeeded } from '@/lib/reloadForRTL';
import { safeRouterReplace } from '@/lib/safeRouter';
import { LinearGradient } from 'expo-linear-gradient';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';
import { ProfileMenuRow } from '@/components/ProfileMenuRow';
import { ProfileSectionHeader } from '@/components/ProfileSectionHeader';
import { ProfileMenuGroup } from '@/components/ProfileMenuGroup';
import { SharedAppLinks } from '@/components/SharedAppLinks';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { isAnonymousAuthUser } from '@/lib/isAnonymousAuthUser';
import { resolveInAppContractContext } from '@/lib/inAppContractFlow';
import { isSupabaseUnavailableError, sanitizeSupabaseErrorMessage } from '@/lib/supabaseTransientErrors';
import { useAppFeatureVisible } from '@/hooks/useAppFeatureVisible';
import { staffTipText } from '@/lib/staffTipsI18n';
import { guestServiceText } from '@/lib/guestServiceRequestsI18n';
import { syncGuestAppLanguage } from '@/lib/syncGuestAppLanguage';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const LANGUAGE_FLAGS: Record<string, string> = {
  tr: '🇹🇷',
  en: '🇬🇧',
  ar: '🇸🇦',
  de: '🇩🇪',
  fr: '🇫🇷',
  ru: '🇷🇺',
  es: '🇪🇸',
};

export default function CustomerProfileSettings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuthStore();
  const isLoggedIn = !!user;

  const showCarbon = useAppFeatureVisible('customer_profile_carbon', 'profile');
  const showEmergency = useAppFeatureVisible('customer_profile_emergency', 'profile');
  const showAreaGuide = useAppFeatureVisible('customer_profile_area_guide', 'profile');
  const showMyPosts = useAppFeatureVisible('customer_profile_posts', 'profile');
  const showServiceRequests = useAppFeatureVisible('customer_service_requests', 'profile');
  const showHotelInfo = useAppFeatureVisible('customer_hotel_info', 'profile');
  const showGuestExtras = useAppFeatureVisible('customer_guest_extras', 'profile');

  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [showConvertToFullAccount, setShowConvertToFullAccount] = useState(false);
  const [contractOpening, setContractOpening] = useState(false);

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
      const { data } = await supabase
        .from('guests')
        .select('email, is_guest_app_account')
        .eq('id', g.guest_id)
        .maybeSingle();
      const row = data as { email: string | null; is_guest_app_account: boolean | null } | null;
      setShowConvertToFullAccount(
        !!row?.is_guest_app_account || !!row?.email?.toLowerCase().endsWith('@valoria.guest')
      );
    })();
  }, [user?.id, user?.email]);

  const handleSignOut = () => {
    Alert.alert(t('signOut'), t('signOutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('signOut'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await signOut();
            safeRouterReplace(router, '/');
          })();
        },
      },
    ]);
  };

  const handleLanguageSelect = async (code: LangCode) => {
    await changeAppLanguage(code);
    AsyncStorage.setItem(LANG_STORAGE_KEY, code);
    setLanguageModalVisible(false);
    await syncGuestAppLanguage(code);
    await applyRTLAndReloadIfNeeded(code);
  };

  const openContractApproval = useCallback(async () => {
    if (contractOpening) return;
    setContractOpening(true);
    try {
      const result = await resolveInAppContractContext();
      if (!result.ok) {
        Alert.alert(t('error'), result.message);
        return;
      }
      if (result.prefill?.contract_approved) {
        Alert.alert(t('customerProfileContractApprovalTitle'), t('customerProfileContractAlreadyApproved'));
        return;
      }
      const langCode = (i18n.language || 'tr').split('-')[0] || 'tr';
      router.push({
        pathname: '/customer/contract-approval',
        params: {
          lang: langCode,
          token: result.ctx.token,
          inApp: '1',
          guestId: result.ctx.guestId,
        },
      });
    } catch (e) {
      const raw = (e as Error)?.message ?? '';
      const msg = isSupabaseUnavailableError(raw)
        ? sanitizeSupabaseErrorMessage(raw)
        : raw || t('error');
      Alert.alert(t('error'), msg);
    } finally {
      setContractOpening(false);
    }
  }, [router, i18n.language, t, contractOpening]);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!isLoggedIn ? (
          <TouchableOpacity
            style={styles.signInBanner}
            onPress={() => router.push('/auth')}
            activeOpacity={0.88}
          >
            <Ionicons name="log-in-outline" size={22} color={P.accent.blue} />
            <Text style={styles.signInBannerText}>{t('signInOrSignUp')}</Text>
            <Ionicons name="chevron-forward" size={20} color={P.subtext} />
          </TouchableOpacity>
        ) : null}

        {isLoggedIn ? (
          <View style={styles.section}>
            <ProfileSectionHeader title={t('customerProfileSectionMyAccount')} />
            <ProfileMenuGroup>
              <ProfileMenuRow
                grouped
                icon="create-outline"
                title={t('editProfileInfo')}
                subtitle={t('customerProfileEditButton')}
                onPress={() => router.push('/customer/profile/edit')}
              />
            </ProfileMenuGroup>
            <TouchableOpacity
              style={[styles.primaryMenuCard, contractOpening && styles.primaryMenuCardDisabled]}
              onPress={() => void openContractApproval()}
              activeOpacity={0.88}
              disabled={contractOpening}
            >
              <LinearGradient
                colors={[P.gradient.start, P.gradient.end]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryMenuCardGrad}
              >
                {contractOpening ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Ionicons name="document-text-outline" size={22} color="#fff" style={styles.primaryMenuCardIcon} />
                )}
                <Text style={styles.primaryMenuCardText}>{t('customerProfileContractApprovalTitle')}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <ProfileMenuGroup>
              {showConvertToFullAccount ? (
                <ProfileMenuRow
                  grouped
                  icon="at"
                  title={t('screenConvertToFullAccount')}
                  subtitle={t('convertToFullAccountMenuSub')}
                  onPress={() => router.push('/customer/convert-to-full-account')}
                />
              ) : null}
              {showHotelInfo ? (
                <ProfileMenuRow
                  grouped
                  icon="information-circle-outline"
                  title={guestServiceText('hotelInfoTitle')}
                  subtitle={guestServiceText('settingsHotelInfoSub')}
                  onPress={() => router.push('/customer/hotel-info')}
                />
              ) : null}
              {showServiceRequests ? (
                <ProfileMenuRow
                  grouped
                  icon="hand-left-outline"
                  title={guestServiceText('screenTitle')}
                  subtitle={guestServiceText('settingsRequestsSub')}
                  onPress={() => router.push('/customer/service-requests')}
                />
              ) : null}
              {showGuestExtras ? (
                <ProfileMenuRow
                  grouped
                  icon="pricetags-outline"
                  title="Ekstra hizmetler"
                  subtitle="Battaniye, su vb. — güncel fiyatlar ve ödeme"
                  onPress={() => router.push('/customer/guest-extras')}
                />
              ) : null}
              <ProfileMenuRow
                grouped
                icon="gift-outline"
                title={staffTipText('tipHistoryTitle')}
                subtitle={staffTipText('tipMyTipsLink')}
                chevronColor="#b8860b"
                onPress={() => router.push('/customer/tips')}
              />
              <ProfileMenuRow
                grouped
                icon="notifications"
                title={t('guestNotifSettingsScreenTitle')}
                subtitle={t('customerProfileNotifSettingsSub')}
                onPress={() => router.push('/customer/profile/notification-settings')}
              />
              {showMyPosts ? (
                <ProfileMenuRow
                  grouped
                  icon="grid-outline"
                  title={t('customerProfileMyPostsMenuTitle')}
                  subtitle={t('customerProfileMyPostsMenuSub')}
                  onPress={() => router.push('/customer/profile/my-posts')}
                />
              ) : null}
              <ProfileMenuRow
                grouped
                icon="ban"
                variant="dangerSoft"
                title={t('blockedUsersTitle')}
                subtitle={t('customerProfileBlockedMenuSub')}
                onPress={() => router.push('/customer/profile/blocked-users')}
              />
            </ProfileMenuGroup>
          </View>
        ) : null}

        <View style={styles.section}>
          <ProfileSectionHeader title={t('customerProfileSectionGeneral')} />
          <ProfileMenuGroup>
            <ProfileMenuRow
              grouped
              icon="language"
              title={t('language')}
              subtitle={
                LANGUAGES.find((l) => l.code === (i18n.language || '').split('-')[0])?.label ?? t('selectLanguage')
              }
              onPress={() => setLanguageModalVisible(true)}
            />
            {showCarbon ? (
              <ProfileMenuRow
                grouped
                icon="leaf"
                variant="leaf"
                title={t('screenCarbonFootprint')}
                subtitle={t('customerProfileCarbonSub')}
                onPress={() => router.push('/customer/carbon')}
              />
            ) : null}
            {showEmergency ? (
              <ProfileMenuRow
                grouped
                icon="medkit"
                variant="danger"
                title={t('customerProfileMenuEmergencyTitle')}
                subtitle={t('customerProfileEmergencySub')}
                titleDanger
                chevronColor={P.accent.red}
                onPress={() => router.push('/customer/emergency')}
              />
            ) : null}
          </ProfileMenuGroup>
        </View>

        {isLoggedIn ? (
          <View style={styles.section}>
            <ProfileSectionHeader title={t('customerProfileSectionManage')} />
            <ProfileMenuGroup>
              <ProfileMenuRow
                grouped
                icon="trash"
                variant="danger"
                title={t('screenDeleteAccount')}
                subtitle={t('customerProfileDeleteAccountSub')}
                titleDanger
                chevronColor={P.accent.red}
                onPress={() => router.push('/customer/profile/delete-account')}
              />
            </ProfileMenuGroup>
          </View>
        ) : null}

        {showAreaGuide ? (
          <View style={styles.section}>
            <ProfileSectionHeader title={t('localAreaGuideSectionTitle')} />
            <ProfileMenuGroup>
              <ProfileMenuRow
                grouped
                icon="trail-sign-outline"
                variant="leaf"
                title={t('localAreaGuideMenuTitle')}
                subtitle={t('localAreaGuideMenuSub')}
                onPress={() => router.push('/customer/local-area-guide')}
              />
            </ProfileMenuGroup>
          </View>
        ) : null}

        <View style={styles.section}>
          <ProfileSectionHeader title={t('legalAndContact')} />
          <ProfileMenuGroup>
            <ProfileMenuRow
              grouped
              icon="document-text"
              title={t('privacyPolicy')}
              onPress={() => router.push({ pathname: '/legal/[type]', params: { type: 'privacy' } })}
            />
            <ProfileMenuRow
              grouped
              icon="book-outline"
              title={t('termsOfService')}
              onPress={() => router.push({ pathname: '/legal/[type]', params: { type: 'terms' } })}
            />
            <ProfileMenuRow
              grouped
              icon="nutrition"
              title={t('cookiePolicy')}
              onPress={() => router.push({ pathname: '/legal/[type]', params: { type: 'cookies' } })}
            />
            <ProfileMenuRow
              grouped
              icon="shield-checkmark"
              title={t('customerProfilePermissionsMenuTitle')}
              subtitle={t('customerProfilePermissionsMenuSub')}
              onPress={() => router.push('/permissions')}
            />
          </ProfileMenuGroup>
          <Text style={styles.contactLabel}>{t('contact')}: support@litxtech.com</Text>
        </View>

        <SharedAppLinks compact />

        {isLoggedIn ? (
          <View style={styles.signOutSection}>
            <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.75}>
              <Ionicons name="log-out-outline" size={18} color={theme.colors.textSecondary} style={styles.signOutIcon} />
              <Text style={styles.signOutButtonText}>{t('signOut')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>

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
                    <View style={styles.langOptionLeft}>
                      <Text style={styles.langOptionFlag}>{flag}</Text>
                      <Text style={[styles.langOptionLabel, isActive && styles.langOptionLabelActive]}>{label}</Text>
                    </View>
                    {isActive ? (
                      <Ionicons name="checkmark-circle" size={26} color={theme.colors.white} />
                    ) : (
                      <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.langCloseBtn} onPress={() => setLanguageModalVisible(false)} activeOpacity={0.85}>
              <Text style={styles.langCloseText}>{t('close')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: P.bg },
  content: { paddingTop: 8 },
  section: {
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  signInBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    padding: 16,
    borderRadius: 16,
    backgroundColor: P.card,
    borderWidth: 1,
    borderColor: P.border,
  },
  signInBannerText: { flex: 1, fontSize: 15, fontWeight: '700', color: P.text },
  primaryMenuCard: {
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    marginBottom: 10,
    ...theme.shadows.md,
  },
  primaryMenuCardGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: theme.spacing.lg,
  },
  primaryMenuCardIcon: { marginTop: 1 },
  primaryMenuCardText: { fontSize: 16, fontWeight: '700', color: theme.colors.white },
  primaryMenuCardDisabled: { opacity: 0.75 },
  contactLabel: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    marginTop: 16,
    marginBottom: 8,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  langModalContent: {
    width: Math.min(Dimensions.get('window').width - 32, 400),
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    paddingHorizontal: 24,
    marginHorizontal: 16,
    ...theme.shadows.md,
  },
  langModalHeader: { alignItems: 'center', marginBottom: 24 },
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
  },
  langModalSubtitle: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', paddingHorizontal: 16 },
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
  langOptionLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  langOptionFlag: { fontSize: 28 },
  langOptionLabel: { fontSize: 17, fontWeight: '600', color: theme.colors.text },
  langOptionLabelActive: { color: theme.colors.white, fontWeight: '700' },
  langCloseBtn: {
    marginTop: 20,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  langCloseText: { fontSize: 16, color: theme.colors.primary, fontWeight: '700' },
});
