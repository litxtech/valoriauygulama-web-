import { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { fetchMyGuestServiceRequests, type GuestServiceRequestRow } from '@/lib/guestServiceRequests';
import {
  guestServiceText,
  guestServiceTypeLabel,
  guestServiceStatusLabel,
  type GuestServiceRequestType,
} from '@/lib/guestServiceRequestsI18n';
import { formatFeedRelativeTime } from '@/lib/feedRelativeTime';
import { useCachedList } from '@/hooks/useCachedList';

const TYPE_ICON: Record<GuestServiceRequestType, keyof typeof Ionicons.glyphMap> = {
  room_cleaning: 'sparkles-outline',
  towels: 'layers-outline',
  maintenance: 'construct-outline',
  late_checkout: 'time-outline',
  lost_item: 'search-outline',
  amenities: 'cube-outline',
  kitchen_order: 'restaurant-outline',
  other: 'ellipsis-horizontal-outline',
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  in_progress: '#3b82f6',
  completed: '#22c55e',
  cancelled: '#94a3b8',
};

export default function CustomerServiceRequestsScreen() {
  const router = useRouter();

  const fetchItems = useCallback(async () => {
    try {
      return await fetchMyGuestServiceRequests();
    } catch {
      return [];
    }
  }, []);

  const { items: rows, loading, refreshing, refresh } = useCachedList<GuestServiceRequestRow>({
    cacheKey: 'customer-service-requests',
    fetchItems,
  });

  const activeCount = useMemo(
    () => rows.filter((r) => r.status === 'pending' || r.status === 'in_progress').length,
    [rows]
  );

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>{guestServiceText('listTitle')}</Text>
        <Text style={styles.heroSub}>{guestServiceText('intro')}</Text>
        {activeCount > 0 ? (
          <View style={styles.activePill}>
            <Text style={styles.activePillText}>{activeCount} aktif</Text>
          </View>
        ) : null}
      </View>

      <TouchableOpacity
        style={styles.newBtn}
        activeOpacity={0.88}
        onPress={() => router.push('/customer/service-requests/new')}
      >
        <Ionicons name="add-circle" size={22} color="#fff" />
        <Text style={styles.newBtnText}>{guestServiceText('screenNew')}</Text>
      </TouchableOpacity>

      {loading && rows.length === 0 ? (
        <ActivityIndicator style={styles.loader} color={theme.colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          {rows.length === 0 ? (
            <Text style={styles.empty}>{guestServiceText('emptyList')}</Text>
          ) : (
            rows.map((row) => (
              <View key={row.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.typeRow}>
                    <Ionicons name={TYPE_ICON[row.request_type]} size={18} color={theme.colors.primary} />
                    <Text style={styles.typeText}>{guestServiceTypeLabel(row.request_type)}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: (STATUS_COLOR[row.status] ?? '#94a3b8') + '22' }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLOR[row.status] ?? '#64748b' }]}>
                      {guestServiceStatusLabel(row.status)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.desc} numberOfLines={3}>
                  {row.description}
                </Text>
                {row.room_number ? (
                  <Text style={styles.meta}>{guestServiceText('roomPrefix')} {row.room_number}</Text>
                ) : null}
                <Text style={styles.time}>{formatFeedRelativeTime(row.created_at)}</Text>
                {row.staff_note ? (
                  <View style={styles.noteBox}>
                    <Text style={styles.noteLabel}>{guestServiceText('staffNote')}</Text>
                    <Text style={styles.noteText}>{row.staff_note}</Text>
                  </View>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  hero: { padding: theme.spacing.lg, paddingBottom: 8 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  heroSub: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 6, lineHeight: 20 },
  activePill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: theme.colors.primary + '18',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  activePillText: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: theme.spacing.lg,
    marginBottom: 12,
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
  },
  newBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  loader: { marginTop: 40 },
  list: { padding: theme.spacing.lg, paddingTop: 4, paddingBottom: 40, gap: 12 },
  empty: { fontSize: 15, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 24 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  typeText: { fontSize: 15, fontWeight: '800', color: theme.colors.text, flexShrink: 1 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '800' },
  desc: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 8, lineHeight: 20 },
  meta: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginTop: 6 },
  time: { fontSize: 11, color: theme.colors.textMuted, marginTop: 6 },
  noteBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.borderLight + '80',
  },
  noteLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, marginBottom: 4 },
  noteText: { fontSize: 13, color: theme.colors.text },
});
