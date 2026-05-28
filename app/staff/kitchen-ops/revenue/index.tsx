import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';
import { KITCHEN_PAYMENT_TYPES } from '@/lib/kitchenOps/constants';
import { formatDateShort } from '@/lib/date';
import { KitchenPrintBar } from '@/components/kitchenOps/KitchenPrintBar';

type Row = {
  id: string;
  entry_date: string;
  description: string;
  amount: number;
  payment_type: string;
  created_at: string;
};

const PAY_LABELS = Object.fromEntries(KITCHEN_PAYMENT_TYPES.map((p) => [p.value, p.label]));

export default function KitchenRevenueListScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('kitchen_revenues')
      .select('id, entry_date, description, amount, payment_type, created_at')
      .order('entry_date', { ascending: false })
      .limit(50);
    if (error) throw error;
    setRows((data ?? []) as Row[]);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.printWrap}>
        <KitchenPrintBar kind="revenue" compact />
      </View>
      <TouchableOpacity style={styles.addFab} onPress={() => router.push('/staff/kitchen-ops/revenue/new' as never)}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.addFabText}>Hasılat Gir</Text>
      </TouchableOpacity>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.amount}>{fmtKitchenMoney(Number(item.amount))}</Text>
              <Text style={styles.date}>{formatDateShort(item.entry_date)}</Text>
            </View>
            <Text style={styles.desc}>{item.description}</Text>
            <Text style={styles.meta}>{PAY_LABELS[item.payment_type] ?? item.payment_type}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Henüz hasılat kaydı yok.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  printWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 0 },
  addFab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 16,
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  addFabText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: theme.colors.borderLight },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontSize: 18, fontWeight: '800', color: '#059669' },
  date: { fontSize: 12, color: theme.colors.textMuted },
  desc: { fontSize: 15, fontWeight: '600', color: theme.colors.text, marginTop: 6 },
  meta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  empty: { textAlign: 'center', color: theme.colors.textMuted, marginTop: 40 },
});
