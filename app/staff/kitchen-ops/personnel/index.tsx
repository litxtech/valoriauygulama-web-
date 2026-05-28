import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';
import { KITCHEN_PERSONNEL_PAYMENT_TYPES } from '@/lib/kitchenOps/constants';
import { formatDateShort } from '@/lib/date';
import { KitchenPrintBar } from '@/components/kitchenOps/KitchenPrintBar';

type Row = { id: string; staff_name: string; staff_role: string | null; amount: number; payment_type: string; entry_date: string };
const TYPE_LABELS = Object.fromEntries(KITCHEN_PERSONNEL_PAYMENT_TYPES.map((p) => [p.value, p.label]));

export default function KitchenPersonnelListScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from('kitchen_personnel_payments').select('id, staff_name, staff_role, amount, payment_type, entry_date').order('entry_date', { ascending: false }).limit(50);
    setRows((data ?? []) as Row[]);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.printWrap}>
        <KitchenPrintBar kind="personnel" compact />
      </View>
      <TouchableOpacity style={styles.addFab} onPress={() => router.push('/staff/kitchen-ops/personnel/new' as never)}>
        <Ionicons name="add" size={22} color="#fff" /><Text style={styles.addFabText}>Ödeme Kaydı</Text>
      </TouchableOpacity>
      <FlatList data={rows} keyExtractor={(r) => r.id} contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.staff_name}</Text>
            <Text style={styles.amount}>{fmtKitchenMoney(Number(item.amount))}</Text>
            <Text style={styles.meta}>{TYPE_LABELS[item.payment_type]} · {formatDateShort(item.entry_date)}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Henüz ödeme kaydı yok.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  printWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 0 },
  addFab: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, backgroundColor: '#2563eb', borderRadius: 14, paddingVertical: 14, justifyContent: 'center' },
  addFabText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: theme.colors.borderLight },
  name: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  amount: { fontSize: 18, fontWeight: '800', color: '#2563eb', marginTop: 4 },
  meta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  empty: { textAlign: 'center', color: theme.colors.textMuted, marginTop: 40 },
});
