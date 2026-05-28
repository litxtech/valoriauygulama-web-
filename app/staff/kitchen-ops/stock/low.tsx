import { useCallback, useEffect, useState } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, ActivityIndicator, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import { KitchenStockItemCard } from '@/components/kitchenOps/KitchenStockItemCard';
import { KitchenPrintBar } from '@/components/kitchenOps/KitchenPrintBar';
import { fetchKitchenItems } from '@/lib/kitchenOps/api';
import { KITCHEN_LOW_STOCK_THRESHOLD } from '@/lib/kitchenOps/constants';
import type { KitchenStockItem } from '@/lib/kitchenOps/types';

export default function KitchenLowStockScreen() {
  const router = useRouter();
  const [items, setItems] = useState<KitchenStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await fetchKitchenItems({ lowOnly: true });
    setItems(data);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={items}
      keyExtractor={(i) => i.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={<KitchenPrintBar kind="stock_low" compact />}
      renderItem={({ item }) => (
        <KitchenStockItemCard
          item={item}
          showQuickExit
          onQuickExit={() => router.push('/staff/kitchen-ops/stock/entry' as never)}
          onPress={() => router.push(`/staff/kitchen-ops/stock/product/${item.id}` as never)}
        />
      )}
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Kritik stok yok</Text>
          <Text style={styles.emptySub}>{`Tüm ürünler ${KITCHEN_LOW_STOCK_THRESHOLD} adetin üzerinde.`}</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 32, flexGrow: 1 },
  emptyWrap: { alignItems: 'center', marginTop: 60, padding: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.success },
  emptySub: { fontSize: 14, color: theme.colors.textMuted, marginTop: 8 },
});
