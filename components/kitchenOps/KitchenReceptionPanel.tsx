import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { canAccessKitchenReceptionAccounting } from '@/lib/staffPermissions';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';
import { KITCHEN_POS_STATUSES } from '@/lib/kitchenOps/constants';
import { formatDateShort, formatTime } from '@/lib/date';
import {
  advanceKitchenPosStatus,
  approveKitchenDayClosure,
  checkPosMismatch,
  fetchDaySummary,
  fetchKitchenPosTransactions,
  fetchPendingDayClosures,
  type KitchenDayClosureRow,
  type KitchenPosTransactionRow,
} from '@/lib/kitchenOps/api';
import { Ionicons } from '@expo/vector-icons';
import { KitchenMoneyStat } from '@/components/kitchenOps/KitchenUi';

const STATUS_LABELS = Object.fromEntries(KITCHEN_POS_STATUSES.map((s) => [s.value, s.label]));
const NEXT_STATUS: Record<string, string> = {
  pending: 'approved',
  approved: 'transferred',
  transferred: 'commission_deducted',
  commission_deducted: 'completed',
};

type Tab = 'pos' | 'day_close';

export function KitchenReceptionPanel() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const allowed = canAccessKitchenReceptionAccounting(staff);
  const [tab, setTab] = useState<Tab>('pos');
  const [rows, setRows] = useState<KitchenPosTransactionRow[]>([]);
  const [closures, setClosures] = useState<KitchenDayClosureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [posMismatch, setPosMismatch] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [summary, setSummary] = useState({ total_revenue: 0, total_pos: 0, net_remaining: 0 });

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [posRows, closureRows, mismatch, daySummary] = await Promise.all([
        fetchKitchenPosTransactions(50),
        fetchPendingDayClosures(),
        checkPosMismatch().catch(() => false),
        fetchDaySummary().catch(() => ({ total_revenue: 0, total_pos: 0, net_remaining: 0 })),
      ]);
      setRows(posRows);
      setClosures(closureRows);
      setPosMismatch(mismatch);
      setSummary({
        total_revenue: Number(daySummary.total_revenue ?? 0),
        total_pos: Number(daySummary.total_pos ?? 0),
        net_remaining: Number(daySummary.net_remaining ?? 0),
      });
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    load().finally(() => setLoading(false));
  }, [allowed, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const advanceStatus = async (row: KitchenPosTransactionRow) => {
    const next = NEXT_STATUS[row.status];
    if (!next) return;
    setAdvancingId(row.id);
    try {
      await advanceKitchenPosStatus(row.id);
      await load();
    } catch (e) {
      Alert.alert('Onay hatası', (e as Error).message);
    } finally {
      setAdvancingId(null);
    }
  };

  const approveClosure = async (row: KitchenDayClosureRow) => {
    Alert.alert(
      'Gün sonu onayı',
      `${formatDateShort(row.closure_date)} gün kapanışını onaylıyor musunuz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Onayla',
          onPress: async () => {
            setApprovingId(row.id);
            try {
              await approveKitchenDayClosure(row.id);
              Alert.alert('Tamam', 'Gün sonu onaylandı.');
              await load();
            } catch (e) {
              Alert.alert('Hata', (e as Error).message);
            } finally {
              setApprovingId(null);
            }
          },
        },
      ]
    );
  };

  const pendingPos = rows.filter((r) => r.status === 'pending');

  if (!allowed) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={48} color={theme.colors.textMuted} />
        <Text style={styles.denied}>Reception mutfak muhasebe yetkisi gerekli.</Text>
        <Text style={styles.deniedHint}>Admin → Personel düzenle → «Reception mutfak muhasebe» kutusunu işaretleyin.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
        <KitchenMoneyStat label="Bugün hasılat" amount={summary.total_revenue} />
        <KitchenMoneyStat label="POS toplam" amount={summary.total_pos} />
        <KitchenMoneyStat label="Net kalan" amount={summary.net_remaining} highlight />
      </ScrollView>

      {loadError ? (
        <TouchableOpacity style={styles.warn} onPress={() => void load()}>
          <Ionicons name="alert-circle" size={18} color="#dc2626" />
          <Text style={styles.warnText}>{loadError} — yenilemek için dokunun</Text>
        </TouchableOpacity>
      ) : null}

      {posMismatch ? (
        <View style={styles.warn}>
          <Ionicons name="warning" size={18} color="#dc2626" />
          <Text style={styles.warnText}>Kasa farkı: Otel POS hasılatı ile POS kayıtları uyuşmuyor.</Text>
        </View>
      ) : null}

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'pos' && styles.tabActive]} onPress={() => setTab('pos')}>
          <Text style={[styles.tabText, tab === 'pos' && styles.tabTextActive]}>
            POS onay {pendingPos.length > 0 ? `(${pendingPos.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'day_close' && styles.tabActive]} onPress={() => setTab('day_close')}>
          <Text style={[styles.tabText, tab === 'day_close' && styles.tabTextActive]}>
            Gün sonu {closures.length > 0 ? `(${closures.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'pos' ? (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
          ListHeaderComponent={
            pendingPos.length > 0 ? (
              <Text style={styles.sectionHint}>{pendingPos.length} kayıt onay bekliyor</Text>
            ) : null
          }
          renderItem={({ item }) => {
            const next = NEXT_STATUS[item.status];
            const isPending = item.status === 'pending';
            return (
              <View style={[styles.card, isPending && styles.cardPending]}>
                <View style={styles.row}>
                  <Text style={styles.amount}>{fmtKitchenMoney(Number(item.amount))}</Text>
                  <Text style={[styles.status, isPending && styles.pending]}>{STATUS_LABELS[item.status] ?? item.status}</Text>
                </View>
                <Text style={styles.meta}>
                  {formatDateShort(item.entry_date)} {formatTime(item.created_at)} · {item.creator_name ?? '—'}
                </Text>
                {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
                {next ? (
                  <TouchableOpacity
                    style={[styles.approveBtn, advancingId === item.id && styles.approveBtnDisabled]}
                    onPress={() => advanceStatus(item)}
                    disabled={advancingId === item.id}
                  >
                    {advancingId === item.id ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.approveText}>Onayla → {STATUS_LABELS[next]}</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="card-outline" size={40} color={theme.colors.textMuted} />
              <Text style={styles.empty}>POS kaydı yok.</Text>
              <Text style={styles.emptyHint}>Mutfak ekibi hasılat girerken «Otel POS» seçerse burada görünür.</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={closures}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.amount}>{formatDateShort(item.closure_date)}</Text>
                <Text style={[styles.status, item.status === 'submitted' && styles.pending]}>
                  {item.status === 'submitted' ? 'Onay bekliyor' : 'Taslak'}
                </Text>
              </View>
              <Text style={styles.meta}>
                Hasılat {fmtKitchenMoney(Number(item.total_revenue))} · POS {fmtKitchenMoney(Number(item.total_pos))} · Net{' '}
                {fmtKitchenMoney(Number(item.net_remaining))}
              </Text>
              <TouchableOpacity
                style={[styles.approveBtn, styles.approveBtnGreen, approvingId === item.id && styles.approveBtnDisabled]}
                onPress={() => approveClosure(item)}
                disabled={approvingId === item.id}
              >
                {approvingId === item.id ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.approveText}>Gün sonunu onayla</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="moon-outline" size={40} color={theme.colors.textMuted} />
              <Text style={styles.empty}>Onay bekleyen gün sonu yok.</Text>
              <TouchableOpacity style={styles.linkBtn} onPress={() => router.push('/staff/kitchen-ops/day-close')}>
                <Text style={styles.linkBtnText}>Gün sonu ekranına git</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  denied: { marginTop: 12, color: theme.colors.textSecondary, textAlign: 'center', fontWeight: '600' },
  deniedHint: { marginTop: 8, color: theme.colors.textMuted, textAlign: 'center', fontSize: 13, lineHeight: 18 },
  statsRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  warn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#fef2f2',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  warnText: { flex: 1, color: '#dc2626', fontSize: 13, fontWeight: '600' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, gap: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  tabText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
  tabTextActive: { color: '#fff' },
  list: { padding: 16, paddingTop: 8, paddingBottom: 32 },
  sectionHint: { fontSize: 13, color: '#b45309', fontWeight: '600', marginBottom: 10 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  cardPending: { borderColor: '#fcd34d', backgroundColor: '#fffbeb' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  status: { fontSize: 12, fontWeight: '700', color: '#059669' },
  pending: { color: '#d97706' },
  meta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  desc: { fontSize: 14, color: theme.colors.text, marginTop: 4 },
  approveBtn: { marginTop: 10, backgroundColor: theme.colors.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  approveBtnGreen: { backgroundColor: '#059669' },
  approveBtnDisabled: { opacity: 0.7 },
  approveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyBox: { alignItems: 'center', paddingTop: 32, paddingHorizontal: 16 },
  empty: { textAlign: 'center', color: theme.colors.textMuted, marginTop: 12, fontSize: 15, fontWeight: '600' },
  emptyHint: { textAlign: 'center', color: theme.colors.textMuted, marginTop: 8, fontSize: 13, lineHeight: 18 },
  linkBtn: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 16 },
  linkBtnText: { color: theme.colors.primary, fontWeight: '700' },
});
