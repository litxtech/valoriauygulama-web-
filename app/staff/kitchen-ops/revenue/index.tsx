import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';
import { KITCHEN_PAYMENT_TYPES } from '@/lib/kitchenOps/constants';
import { formatTime } from '@/lib/date';
import { fetchDaySummary } from '@/lib/kitchenOps/api';
import { KitchenPrintBar } from '@/components/kitchenOps/KitchenPrintBar';
import { KitchenRevenueDayPicker } from '@/components/kitchenOps/KitchenRevenueDayPicker';
import {
  fetchKitchenRevenuesByDate,
  kitchenTableLabel,
  summarizeKitchenRevenues,
  todayKitchenDateIso,
  type KitchenRevenueRow,
} from '@/lib/kitchenOps/revenueTables';
import { useCachedFocusLoad } from '@/hooks/useCachedFocusLoad';

const PAY_LABELS = Object.fromEntries(KITCHEN_PAYMENT_TYPES.map((p) => [p.value, p.label]));

type RevenueCache = {
  rows: KitchenRevenueRow[];
  dayTotal: number;
};

export default function KitchenRevenueListScreen() {
  const router = useRouter();
  const [date, setDate] = useState(todayKitchenDateIso);

  const fetchData = useCallback(async (): Promise<RevenueCache | null> => {
    const [revenueRows, summary] = await Promise.all([
      fetchKitchenRevenuesByDate(date),
      fetchDaySummary(date).catch(() => ({ total_revenue: 0 })),
    ]);
    return {
      rows: revenueRows,
      dayTotal: Number(summary.total_revenue ?? 0),
    };
  }, [date]);

  const { data, loading, refreshing, refresh, showContent } = useCachedFocusLoad<RevenueCache>({
    cacheKey: `kitchen-revenue:${date}`,
    fetchData,
  });

  const rows = data?.rows ?? [];
  const dayTotal = data?.dayTotal ?? 0;

  const stats = useMemo(() => summarizeKitchenRevenues(rows), [rows]);
  const isToday = date === todayKitchenDateIso();

  if (loading && !showContent) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#059669" />}
        ListHeaderComponent={
          <>
            <LinearGradient colors={['#059669', '#047857', '#065f46']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <Text style={styles.heroTitle}>Mutfak hasılat</Text>
              <Text style={styles.heroSub}>{isToday ? 'Bugünkü kayıtlar' : 'Seçilen gün'}</Text>
              <Text style={styles.heroTotal}>{fmtKitchenMoney(dayTotal)}</Text>
              <Text style={styles.heroMeta}>
                {stats.count} kayıt · {Object.keys(stats.byTable).length} masa
              </Text>
            </LinearGradient>

            <KitchenRevenueDayPicker date={date} onChange={setDate} />

            <View style={styles.printWrap}>
              <KitchenPrintBar kind="revenue" compact />
            </View>

            {Object.keys(stats.byTable).length > 0 ? (
              <View style={styles.tableSummary}>
                <Text style={styles.tableSummaryTitle}>Masa özeti</Text>
                <View style={styles.tableChips}>
                  {Object.entries(stats.byTable)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([tableNo, amount]) => (
                      <View key={tableNo} style={styles.tableChip}>
                        <Text style={styles.tableChipLabel}>{kitchenTableLabel(Number(tableNo))}</Text>
                        <Text style={styles.tableChipValue}>{fmtKitchenMoney(amount)}</Text>
                      </View>
                    ))}
                </View>
              </View>
            ) : null}

            <Text style={styles.listTitle}>Kayıtlar</Text>
          </>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.timeWrap}>
                <Ionicons name="time-outline" size={14} color="#64748b" />
                <Text style={styles.time}>{formatTime(item.created_at)}</Text>
              </View>
              <Text style={styles.amount}>{fmtKitchenMoney(Number(item.amount))}</Text>
            </View>
            <View style={styles.cardMid}>
              {item.table_number ? (
                <View style={styles.tableBadge}>
                  <Text style={styles.tableBadgeText}>{kitchenTableLabel(item.table_number)}</Text>
                </View>
              ) : null}
              {item.payment_type ? (
                <Text style={styles.payType}>{PAY_LABELS[item.payment_type] ?? item.payment_type}</Text>
              ) : null}
            </View>
            {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
            {item.description && item.description !== kitchenTableLabel(item.table_number ?? 0) ? (
              <Text style={styles.desc}>{item.description}</Text>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="receipt-outline" size={36} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>Bu gün hasılat yok</Text>
            <Text style={styles.emptySub}>Hasılat girmek için alttaki butonu kullanın.</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/staff/kitchen-ops/revenue/new' as never)} activeOpacity={0.9}>
        <Ionicons name="add" size={24} color="#fff" />
        <Text style={styles.fabText}>Hasılat gir</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 100, gap: 10 },
  hero: { borderRadius: 18, padding: 18, marginBottom: 14, ...theme.shadows.md },
  heroTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: 2 },
  heroTotal: { fontSize: 32, fontWeight: '800', color: '#fff', marginTop: 12 },
  heroMeta: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  printWrap: { marginTop: 14, marginBottom: 4 },
  tableSummary: {
    marginTop: 14,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  tableSummaryTitle: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 10 },
  tableChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tableChip: {
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    minWidth: 88,
  },
  tableChipLabel: { fontSize: 11, fontWeight: '700', color: '#047857' },
  tableChipValue: { fontSize: 14, fontWeight: '800', color: '#065f46', marginTop: 2 },
  listTitle: { fontSize: 13, fontWeight: '700', color: '#475569', marginTop: 16, marginBottom: 4 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timeWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  time: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  amount: { fontSize: 18, fontWeight: '800', color: '#059669' },
  cardMid: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  tableBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  tableBadgeText: { fontSize: 12, fontWeight: '700', color: '#1d4ed8' },
  payType: { fontSize: 12, color: theme.colors.textSecondary },
  note: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 6 },
  desc: { fontSize: 13, color: theme.colors.text, marginTop: 4 },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#64748b' },
  emptySub: { fontSize: 13, color: '#94a3b8', textAlign: 'center' },
  fab: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    borderRadius: 16,
    paddingVertical: 16,
    ...theme.shadows.md,
  },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
