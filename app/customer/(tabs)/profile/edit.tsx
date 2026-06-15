import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { pickProfileCoverUri } from '@/lib/profileCoverPicker';
import { ProfileEditMediaSection } from '@/components/modernProfile/ProfileEditMediaSection';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { persistGuestCoverImageUrl, persistGuestPhotoUrl } from '@/lib/syncGuestProfileMedia';
import { theme } from '@/constants/theme';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { useTranslation } from 'react-i18next';
import {
  requestEmailChangeCode,
  confirmEmailChangeWithOtp,
  resendEmailChangeCode,
  syncGuestRowWithAuthUser,
} from '@/lib/emailChangeOtp';

function getInitialName(): string {
  const { user } = useAuthStore.getState();
  if (!user) return '';
  const name = user.user_metadata?.full_name ?? user.user_metadata?.name;
  if (name && typeof name === 'string') return name.trim();
  return '';
}

function getInitialPhone(): string {
  const { user } = useAuthStore.getState();
  if (!user) return '';
  const phone = user.user_metadata?.phone;
  if (phone && typeof phone === 'string') return phone.trim();
  return '';
}

function getInitialWhatsApp(): string {
  const { user } = useAuthStore.getState();
  if (!user) return '';
  const whatsapp = user.user_metadata?.whatsapp;
  if (whatsapp && typeof whatsapp === 'string') return whatsapp.trim();
  return '';
}

function getInitialAbout(): string {
  const { user } = useAuthStore.getState();
  if (!user) return '';
  const about = user.user_metadata?.about;
  if (about && typeof about === 'string') return about.trim();
  return '';
}

function getInitialJobTitle(): string {
  const { user } = useAuthStore.getState();
  if (!user) return '';
  const job = user.user_metadata?.job_title;
  if (job && typeof job === 'string') return job.trim();
  return '';
}

function getInitialContactEmail(): string {
  const { user } = useAuthStore.getState();
  if (!user) return '';
  const mail = user.user_metadata?.contact_email;
  if (mail && typeof mail === 'string') return mail.trim();
  return '';
}

function getInitialInstagram(): string {
  const { user } = useAuthStore.getState();
  if (!user) return '';
  const v = user.user_metadata?.instagram;
  if (v && typeof v === 'string') return v.trim();
  return '';
}

function getInitialWebsite(): string {
  const { user } = useAuthStore.getState();
  if (!user) return '';
  const v = user.user_metadata?.website;
  if (v && typeof v === 'string') return v.trim();
  return '';
}

