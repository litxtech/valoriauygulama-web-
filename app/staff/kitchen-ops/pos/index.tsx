import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';
import { KITCHEN_POS_STATUSES } from '@/lib/kitchenOps/constants';
import { formatDateShort } from '@/lib/date';
import { KitchenPrintBar } from '@/components/kitchenOps/KitchenPrintBar';

type Row = { id: string; entry_date: string; amount: number; net_amount: number; description: string | null; status: string };

const STATUS_LABELS = Object.fromEntries(KITCHEN_POS_STATUSES.map((s) => [s.value, s.label]));

export default function KitchenPosListScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from('kitchen_pos_transactions').select('id, entry_date, amount, net_amount, description, status').order('entry_date', { ascending: false }).limit(50);
    setRows((data ?? []) as Row[]);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.printWrap}>
        <KitchenPrintBar kind="pos" compact />
      </View>
      <TouchableOpacity style={styles.addFab} onPress={() => router.push('/staff/kitchen-ops/pos/new' as never)}>
        <Ionicons name="add" size={22} color="#fff" /><Text style={styles.addFabText}>POS Kaydı</Text>
      </TouchableOpacity>
      <FlatList data={rows} keyExtractor={(r) => r.id} contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}><Text style={styles.amount}>{fmtKitchenMoney(Number(item.amount))}</Text><Text style={[styles.status, item.status === 'pending' && styles.pending]}>{STATUS_LABELS[item.status]}</Text></View>
            <Text style={styles.date}>{formatDateShort(item.entry_date)}</Text>
            {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>POS kaydı yok.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  printWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 0 },
  addFab: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, backgroundColor: '#dc2626', borderRadius: 14, paddingVertical: 14, justifyContent: 'center' },
  addFabText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: theme.colors.borderLight },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  status: { fontSize: 12, fontWeight: '700', color: theme.colors.success },
  pending: { color: '#d97706' },
  date: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  desc: { fontSize: 14, color: theme.colors.text, marginTop: 4 },
  empty: { textAlign: 'center', color: theme.colors.textMuted, marginTop: 40 },
});
