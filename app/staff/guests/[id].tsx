/**
 * Personel — misafir profili (kendi profilim ile aynı TikTok düzeni).
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
} from 'react-native';
import { useLocalSearchParams, useNavigation, usePathname, useRouter } from 'expo-router';
import { navigateStaffBack, STAFF_TABS_FALLBACK } from '@/lib/staffStackBack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { ModernGuestProfileShell } from '@/components/modernProfile/ModernGuestProfileShell';
import { ProfileCoverIconButton } from '@/components/tiktokProfile/TikTokProfileUI';
import { guestDisplayName } from '@/lib/guestDisplayName';
import { staffGetOrCreateDirectConversation } from '@/lib/messagingApi';
import type { ModernGuestProfileInput } from '@/lib/modernGuestProfileModel';

type GuestDetail = {
  id: string;
  full_name: string | null;
  photo_url: string | null;
  cover_image_url: string | null;
  email: string | null;
};

export default function StaffGuestProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const { width: windowWidth } = useWindowDimensions();
  const leaveGuest = () => navigateStaffBack(router, navigation, pathname, STAFF_TABS_FALLBACK);
  const insets = useSafeAreaInsets();
  const { staff } = useAuthStore();
  const [guest, setGuest] = useState<GuestDetail | null>(null);
  const [postCount, setPostCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [coverModalVisible, setCoverModalVisible] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);

  const loadGuest = useCallback(async () => {
    if (!id) return;
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
  }, [id]);

  useEffect(() => {
    void loadGuest();
  }, [loadGuest]);

  const handleMessage = async () => {
    if (!staff || !guest) return;
    setMessageLoading(true);
    try {
      const convId = await staffGetOrCreateDirectConversation(staff.id, guest.id, 'guest');
      if (convId) router.replace({ pathname: '/staff/chat/[id]', params: { id: convId } });
    } finally {
      setMessageLoading(false);
    }
  };

  const modernInput: ModernGuestProfileInput = useMemo(
    () => ({
      fullName: guest ? guestDisplayName(guest.full_name, 'Misafir') : '—',
      profileImage: guest?.photo_url,
      coverImage: guest?.cover_image_url,
      contactEmail: guest?.email,
      organizationName: 'Valoria Hotel',
      postCount,
    }),
    [guest, postCount]
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
        <TouchableOpacity style={styles.backBtn} onPress={leaveGuest} activeOpacity={0.8}>
          <Text style={styles.backBtnText}>Geri dön</Text>
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
          topInset={insets.top}
          coverLeftAction={
            <ProfileCoverIconButton icon="chevron-back" size={24} onPress={leaveGuest} />
          }
          onCoverPress={() => guest.cover_image_url && setCoverModalVisible(true)}
          onAvatarPress={() => guest.photo_url && setAvatarModalVisible(true)}
          onMessagePress={() => void handleMessage()}
          messageLoading={messageLoading}
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
  errorText: { fontSize: 16, color: theme.colors.text },
  backBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
  },
  backBtnText: { color: theme.colors.white, fontWeight: '600' },
});
