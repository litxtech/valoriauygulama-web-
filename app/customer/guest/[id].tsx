/**
 * Misafir — başka misafir profili (personel profili ile aynı TikTok düzeni).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { ModernGuestProfileShell } from '@/components/modernProfile/ModernGuestProfileShell';
import { ProfileCoverIconButton } from '@/components/tiktokProfile/TikTokProfileUI';
import type { ProfileMenuAction } from '@/components/modernProfile/ProfileMenuSheet';
import { guestDisplayName } from '@/lib/guestDisplayName';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { blockUserForGuest } from '@/lib/userBlocks';
import type { ModernGuestProfileInput } from '@/lib/modernGuestProfileModel';

type GuestDetail = {
  id: string;
  full_name: string | null;
  photo_url: string | null;
  cover_image_url: string | null;
  email: string | null;
};

export default function CustomerGuestProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [guest, setGuest] = useState<GuestDetail | null>(null);
  const [postCount, setPostCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [coverModalVisible, setCoverModalVisible] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [viewerGuestId, setViewerGuestId] = useState<string | null>(null);

  const loadGuest = useCallback(async () => {
    if (!id) return;
    const session = await getOrCreateGuestForCurrentSession();
    const myGuestId = session?.guest_id ?? null;
    setViewerGuestId(myGuestId);
    if (myGuestId && myGuestId === id) {
      router.replace('/customer/profile');
      return;
    }

    const { data: g, error: ge } = await supabase
      .from('guests')
      .select('id, full_name, photo_url, cover_image_url, email')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (ge || !g) {
      setGuest(null);
      setLoading(false);
      return;
    }
    setGuest(g as GuestDetail);
    const { count } = await supabase
      .from('feed_posts')
      .select('id', { count: 'exact', head: true })
      .eq('guest_id', id)
      .in('visibility', ['customers', 'guests_only']);
    setPostCount(count ?? 0);
    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    void loadGuest();
  }, [loadGuest]);

  const handleBlockFromProfile = async () => {
    if (!viewerGuestId || !id || !guest) {
      Alert.alert(t('loginRequiredTitle'), t('loginRequiredBlockMessage'));
      return;
    }
    const name = guestDisplayName(guest.full_name, t('guestDefaultName'));
    Alert.alert(t('blockUserTitle'), t('blockUserMessage', { name }), [
      { text: t('cancelAction'), style: 'cancel' },
      {
        text: t('block'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await blockUserForGuest({
            blockerGuestId: viewerGuestId,
            blockedType: 'guest',
            blockedId: id,
          });
          if (error && error.code !== '23505') {
            Alert.alert(t('error'), error.message || t('blockUserFailed'));
            return;
          }
          setProfileMenuOpen(false);
          router.back();
        },
      },
    ]);
  };

  const menuActions: ProfileMenuAction[] = useMemo(
    () => [
      {
        id: 'block',
        icon: 'ban-outline',
        label: t('block'),
        destructive: true,
        onPress: () => void handleBlockFromProfile(),
      },
    ],
    [t, guest, viewerGuestId, id]
  );

  const modernInput: ModernGuestProfileInput = useMemo(
    () => ({
      fullName: guest ? guestDisplayName(guest.full_name, t('guestDefaultName')) : '—',
      profileImage: guest?.photo_url,
      coverImage: guest?.cover_image_url,
      contactEmail: guest?.email,
      organizationName: 'Valoria Hotel',
      postCount,
    }),
    [guest, postCount, t]
  );

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top + 60 }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!guest) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top + 60 }]}>
        <Text style={styles.errorText}>Misafir bulunamadı</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Text style={styles.backBtnText}>{t('back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 32,
          width: windowWidth,
          minWidth: windowWidth,
        }}
      >
        <ModernGuestProfileShell
          input={modernInput}
          guestId={guest.id}
          mode="viewer"
          feedVisibility="public"
          menuOpen={profileMenuOpen}
          onMenuOpenChange={setProfileMenuOpen}
          menuActions={menuActions}
          topInset={insets.top}
          coverLeftAction={
            <ProfileCoverIconButton icon="chevron-back" size={24} onPress={() => router.back()} />
          }
          onCoverPress={() => guest.cover_image_url && setCoverModalVisible(true)}
          onAvatarPress={guest.photo_url ? () => setAvatarModalVisible(true) : undefined}
        />
      </ScrollView>

      <ImagePreviewModal
        visible={avatarModalVisible}
        uri={guest.photo_url ?? null}
        onClose={() => setAvatarModalVisible(false)}
      />
      <ImagePreviewModal
        visible={coverModalVisible}
        uri={guest.cover_image_url ?? null}
        onClose={() => setCoverModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: P.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 16, color: theme.colors.textMuted, textAlign: 'center', marginBottom: 16 },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
  },
  backBtnText: { color: theme.colors.white, fontWeight: '600' },
});
