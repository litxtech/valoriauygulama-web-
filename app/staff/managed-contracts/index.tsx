import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { adminTheme } from '@/constants/adminTheme';
import { listManagedContracts } from '@/lib/managedContracts';
import { ManagedContractListItem } from '@/components/contracts/ManagedContractListItem';
import { useAuthStore } from '@/stores/authStore';

export default function StaffManagedContractsScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listManagedContracts>>['data']>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listManagedContracts({
      organizationId: staff?.organization_id ?? undefined,
      status: ['active', 'pending', 'expired'],
    });
    setRows(res.data);
    setLoading(false);
  }, [staff?.organization_id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sözleşmelerim</Text>
      <Text style={styles.sub}>Taraf olduğunuz veya yetki verilen sözleşmeler</Text>
      <FlatList
        data={rows}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adminTheme.colors.accent} />}
        ListEmptyComponent={<Text style={styles.empty}>{loading ? 'Yükleniyor…' : 'Görüntülenecek sözleşme yok'}</Text>}
        renderItem={({ item }) => (
          <ManagedContractListItem item={item} onPress={() => router.push(`/staff/managed-contracts/${item.id}` as never)} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  title: { fontSize: 20, fontWeight: '900', color: adminTheme.colors.text, paddingHorizontal: 20, paddingTop: 12 },
  sub: { fontSize: 13, color: adminTheme.colors.textMuted, paddingHorizontal: 20, marginTop: 4, marginBottom: 8 },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, marginTop: 32, fontSize: 14 },
});
