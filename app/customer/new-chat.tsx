import { useCallback, useEffect, useMemo, useState, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { guestOpenStaffChat, formatChatMessageSendError } from '@/lib/messagingApi';
import { supabase } from '@/lib/supabase';
import { syncGuestMessagingAppToken } from '@/lib/getOrCreateGuestForCaller';
import { useGuestMessagingStore } from '@/stores/guestMessagingStore';
import { MESSAGING_COLORS } from '@/lib/messaging';
import { StaffNameWithBadge, AvatarWithBadge } from '@/components/VerifiedBadge';
import { CachedImage } from '@/components/CachedImage';
import { sortStaffAdminFirst } from '@/lib/sortStaffAdminFirst';
import { useTranslation } from 'react-i18next';
import { displayStaffNameForViewer } from '@/lib/staffProfilePrivacy';
import { useCachedList } from '@/hooks/useCachedList';
import { CUSTOMER_FLASH_DRAW_DISTANCE, CUSTOMER_LIST_PERF, CUSTOMER_ROW_HEIGHT } from '@/lib/customerPerf';

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

type StaffPickRowProps = {
  item: StaffRow;
  startingId: string | null;
  staffTabLabel: string;
  onlineLabel: string;
  onStart: (id: string) => void;
};

const StaffPickRow = memo(function StaffPickRow({
  item,
  startingId,
  staffTabLabel,
  onlineLabel,
  onStart,
}: StaffPickRowProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onStart(item.id)}
      disabled={!!startingId}
      activeOpacity={0.7}
    >
      <AvatarWithBadge badge={item.verification_badge ?? null} avatarSize={56} badgeSize={12} showBadge={false}>
        <CachedImage uri={item.profile_image || 'https://via.placeholder.com/56'} style={styles.avatar} contentFit="cover" />
      </AvatarWithBadge>
      <View style={styles.rowBody}>
        <StaffNameWithBadge
          name={displayStaffNameForViewer(item.full_name, item.profile_hidden_by_admin ?? null, false, staffTabLabel)}
          badge={item.verification_badge ?? null}
          textStyle={styles.name}
        />
        <Text style={styles.dept}>
          {item.profile_hidden_by_admin ? '—' : item.department || item.role || '—'}
          {item.is_online ? `  ·  🟢 ${onlineLabel}` : ''}
        </Text>
      </View>
      {startingId === item.id ? (
        <ActivityIndicator size="small" color={MESSAGING_COLORS.primary} />
      ) : (
        <Text style={styles.arrow}>→</Text>
      )}
    </TouchableOpacity>
  );
});

export default function NewChatScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ staffId?: string }>();
  const [startingId, setStartingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) await syncGuestMessagingAppToken();
    const { data: rpcData } = await supabase.rpc('messaging_list_staff_for_guest');
    const rows: StaffRow[] = Array.isArray(rpcData) ? rpcData : rpcData ? [rpcData] : [];
    return sortStaffAdminFirst(rows, (a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'tr'));
  }, []);

  const { items: staff, loading } = useCachedList<StaffRow>({
    cacheKey: 'customer-new-chat-staff',
    fetchItems,
  });

  const startChat = useCallback(
    async (staffId: string) => {
      const token =
        (await syncGuestMessagingAppToken()) ?? useGuestMessagingStore.getState().appToken;
      if (!token) {
        Alert.alert(t('chatMessageBlockedTitle'), t('authRegisterRequiredMessage'));
        router.replace('/customer/(tabs)/messages');
        return;
      }
      setStartingId(staffId);
      try {
        const { conversationId, error } = await guestOpenStaffChat(token, staffId);
        if (conversationId) {
          router.push({ pathname: '/customer/chat/[id]', params: { id: conversationId } });
          return;
        }
        Alert.alert(t('messageSendFailedTitle'), error ?? t('unknownError'));
      } catch (e) {
        Alert.alert(t('messageSendFailedTitle'), formatChatMessageSendError(e, t('unknownError')));
      } finally {
        setStartingId(null);
      }
    },
    [router, t]
  );

  useEffect(() => {
    if (!loading && params.staffId && !startingId) {
      void startChat(params.staffId);
    }
  }, [loading, params.staffId, startChat, startingId]);

  const staffTabLabel = useMemo(() => t('staffTab'), [t]);
  const onlineLabel = useMemo(() => t('online'), [t]);

  const renderItem = useCallback(
    ({ item }: { item: StaffRow }) => (
      <StaffPickRow
        item={item}
        startingId={startingId}
        staffTabLabel={staffTabLabel}
        onlineLabel={onlineLabel}
        onStart={startChat}
      />
    ),
    [onlineLabel, staffTabLabel, startChat, startingId]
  );

  if (loading && staff.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={MESSAGING_COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{t('newChatStartWithStaff')}</Text>
      <FlashList
        data={staff}
        estimatedItemSize={CUSTOMER_ROW_HEIGHT.newChatStaff}
        drawDistance={CUSTOMER_FLASH_DRAW_DISTANCE}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        {...CUSTOMER_LIST_PERF}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('newChatNoStaff')}</Text>
            <Text style={styles.emptySub}>{t('newChatNoStaffHint')}</Text>
          </View>
        }
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
