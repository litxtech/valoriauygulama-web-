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
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import {
  fetchPaymentRequests,
  formatPaymentAmount,
  isPaymentActiveForList,
  isPaymentHistoryForList,
  type PaymentRequestRow,
} from '@/lib/payments';
import { fetchPaymentQrStands, type PaymentQrStandRow } from '@/lib/paymentQrStands';
import { paymentKindLabel, paymentStatusLabel, paymentText } from '@/lib/paymentsI18n';

const STATUS_COLOR = {
  pending: '#f59e0b',
  paid: '#22c55e',
  failed: '#ef4444',
  expired: '#94a3b8',
  cancelled: '#94a3b8',
} as const;

export default function StaffPaymentsIndex() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [rows, setRows] = useState<PaymentRequestRow[]>([]);
  const [stands, setStands] = useState<PaymentQrStandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allRows, setAllRows] = useState<PaymentRequestRow[]>([]);

  const load = useCallback(async () => {
    try {
      const orgId = staff?.organization_id ?? null;
      const [payments, qrStands] = await Promise.all([
        fetchPaymentRequests(orgId),
        fetchPaymentQrStands(orgId),
      ]);
      setAllRows(payments);
      setRows(payments.filter(isPaymentActiveForList));
      setStands(qrStands);
    } catch {
      setAllRows([]);
      setRows([]);
      setStands([]);
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

  const historyCount = allRows.filter(isPaymentHistoryForList).length;

  return (
    <View style={styles.container}>
      <TouchableOpacity activeOpacity={0.88} onPress={() => router.push('/staff/payments/new')} style={styles.newWrap}>
        <LinearGradient colors={['#635bff', '#4f46e5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.newBtn}>
          <Ionicons name="qr-code-outline" size={22} color="#fff" />
          <Text style={styles.newBtnText}>{paymentText('paymentsNew')}</Text>
        </LinearGradient>
      </TouchableOpacity>

      {historyCount > 0 ? (
        <TouchableOpacity
          style={styles.historyBtn}
          onPress={() => router.push('/staff/payments/history' as never)}
          activeOpacity={0.88}
        >
          <Ionicons name="time-outline" size={18} color="#475569" />
          <Text style={styles.historyBtnText}>
            {paymentText('paymentsViewHistory')} ({historyCount})
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
        </TouchableOpacity>
      ) : null}

      {loading && rows.length === 0 && stands.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
          ListHeaderComponent={
            stands.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{paymentText('paymentsQrModeStanding')}</Text>
                {stands.map((stand) => (
                  <TouchableOpacity
                    key={stand.id}
                    activeOpacity={0.88}
                    style={[styles.card, styles.standCard, stand.status === 'active' && styles.standCardActive]}
                    onPress={() => router.push(`/staff/payments/stand/${stand.id}`)}
                  >
                    <View style={styles.cardTop}>
                      <Ionicons name="infinite-outline" size={18} color={stand.status === 'active' ? '#16a34a' : '#64748b'} />
                      <Text style={styles.cardTitle} numberOfLines={1}>{stand.title}</Text>
                      <View style={[styles.badge, { backgroundColor: (stand.status === 'active' ? '#22c55e' : '#94a3b8') + '18' }]}>
                        <Text style={[styles.badgeText, { color: stand.status === 'active' ? '#16a34a' : '#64748b' }]}>
                          {stand.status === 'active' ? paymentText('paymentsStandingActive') : paymentText('paymentsStandingClosed')}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.cardAmount}>{formatPaymentAmount(Number(stand.amount), stand.currency)}</Text>
                  </TouchableOpacity>
                ))}
                <Text style={styles.sectionTitle}>Güncel ödemeler</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            stands.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="card-outline" size={40} color="#635bff" />
                <Text style={styles.emptyText}>{paymentText('paymentsEmpty')}</Text>
              </View>
            ) : null
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
                  <Text style={[styles.badgeText, { color: STATUS_COLOR[item.status] }]}>{paymentStatusLabel(item.status)}</Text>
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
  newWrap: { margin: 16, marginBottom: 8, borderRadius: 14, overflow: 'hidden' },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14 },
  newBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  historyBtnText: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.colors.text },
  list: { padding: 16, paddingTop: 8, paddingBottom: 32 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { color: theme.colors.textSecondary, fontSize: 14 },
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
  section: { marginBottom: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: theme.colors.textSecondary, marginBottom: 8, letterSpacing: 0.5 },
  standCard: { borderLeftWidth: 4, borderLeftColor: '#94a3b8' },
  standCardActive: { borderLeftColor: '#16a34a' },
});
