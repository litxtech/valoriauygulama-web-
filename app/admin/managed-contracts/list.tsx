import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { adminTheme } from '@/constants/adminTheme';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { resolveStaffOrganizationScope } from '@/lib/organizationScope';
import { listManagedContracts } from '@/lib/managedContracts';
import type { ManagedContractStatus } from '@/lib/managedContracts/constants';
import { ManagedContractListItem } from '@/components/contracts/ManagedContractListItem';

const FILTER_MAP: Record<string, ManagedContractStatus | undefined> = {
  draft: 'draft',
  pending: 'pending',
  active: 'active',
  expired: 'expired',
  terminated: 'terminated',
  archived: 'archived',
};

const FILTER_TITLES: Record<string, string> = {
  all: 'Tüm sözleşmeler',
  draft: 'Taslaklar',
  pending: 'Onay bekleyenler',
  active: 'Aktif sözleşmeler',
  expired: 'Süresi dolanlar',
  terminated: 'Feshedilenler',
  archived: 'Arşiv',
};

export default function ManagedContractsListScreen() {
  const router = useRouter();
  const { filter = 'all' } = useLocalSearchParams<{ filter?: string }>();
  const { staff } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const canUseAllOrganizations = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
  const orgScoped = resolveStaffOrganizationScope({
    canUseAll: canUseAllOrganizations,
    selectedOrganizationId,
    ownOrganizationId: staff?.organization_id,
  });

  const [rows, setRows] = useState<Awaited<ReturnType<typeof listManagedContracts>>['data']>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const statusFilter = FILTER_MAP[String(filter)];

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listManagedContracts({
      organizationId: orgScoped,
      status: statusFilter,
      search: search.trim() || undefined,
    });
    setRows(res.data);
    setLoading(false);
  }, [orgScoped, statusFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const title = FILTER_TITLES[String(filter)] ?? 'Sözleşmeler';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <TextInput
        style={styles.search}
        placeholder="Başlık veya sözleşme no ara…"
        placeholderTextColor={adminTheme.colors.textMuted}
        value={search}
        onChangeText={setSearch}
        onSubmitEditing={load}
        returnKeyType="search"
      />
      <FlatList
        data={rows}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adminTheme.colors.accent} />}
        ListEmptyComponent={<Text style={styles.empty}>{loading ? 'Yükleniyor…' : 'Kayıt yok'}</Text>}
        renderItem={({ item }) => (
          <ManagedContractListItem item={item} onPress={() => router.push(`/admin/managed-contracts/${item.id}` as never)} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  title: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text, paddingHorizontal: 20, paddingTop: 8 },
  search: {
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 8,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: adminTheme.colors.text,
  },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, marginTop: 24, fontSize: 14 },
});
