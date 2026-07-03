import { useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';
import { formatDateShort } from '@/lib/date';
import { KitchenPrintBar } from '@/components/kitchenOps/KitchenPrintBar';
import { useCachedList } from '@/hooks/useCachedList';

type Row = { id: string; entry_date: string; category: string; amount: number; description: string | null; supplier_name: string | null };

export default function KitchenExpensesListScreen() {
  const router = useRouter();

  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from('kitchen_expenses')
      .select('id, entry_date, category, amount, description, supplier_name')
      .order('entry_date', { ascending: false })
      .limit(50);
    return (data ?? []) as Row[];
  }, []);

  const { items: rows, loading, refreshing, refresh } = useCachedList<Row>({
    cacheKey: 'kitchen-expenses-list',
    fetchItems,
  });

  if (loading && rows.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.printWrap}>
        <KitchenPrintBar kind="expenses" compact />
      </View>
      <TouchableOpacity style={styles.addFab} onPress={() => router.push('/staff/kitchen-ops/expenses/new' as never)}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.addFabText}>Gider Gir</Text>
      </TouchableOpacity>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.amount}>{fmtKitchenMoney(Number(item.amount))}</Text>
              <Text style={styles.date}>{formatDateShort(item.entry_date)}</Text>
            </View>
            <Text style={styles.cat}>{item.category}</Text>
            {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
            {item.supplier_name ? <Text style={styles.meta}>{item.supplier_name}</Text> : null}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Henüz gider kaydı yok.</Text>}
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
    backgroundColor: '#ea580c',
    borderRadius: 14,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  addFabText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  amount: { fontSize: 18, fontWeight: '800', color: '#ea580c' },
  date: { fontSize: 12, color: theme.colors.textMuted },
  cat: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginTop: 6 },
  desc: { fontSize: 14, color: theme.colors.text, marginTop: 4 },
  meta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  empty: { textAlign: 'center', color: theme.colors.textMuted, marginTop: 40 },
});
