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

type Row = { id: string; supplier_name: string; amount: number; paid_amount: number; due_date: string | null; status: string };

const STATUS_LABELS: Record<string, string> = { pending: 'Bekliyor', partial: 'Kısmi', paid: 'Ödendi', overdue: 'Gecikti' };

export default function KitchenSuppliersListScreen() {
  const router = useRouter();

  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from('kitchen_supplier_debts')
      .select('id, supplier_name, amount, paid_amount, due_date, status')
      .order('created_at', { ascending: false })
      .limit(50);
    return (data ?? []) as Row[];
  }, []);

  const { items: rows, loading, refreshing, refresh } = useCachedList<Row>({
    cacheKey: 'kitchen-supplier-debts',
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
        <KitchenPrintBar kind="supplier_debts" compact />
      </View>
      <TouchableOpacity style={styles.addFab} onPress={() => router.push('/staff/kitchen-ops/suppliers/new' as never)}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.addFabText}>Borç Kaydı</Text>
      </TouchableOpacity>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        renderItem={({ item }) => {
          const remaining = Number(item.amount) - Number(item.paid_amount);
          const overdue = item.due_date && new Date(item.due_date) < new Date() && item.status !== 'paid';
          return (
            <View style={[styles.card, overdue && styles.overdue]}>
              <Text style={styles.name}>{item.supplier_name}</Text>
              <Text style={styles.amount}>{fmtKitchenMoney(remaining)} kalan</Text>
              <Text style={styles.meta}>
                {STATUS_LABELS[item.status]} {item.due_date ? `· Vade: ${formatDateShort(item.due_date)}` : ''}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Açık tedarikçi borcu yok.</Text>}
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
    backgroundColor: '#7c3aed',
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
  overdue: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  name: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  amount: { fontSize: 18, fontWeight: '800', color: '#7c3aed', marginTop: 4 },
  meta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  empty: { textAlign: 'center', color: theme.colors.textMuted, marginTop: 40 },
});
