import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { pickProfileCoverUri } from '@/lib/profileCoverPicker';
import { theme } from '@/constants/theme';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { persistGuestCoverImageUrl, persistGuestPhotoUrl } from '@/lib/syncGuestProfileMedia';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';
import { ModernGuestProfileShell } from '@/components/modernProfile/ModernGuestProfileShell';
import type { ProfileMenuAction } from '@/components/modernProfile/ProfileMenuSheet';
import type { VerificationBadgeType } from '@/components/VerifiedBadge';
import type { ModernGuestProfileInput } from '@/lib/modernGuestProfileModel';

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
  const { t } = useTranslation();
  const { user, loadSession, loading: authLoading } = useAuthStore();
  const isLoggedIn = !!user;

  const coverUrl = (user?.user_metadata?.cover_url as string) || null;
  const avatarUrl = (user?.user_metadata?.avatar_url as string) || null;

  const [coverUri, setCoverUri] = useState<string | null>(coverUrl);
  const [avatarUri, setAvatarUri] = useState<string | null>(avatarUrl);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [coverModalVisible, setCoverModalVisible] = useState(false);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [postCount, setPostCount] = useState(0);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  useEffect(() => {
    setCoverUri(coverUrl);
    setAvatarUri(avatarUrl);
  }, [coverUrl, avatarUrl]);

  const loadPostCount = useCallback(async () => {
    if (!isLoggedIn) {
      setGuestId(null);
      setPostCount(0);
      return;
    }
    try {
      const guest = await getOrCreateGuestForCurrentSession();
      if (!guest?.guest_id) {
        setGuestId(null);
        return;
      }
      setGuestId(guest.guest_id);
      const { count, error } = await supabase
        .from('feed_posts')
        .select('id', { count: 'exact', head: true })
        .eq('guest_id', guest.guest_id);
      if (!error) setPostCount(count ?? 0);
    } catch {
      setGuestId(null);
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
    if (!user || uploadingCover) return;
    try {
      const uri = await pickProfileCoverUri(t('galleryRequired'));
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
        await persistGuestPhotoUrl(publicUrl);
      }
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('avatarUploadError'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const displayName = getDisplayName(t);
  const displayEmail = getDisplayEmail(user);
  const verificationBadge = (user?.user_metadata?.verification_badge as VerificationBadgeType) ?? null;
  const modernGuestInput: ModernGuestProfileInput = useMemo(
    () => ({
      fullName: displayName,
      bio: (user?.user_metadata?.about as string) || '',
      jobTitle: (user?.user_metadata?.job_title as string) || '',
      contactEmail: (user?.user_metadata?.contact_email as string) || displayEmail,
      profileImage: avatarUri,
      coverImage: coverUri,
      organizationName: 'Valoria Hotel',
      postCount,
      verificationBadge,
    }),
    [displayName, user?.user_metadata, displayEmail, avatarUri, coverUri, postCount, verificationBadge]
  );

  const profileMenuActions: ProfileMenuAction[] = useMemo(() => {
    const items: ProfileMenuAction[] = [
      {
        id: 'settings',
        icon: 'settings-outline',
        label: t('customerProfileSettingsButton'),
        onPress: () => router.push('/customer/profile/settings'),
      },
    ];
    if (!isLoggedIn) return items;
    return [
      ...items,
      {
        id: 'avatar',
        icon: 'camera-outline',
        label: t('customerEditProfilePhotoLabel'),
        onPress: () => void pickAvatar(),
      },
      {
        id: 'cover',
        icon: 'image-outline',
        label: t('customerEditCoverLabel'),
        onPress: () => void pickCover(),
      },
    ];
  }, [isLoggedIn, t, router]);

  const onAvatarPress = useCallback(() => {
    if (uploadingAvatar) return;
    if (avatarUri) setAvatarModalVisible(true);
    else if (isLoggedIn) void pickAvatar();
  }, [uploadingAvatar, avatarUri, isLoggedIn]);

  const onCoverPress = useCallback(() => {
    if (coverUri) setCoverModalVisible(true);
    else if (isLoggedIn) void pickCover();
  }, [coverUri, isLoggedIn]);

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
      {authLoading ? (
        <View style={styles.profileLoading}>
          <ActivityIndicator color={P.gradient.start} />
        </View>
      ) : (
        <ModernGuestProfileShell
          input={modernGuestInput}
          guestId={guestId}
          mode="self"
          feedVisibility="own"
          menuOpen={profileMenuOpen}
          onMenuOpenChange={setProfileMenuOpen}
          menuActions={profileMenuActions}
          onEditPress={() => router.push('/customer/profile/edit')}
          onSettingsPress={() => router.push('/customer/profile/settings')}
          onAccountPress={() => router.push('/customer/profile/settings')}
          onAvatarPress={onAvatarPress}
          onCoverPress={onCoverPress}
          topInset={insets.top}
          uploadingCover={uploadingCover}
        />
      )}

      <ImagePreviewModal
        visible={coverModalVisible}
        uri={coverUri}
        onClose={() => setCoverModalVisible(false)}
      />
      <ImagePreviewModal
        visible={avatarModalVisible}
        uri={avatarUri}
        onClose={() => setAvatarModalVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: P.bg },
  content: { paddingBottom: theme.spacing.xxl + 24 },
  profileLoading: { paddingVertical: 48, alignItems: 'center' },
});