export default function CustomerProfileEdit() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, loadSession } = useAuthStore();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [about, setAbout] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [instagram, setInstagram] = useState('');
  const [website, setWebsite] = useState('');
  const [saving, setSaving] = useState(false);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [loginEmailDraft, setLoginEmailDraft] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailChangeAwaitingOtp, setEmailChangeAwaitingOtp] = useState(false);
  const [pendingEmailForOtp, setPendingEmailForOtp] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);

  useEffect(() => {
    setFullName(getInitialName());
    setPhone(getInitialPhone());
    setWhatsapp(getInitialWhatsApp());
    setAbout(getInitialAbout());
    setJobTitle(getInitialJobTitle());
    setContactEmail(getInitialContactEmail());
    setInstagram(getInitialInstagram());
    setWebsite(getInitialWebsite());
    setCoverUri((user?.user_metadata?.cover_url as string) || null);
    setAvatarUri((user?.user_metadata?.avatar_url as string) || null);
    setLoginEmailDraft((user?.email ?? '').trim());
    setEmailChangeAwaitingOtp(false);
    setPendingEmailForOtp('');
    setEmailOtpCode('');
  }, [user?.id, user?.email]);

  const saveUserMetadata = async (updates: Record<string, unknown>) => {
    if (!user) return;
    const next = { ...(user.user_metadata || {}), ...updates };
    const { error } = await supabase.auth.updateUser({ data: next });
    if (error) throw error;
    await loadSession();
  };

  const pickCover = async () => {
    if (!user || uploadingCover) return;
    try {
      const uri = await pickProfileCoverUri(t('settingsPermissionMessage'));
      if (!uri) return;
      setUploadingCover(true);
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: 'profiles',
        uri,
        kind: 'image',
        subfolder: 'customer/cover',
      });
      await saveUserMetadata({ cover_url: publicUrl });
      await persistGuestCoverImageUrl(publicUrl);
      setCoverUri(publicUrl);
    } catch (e) {
      const message = e instanceof Error ? e.message : t('coverUploadError');
      Alert.alert(t('error'), message);
    } finally {
      setUploadingCover(false);
    }
  };

  const pickAvatar = async () => {
    if (!user || uploadingAvatar) return;
    const granted = await ensureMediaLibraryPermission({
      title: t('galleryPermission'),
      message: t('galleryPermissionMessage'),
      settingsMessage: t('settingsPermissionMessage'),
    });
    if (!granted) return;
    try {
      setUploadingAvatar(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.65,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
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
        await persistGuestPhotoUrl(publicUrl);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : t('avatarUploadError');
      Alert.alert(t('error'), message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const confirmDeleteCover = () => {
    if (!user || !coverUri || uploadingCover) return;
    Alert.alert(t('delete'), t('deleteCoverPhotoConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setUploadingCover(true);
            try {
              await saveUserMetadata({ cover_url: null });
              await persistGuestCoverImageUrl(null);
              setCoverUri(null);
            } catch (e) {
              Alert.alert(t('error'), e instanceof Error ? e.message : t('coverUploadError'));
            } finally {
              setUploadingCover(false);
            }
          })();
        },
      },
    ]);
  };

  const confirmDeleteAvatar = () => {
    if (!user || !avatarUri || uploadingAvatar) return;
    Alert.alert(t('delete'), t('deleteProfilePhotoConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setUploadingAvatar(true);
            try {
              await saveUserMetadata({ avatar_url: null });
              setAvatarUri(null);
              const guest = await getOrCreateGuestForCurrentSession();
              if (guest?.guest_id) {
                await persistGuestPhotoUrl(null);
              }
            } catch (e) {
              Alert.alert(t('error'), e instanceof Error ? e.message : t('avatarUploadError'));
            } finally {
              setUploadingAvatar(false);
            }
          })();
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!user) {
      Alert.alert(t('error'), t('customerProfileSignInToEdit'));
      return;
    }
    const nameTrim = fullName.trim();
    if (!nameTrim) {
      Alert.alert(t('customerProfileNameRequiredTitle'), t('customerProfileNameRequiredBody'));
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: nameTrim,
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          ...(whatsapp.trim() ? { whatsapp: whatsapp.trim() } : {}),
          ...(about.trim() ? { about: about.trim() } : {}),
          ...(jobTitle.trim() ? { job_title: jobTitle.trim() } : {}),
          ...(contactEmail.trim() ? { contact_email: contactEmail.trim() } : {}),
          ...(instagram.trim() ? { instagram: instagram.trim() } : {}),
          ...(website.trim() ? { website: website.trim() } : {}),
        },
      });
      if (error) throw error;
      await loadSession();
      Alert.alert(t('customerProfileSavedTitle'), t('customerProfileSavedBody'), [
        { text: t('ok'), onPress: () => router.replace('/customer/profile') },
      ]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t('customerProfileUpdateFailed');
      Alert.alert(t('error'), message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePasswordOnly = async () => {
    if (!user) return;
    if (newPass.length < 6) {
      Alert.alert(t('error'), t('passwordMinLength'));
      return;
    }
    if (newPass !== newPass2) {
      Alert.alert(t('error'), t('passwordsDontMatch'));
      return;
    }
    setAccountBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;
      setNewPass('');
      setNewPass2('');
      await loadSession();
      Alert.alert(t('info'), t('profileEditPasswordUpdated'));
    } catch (e: unknown) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('customerProfileUpdateFailed'));
    } finally {
      setAccountBusy(false);
    }
  };

  const handleRequestProfileEmailCode = async () => {
    if (!user) return;
    const next = loginEmailDraft.trim().toLowerCase();
    const cur = (user.email ?? '').trim().toLowerCase();
    if (!next) {
      Alert.alert(t('error'), t('convertToFullAccountEmailRequired'));
      return;
    }
    if (next === cur) {
      Alert.alert(t('error'), t('profileEditEmailMustDiffer'));
      return;
    }
    setAccountBusy(true);
    try {
      const { error } = await requestEmailChangeCode(next);
      if (error) throw error;
      setPendingEmailForOtp(next);
      setEmailChangeAwaitingOtp(true);
      setEmailOtpCode('');
      Alert.alert(t('info'), t('convertToFullAccountCodeSent', { email: next }));
    } catch (e: unknown) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('convertToFullAccountFailed'));
    } finally {
      setAccountBusy(false);
    }
  };

  const handleVerifyProfileEmailOtp = async () => {
    const digits = emailOtpCode.replace(/\D/g, '');
    if (digits.length !== 6) {
      Alert.alert(t('error'), t('enterSixDigitCode'));
      return;
    }
    setAccountBusy(true);
    try {
      const { error } = await confirmEmailChangeWithOtp(pendingEmailForOtp, digits);
      if (error) throw error;
      await loadSession();
      await syncGuestRowWithAuthUser(useAuthStore.getState().user);
      setEmailChangeAwaitingOtp(false);
      setPendingEmailForOtp('');
      setEmailOtpCode('');
      setLoginEmailDraft((useAuthStore.getState().user?.email ?? '').trim());
      Alert.alert(t('info'), t('convertToFullAccountVerifiedTitle'));
    } catch (e: unknown) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('convertToFullAccountOtpFailed'));
    } finally {
      setAccountBusy(false);
    }
  };

  const handleResendProfileEmailCode = async () => {
    if (!pendingEmailForOtp) return;
    setAccountBusy(true);
    try {
      const { error } = await resendEmailChangeCode(pendingEmailForOtp);
      if (error) throw error;
      Alert.alert(t('info'), t('convertToFullAccountCodeSent', { email: pendingEmailForOtp }));
    } catch (e: unknown) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('convertToFullAccountResendFailed'));
    } finally {
      setAccountBusy(false);
    }
  };

  if (!user) {
    return (
      <View style={[styles.placeholderContainer, { paddingTop: insets.top + 48 }]}>
        <View style={styles.placeholderIconWrap}>
          <Ionicons name="person-circle-outline" size={64} color={theme.colors.primary} />
        </View>
        <Text style={styles.placeholderTitle}>{t('editProfileInfo')}</Text>
        <Text style={styles.placeholderText}>{t('customerProfileSignInToEdit')}</Text>
        <TouchableOpacity style={[styles.primaryButton, { alignSelf: 'stretch' }]} onPress={() => router.replace('/auth')} activeOpacity={0.85}>
          <Ionicons name="log-in-outline" size={22} color={theme.colors.white} style={{ marginRight: 10 }} />
          <Text style={styles.primaryButtonText}>{t('signIn')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: 16, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ProfileEditMediaSection
          coverUri={coverUri}
          avatarUri={avatarUri}
          displayName={fullName}
          sectionTitle={t('customerEditMediaSectionTitle')}
          sectionHint={t('customerEditMediaSectionHint')}
          coverLabel={t('customerEditCoverLabel')}
          avatarLabel={t('customerEditProfilePhotoLabel')}
          addCoverText={t('profileAddCover')}
          deleteAvatarLabel={t('delete')}
          onPickCover={pickCover}
          onPickAvatar={pickAvatar}
          onDeleteCover={coverUri ? confirmDeleteCover : undefined}
          onDeleteAvatar={avatarUri ? confirmDeleteAvatar : undefined}
          uploadingCover={uploadingCover}
          uploadingAvatar={uploadingAvatar}
          disabled={saving}
        />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="person" size={20} color={theme.colors.primary} />
            </View>
            <Text style={styles.sectionTitle}>{t('personalInfo')}</Text>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('fullName')}</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder={t('customerEditNamePlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="words"
              editable={!saving}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              {t('customerEditPhoneLabel')} <Text style={styles.optional}>{t('fieldOptional')}</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder={t('customerEditPhonePlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="phone-pad"
              editable={!saving}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              {t('customerEditWhatsappLabel')} <Text style={styles.optional}>{t('fieldOptional')}</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={whatsapp}
              onChangeText={setWhatsapp}
              placeholder={t('customerEditWhatsappPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="phone-pad"
              editable={!saving}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              {t('customerEditJobTitle')} <Text style={styles.optional}>{t('fieldOptional')}</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={jobTitle}
              onChangeText={setJobTitle}
              placeholder={t('customerEditJobPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="words"
              editable={!saving}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              {t('customerEditAboutLabel')} <Text style={styles.optional}>{t('fieldOptional')}</Text>
            </Text>
            <TextInput
              style={[styles.input, { minHeight: 96, textAlignVertical: 'top' }]}
              value={about}
              onChangeText={setAbout}
              placeholder={t('customerEditAboutPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              multiline
              editable={!saving}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              {t('customerEditContactEmailLabel')} <Text style={styles.optional}>{t('fieldOptional')}</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={contactEmail}
              onChangeText={setContactEmail}
              placeholder={t('customerEditContactEmailPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!saving}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              {t('customerEditInstagramLabel')} <Text style={styles.optional}>{t('fieldOptional')}</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={instagram}
              onChangeText={setInstagram}
              placeholder={t('customerEditInstagramPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              editable={!saving}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              {t('customerEditWebsiteLabel')} <Text style={styles.optional}>{t('fieldOptional')}</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={website}
              onChangeText={setWebsite}
              placeholder={t('customerEditWebsitePlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              editable={!saving}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="key-outline" size={20} color={theme.colors.primary} />
            </View>
            <Text style={styles.sectionTitle}>{t('profileEditAccountSecurityTitle')}</Text>
          </View>
          {(user as { new_email?: string | null }).new_email ? (
            <Text style={styles.pendingEmailBanner}>
              {t('profileEditPendingNewEmail', { email: (user as { new_email?: string }).new_email ?? '' })}
            </Text>
          ) : null}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('profileEditLoginEmailLabel')}</Text>
            <TextInput
              style={styles.input}
              value={loginEmailDraft}
              onChangeText={setLoginEmailDraft}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!saving && !accountBusy}
            />
          </View>
          {!emailChangeAwaitingOtp ? (
            <TouchableOpacity
              style={[styles.secondaryButton, accountBusy && styles.primaryButtonDisabled]}
              onPress={handleRequestProfileEmailCode}
              disabled={saving || accountBusy}
            >
              <Text style={styles.secondaryButtonText}>{t('profileEditRequestEmailCode')}</Text>
            </TouchableOpacity>
          ) : (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('convertToFullAccountOtpLabel')}</Text>
                <TextInput
                  style={[styles.input, { letterSpacing: 4, textAlign: 'center', fontSize: 18 }]}
                  value={emailOtpCode}
                  onChangeText={(v) => setEmailOtpCode(v.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!accountBusy}
                />
              </View>
              <TouchableOpacity
                style={[styles.secondaryButton, accountBusy && styles.primaryButtonDisabled]}
                onPress={handleVerifyProfileEmailOtp}
                disabled={accountBusy}
              >
                <Text style={styles.secondaryButtonText}>{t('profileEditVerifyEmailButton')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.textLinkWrap} onPress={handleResendProfileEmailCode} disabled={accountBusy}>
                <Text style={styles.textLink}>{t('convertToFullAccountResendCode')}</Text>
              </TouchableOpacity>
            </>
          )}
          <View style={[styles.inputGroup, { marginTop: theme.spacing.xl }]}>
            <Text style={styles.label}>{t('profileEditNewPasswordLabel')}</Text>
            <TextInput
              style={styles.input}
              value={newPass}
              onChangeText={setNewPass}
              secureTextEntry
              autoCapitalize="none"
              editable={!saving && !accountBusy}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('profileEditNewPasswordConfirmLabel')}</Text>
            <TextInput
              style={styles.input}
              value={newPass2}
              onChangeText={setNewPass2}
              secureTextEntry
              autoCapitalize="none"
              editable={!saving && !accountBusy}
            />
          </View>
          <TouchableOpacity
            style={[styles.secondaryButton, accountBusy && styles.primaryButtonDisabled]}
            onPress={handleUpdatePasswordOnly}
            disabled={saving || accountBusy}
          >
            <Text style={styles.secondaryButtonText}>{t('profileEditUpdatePasswordButton')}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.white} size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={24} color={theme.colors.white} style={{ marginRight: 10 }} />
              <Text style={styles.primaryButtonText}>{t('saveChanges')}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: theme.spacing.lg },
  section: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  sectionHint: {
    fontSize: 13,
    color: theme.colors.textMuted,
    lineHeight: 20,
    marginTop: 4,
  },
  inputGroup: {
    marginBottom: theme.spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
  },
  optional: {
    fontWeight: '400',
    color: theme.colors.textMuted,
  },
  input: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: theme.colors.text,
  },
  emailCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  emailCardText: { flex: 1, marginLeft: 12 },
  emailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  emailValue: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.text,
  },
  hint: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  primaryButton: {
    flexDirection: 'row',
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { fontSize: 17, fontWeight: '700', color: theme.colors.white },
  secondaryButton: {
    backgroundColor: theme.colors.primary + '18',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  secondaryButtonText: { fontSize: 15, fontWeight: '700', color: theme.colors.primary },
  pendingEmailBanner: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    padding: 12,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 10,
  },
  textLinkWrap: { alignItems: 'center', paddingVertical: 8, marginBottom: theme.spacing.sm },
  textLink: { fontSize: 14, fontWeight: '600', color: theme.colors.primary },
  placeholderContainer: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
    paddingHorizontal: theme.spacing.xl,
    alignItems: 'center',
  },
  placeholderIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  placeholderTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  placeholderText: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
    lineHeight: 22,
  },
});
