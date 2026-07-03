import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { adminTheme } from '@/constants/adminTheme';
import { listManagedContracts } from '@/lib/managedContracts';
import { ManagedContractListItem } from '@/components/contracts/ManagedContractListItem';
import { useAuthStore } from '@/stores/authStore';
import { useCachedList } from '@/hooks/useCachedList';

export default function StaffManagedContractsScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const cacheKey = staff?.organization_id ? `managed-contracts:${staff.organization_id}` : 'managed-contracts:none';

  const fetchItems = useCallback(async () => {
    const res = await listManagedContracts({
      organizationId: staff?.organization_id ?? undefined,
      status: ['active', 'pending', 'expired'],
    });
    return res.data;
  }, [staff?.organization_id]);

  const { items: rows, loading, refreshing, refresh } = useCachedList({
    cacheKey,
    enabled: !!staff?.organization_id,
    fetchItems,
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sözleşmelerim</Text>
      <Text style={styles.sub}>Taraf olduğunuz veya yetki verilen sözleşmeler</Text>
      <FlatList
        data={rows}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={adminTheme.colors.accent} />}
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
