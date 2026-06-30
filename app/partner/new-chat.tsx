import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatChatMessageSendError, partnerListStaffForChat, partnerOpenStaffChat } from '@/lib/messagingApi';
import { MESSAGING_COLORS } from '@/lib/messaging';
import { StaffNameWithBadge, AvatarWithBadge } from '@/components/VerifiedBadge';
import { CachedImage } from '@/components/CachedImage';
import { sortStaffAdminFirst } from '@/lib/sortStaffAdminFirst';
import { displayStaffNameForViewer } from '@/lib/staffProfilePrivacy';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';

type StaffRow = {
  id: string;
  full_name: string | null;
  department: string | null;
  profile_image: string | null;
  is_online: boolean | null;
  role?: string | null;
  verification_badge?: 'blue' | 'yellow' | null;
  profile_hidden_by_admin?: boolean | null;
};

export default function PartnerNewChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ staffId?: string }>();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);

  useEffect(() => {
    void loadStaff();
  }, []);

  useEffect(() => {
    if (!loading && params.staffId && !startingId) {
      void startChat(params.staffId);
    }
  }, [loading, params.staffId]);

  const loadStaff = async () => {
    try {
      const rows = await partnerListStaffForChat();
      setStaff(
        sortStaffAdminFirst(rows as StaffRow[], (a, b) =>
          (a.full_name || '').localeCompare(b.full_name || '', 'tr')
        )
      );
    } catch (e) {
      Alert.alert('Hata', (e as Error).message || 'Personel listesi yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const startChat = async (staffId: string) => {
    setStartingId(staffId);
    try {
      const { conversationId, error } = await partnerOpenStaffChat(staffId);
      if (conversationId) {
        router.replace({ pathname: '/partner/chat/[id]', params: { id: conversationId } });
        return;
      }
      Alert.alert('Mesaj gönderilemedi', error ?? 'Bilinmeyen hata');
    } catch (e) {
      Alert.alert('Mesaj gönderilemedi', formatChatMessageSendError(e, 'Bilinmeyen hata'));
    } finally {
      setStartingId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={partnerTheme.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Ionicons name="arrow-back" size={22} color={partnerTheme.text} />
        <Text style={styles.backText}>Geri</Text>
      </TouchableOpacity>
      <Text style={styles.sectionTitle}>Personel seçin</Text>
      <Text style={styles.hint}>Departman bilgisi ismin yanında gösterilir.</Text>
      <FlatList
        data={staff}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Mesajlaşabileceğiniz personel bulunamadı.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => void startChat(item.id)}
            disabled={!!startingId}
            activeOpacity={0.7}
          >
            <AvatarWithBadge badge={item.verification_badge ?? null} avatarSize={56} badgeSize={12} showBadge={false}>
              <CachedImage uri={item.profile_image || 'https://via.placeholder.com/56'} style={styles.avatar} contentFit="cover" />
            </AvatarWithBadge>
            <View style={styles.rowBody}>
              <StaffNameWithBadge
                name={displayStaffNameForViewer(item.full_name, item.profile_hidden_by_admin ?? null, false, 'Personel')}
                badge={item.verification_badge ?? null}
                textStyle={styles.name}
              />
              <Text style={styles.dept}>
                {item.profile_hidden_by_admin ? '—' : item.department || item.role || '—'}
                {item.is_online ? '  ·  Çevrimiçi' : ''}
              </Text>
            </View>
            {startingId === item.id ? (
              <ActivityIndicator size="small" color={MESSAGING_COLORS.primary} />
            ) : (
              <Text style={styles.arrow}>→</Text>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: partnerTheme.bg, paddingHorizontal: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: partnerTheme.bg },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backText: { color: partnerTheme.text },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: partnerTheme.text, marginBottom: 4 },
  hint: { fontSize: 13, color: partnerTheme.muted, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: partnerTheme.cardBorder,
    gap: 12,
  },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  rowBody: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: partnerTheme.text },
  dept: { fontSize: 13, color: partnerTheme.muted, marginTop: 4 },
  arrow: { fontSize: 18, color: partnerTheme.muted },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: partnerTheme.muted, textAlign: 'center' },
});
