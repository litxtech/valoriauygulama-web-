import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import {
  fetchPaymentRequests,
  formatPaymentAmount,
  isPaymentHistoryForList,
  type PaymentRequestRow,
} from '@/lib/payments';
import { paymentKindLabel, paymentStatusLabel, paymentText } from '@/lib/paymentsI18n';

const STATUS_COLOR = {
  pending: '#f59e0b',
  paid: '#22c55e',
  failed: '#ef4444',
  expired: '#94a3b8',
  cancelled: '#94a3b8',
  refunded: '#6366f1',
} as const;

export default function StaffPaymentsHistoryScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [rows, setRows] = useState<PaymentRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const orgId = staff?.organization_id ?? null;
      const payments = await fetchPaymentRequests(orgId);
      setRows(payments.filter(isPaymentHistoryForList));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [staff?.organization_id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  return (
    <View style={styles.container}>
      {loading && rows.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />
          }
          ListHeaderComponent={
            <Text style={styles.intro}>{paymentText('paymentsHistorySub')}</Text>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Geçmiş kayıt yok</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.88}
              style={styles.card}
              onPress={() => router.push(`/staff/payments/${item.id}`)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                <View style={[styles.badge, { backgroundColor: STATUS_COLOR[item.status] + '18' }]}>
                  <Text style={[styles.badgeText, { color: STATUS_COLOR[item.status] }]}>
                    {paymentStatusLabel(item.status, { archived: Boolean(item.archived_at) })}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardAmount}>{formatPaymentAmount(Number(item.amount), item.currency)}</Text>
              <Text style={styles.cardMeta}>{paymentKindLabel(item.service_kind)}</Text>
              <Text style={styles.cardDate}>{new Date(item.created_at).toLocaleString('tr-TR')}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  list: { padding: 16, paddingBottom: 32 },
  intro: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 12, lineHeight: 18 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: theme.colors.textSecondary },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: theme.colors.text },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  cardAmount: { fontSize: 22, fontWeight: '900', color: '#635bff', marginTop: 8 },
  cardMeta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  cardDate: { fontSize: 11, color: theme.colors.textMuted, marginTop: 8 },
});
