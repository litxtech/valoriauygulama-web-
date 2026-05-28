import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { formatDateShort } from '@/lib/date';
import { fetchKitchenHandovers, type KitchenHandoverListRow } from '@/lib/kitchenOps/handover';
import { KitchenPrintBar } from '@/components/kitchenOps/KitchenPrintBar';

export default function KitchenHandoversListScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<KitchenHandoverListRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await fetchKitchenHandovers();
    setRows(data);
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
        <KitchenPrintBar kind="handover_list" compact />
      </View>
      <TouchableOpacity style={styles.addFab} onPress={() => router.push('/staff/kitchen-ops/handovers/new' as never)}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.addFabText}>Teslim Kaydı</Text>
      </TouchableOpacity>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => router.push(`/staff/kitchen-ops/handovers/${item.id}` as never)}
          >
            <View style={styles.cardTop}>
              <Text style={styles.date}>{formatDateShort(item.handover_date)}</Text>
              <Text style={styles.count}>{item.item_count ?? 0} malzeme</Text>
            </View>
            <Text style={styles.flow}>
              {item.handed_by_name} → {item.received_by_name}
            </Text>
            {item.notes ? <Text style={styles.note} numberOfLines={2}>{item.notes}</Text> : null}
            <View style={styles.cardFoot}>
              <Ionicons name="images-outline" size={14} color={theme.colors.textMuted} />
              <Text style={styles.footText}>Detay ve fotoğraflar</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Henüz teslim kaydı yok.</Text>}
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
    marginTop: 8,
    backgroundColor: '#0d9488',
    borderRadius: 14,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  addFabText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 13, fontWeight: '700', color: '#0f766e' },
  count: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted },
  flow: { fontSize: 16, fontWeight: '800', color: theme.colors.text, marginTop: 8 },
  note: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 6 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  footText: { flex: 1, fontSize: 12, color: theme.colors.textMuted },
  empty: { textAlign: 'center', color: theme.colors.textMuted, marginTop: 40 },
});
