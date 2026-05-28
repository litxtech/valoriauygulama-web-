import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import { KitchenStockItemCard } from '@/components/kitchenOps/KitchenStockItemCard';
import { KitchenPrintBar } from '@/components/kitchenOps/KitchenPrintBar';
import { fetchKitchenItems } from '@/lib/kitchenOps/api';
import type { KitchenStockItem } from '@/lib/kitchenOps/types';

export default function KitchenCurrentStockScreen() {
  const router = useRouter();
  const [items, setItems] = useState<KitchenStockItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await fetchKitchenItems();
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

  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

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
        <KitchenPrintBar kind="stock_all" compact />
      </View>
      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Ürün ara..."
        placeholderTextColor={theme.colors.textMuted}
        autoCorrect={false}
      />
      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <KitchenStockItemCard
            item={item}
            onPress={() => router.push(`/staff/kitchen-ops/stock/product/${item.id}` as never)}
          />
        )}
        ListEmptyComponent={<Text style={styles.empty}>Henüz stok kaydı yok.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  printWrap: { paddingHorizontal: 16, paddingTop: 12 },
  search: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  list: { padding: 16, paddingBottom: 32 },
  empty: { textAlign: 'center', color: theme.colors.textMuted, marginTop: 40, fontSize: 15 },
});
