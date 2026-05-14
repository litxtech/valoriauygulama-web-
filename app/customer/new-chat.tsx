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
import { guestGetOrCreateConversationWithStaff } from '@/lib/messagingApi';
import { supabase } from '@/lib/supabase';
import { syncGuestMessagingAppToken } from '@/lib/getOrCreateGuestForCaller';
import { MESSAGING_COLORS } from '@/lib/messaging';
import { StaffNameWithBadge, AvatarWithBadge } from '@/components/VerifiedBadge';
import { CachedImage } from '@/components/CachedImage';
import { sortStaffAdminFirst } from '@/lib/sortStaffAdminFirst';
import { useTranslation } from 'react-i18next';
import { displayStaffNameForViewer } from '@/lib/staffProfilePrivacy';

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

export default function NewChatScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ staffId?: string }>();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);

  useEffect(() => {
    loadStaff();
  }, []);

  useEffect(() => {
    if (!loading && params.staffId && !startingId) {
      startChat(params.staffId);
    }
  }, [loading, params.staffId]);

  /** Oturum varsa: mesajlaşma token’ını daima sunucuyla hizala (yalnızca depoda eski app_token varken yönlendirme/oluşturma boş döner). */
  const loadStaff = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await syncGuestMessagingAppToken();
    // Giriş yapmış kullanıcı: staff tablosundan çek (verification_badge dahil)
    if (session) {
      const { data: directData } = await supabase
        .from('staff')
        .select('id, full_name, department, profile_image, is_online, role, verification_badge, profile_hidden_by_admin')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('full_name');
      const direct = (directData ?? []) as StaffRow[];
      setStaff(
        sortStaffAdminFirst(direct, (a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'tr'))
      );
      setLoading(false);
      return;
    }
    // Giriş yok: RPC ile personel listesi (anon)
    const { data: rpcData } = await supabase.rpc('messaging_list_staff_for_guest');
    const rows: StaffRow[] = Array.isArray(rpcData) ? rpcData : rpcData ? [rpcData] : [];
    setStaff(sortStaffAdminFirst(rows, (a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'tr')));
    setLoading(false);
  };

  const startChat = async (staffId: string) => {
    const token = await syncGuestMessagingAppToken();
    if (!token) {
      router.replace('/customer/(tabs)/messages');
      return;
    }
    setStartingId(staffId);
    const convId = await guestGetOrCreateConversationWithStaff(token, staffId);
    setStartingId(null);
    if (convId) {
      router.replace({ pathname: '/customer/chat/[id]', params: { id: convId } });
      return;
    }
    Alert.alert(t('chatMessageBlockedTitle'), t('chatMessageBlockedBody'));
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={MESSAGING_COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{t('newChatStartWithStaff')}</Text>
      <FlatList
        data={staff}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{t('newChatNoStaff')}</Text>
              <Text style={styles.emptySub}>{t('newChatNoStaffHint')}</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => startChat(item.id)}
            disabled={!!startingId}
            activeOpacity={0.7}
          >
            <AvatarWithBadge badge={item.verification_badge ?? null} avatarSize={56} badgeSize={12} showBadge={false}>
              <CachedImage uri={item.profile_image || 'https://via.placeholder.com/56'} style={styles.avatar} contentFit="cover" />
            </AvatarWithBadge>
            <View style={styles.rowBody}>
              <StaffNameWithBadge
                name={displayStaffNameForViewer(item.full_name, item.profile_hidden_by_admin ?? null, false, t('staffTab'))}
                badge={item.verification_badge ?? null}
                textStyle={styles.name}
              />
              <Text style={styles.dept}>
                {item.profile_hidden_by_admin ? '—' : item.department || item.role || '—'}
                {item.is_online ? `  ·  🟢 ${t('online')}` : ''}
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
  container: { flex: 1, backgroundColor: MESSAGING_COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: MESSAGING_COLORS.textSecondary,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
  rowBody: { flex: 1 },
  name: { fontWeight: '600', fontSize: 16, color: MESSAGING_COLORS.text },
  dept: { fontSize: 13, color: MESSAGING_COLORS.textSecondary, marginTop: 2 },
  arrow: { fontSize: 18, color: MESSAGING_COLORS.textSecondary },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 16, color: MESSAGING_COLORS.textSecondary },
  emptySub: { fontSize: 14, color: MESSAGING_COLORS.textSecondary, marginTop: 8 },
});
