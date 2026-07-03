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

type Row = { id: string; payer_name: string | null; payee_name: string | null; amount: number; method: string; status: string; created_at: string };

export default function KitchenSettlementsListScreen() {
  const router = useRouter();

  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from('kitchen_settlements')
      .select('id, payer_name, payee_name, amount, method, status, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    return (data ?? []) as Row[];
  }, []);

  const { items: rows, loading, refreshing, refresh } = useCachedList<Row>({
    cacheKey: 'kitchen-settlements-list',
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
        <KitchenPrintBar kind="settlements" compact />
      </View>
      <TouchableOpacity style={styles.addFab} onPress={() => router.push('/staff/kitchen-ops/settlements/new' as never)}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.addFabText}>Ödeme / Mahsup</Text>
      </TouchableOpacity>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.amount}>{fmtKitchenMoney(Number(item.amount))}</Text>
            <Text style={styles.meta}>
              {item.payer_name ?? '?'} → {item.payee_name ?? '?'} · {item.method}
            </Text>
            <Text style={styles.date}>
              {formatDateShort(item.created_at)} · {item.status}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Kayıt yok.</Text>}
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
    backgroundColor: '#b45309',
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
  amount: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  meta: { fontSize: 13, color: theme.colors.text, marginTop: 4 },
  date: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  empty: { textAlign: 'center', color: theme.colors.textMuted, marginTop: 40 },
});
