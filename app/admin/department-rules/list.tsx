import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, RefreshControl, TouchableOpacity, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { resolveStaffOrganizationScope } from '@/lib/organizationScope';
import { listDepartmentRules } from '@/lib/departmentRules';
import { DEPARTMENT_RULE_DEPARTMENTS, type DepartmentRuleStatus } from '@/lib/departmentRules/constants';
import { DepartmentRuleListItem } from '@/components/departmentRules/DepartmentRuleListItem';
import { canCreateDepartmentRules } from '@/lib/staffPermissions';

export default function DepartmentRulesListScreen() {
  const router = useRouter();
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  const { staff } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const canUseAllOrganizations = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
  const orgScoped = resolveStaffOrganizationScope({
    canUseAll: canUseAllOrganizations,
    selectedOrganizationId,
    ownOrganizationId: staff?.organization_id,
  });

  const [rows, setRows] = useState<Awaited<ReturnType<typeof listDepartmentRules>>['data']>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const statusFilter = useMemo((): DepartmentRuleStatus | undefined => {
    if (!filter || filter === 'all') return undefined;
    return filter as DepartmentRuleStatus;
  }, [filter]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listDepartmentRules({
      organizationId: orgScoped,
      status: statusFilter,
      department: deptFilter || undefined,
      ruleType: typeFilter || undefined,
      search: search.trim() || undefined,
      limit: 200,
    });
    setRows(res.data);
    setLoading(false);
  }, [orgScoped, statusFilter, deptFilter, typeFilter, search]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={styles.container}>
      <AdminOrganizationPicker canUseAll={canUseAllOrganizations} ownOrganizationId={staff?.organization_id} />
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color={adminTheme.colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Başlık, içerik veya belge no ara…"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={load}
          returnKeyType="search"
        />
      </View>
      <View style={styles.filters}>
        <FlatList
          horizontal
          data={[{ value: '', label: 'Tüm dept.' }, ...DEPARTMENT_RULE_DEPARTMENTS]}
          keyExtractor={(i) => i.value}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.chip, deptFilter === item.value && styles.chipActive]}
              onPress={() => { setDeptFilter(item.value); }}
            >
              <Text style={[styles.chipText, deptFilter === item.value && styles.chipTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adminTheme.colors.accent} />}
        ListEmptyComponent={<Text style={styles.empty}>{loading ? 'Yükleniyor…' : 'Kayıt bulunamadı'}</Text>}
        renderItem={({ item }) => (
          <DepartmentRuleListItem item={item} onPress={() => router.push(`/admin/department-rules/${item.id}` as never)} />
        )}
      />
      {canCreateDepartmentRules(staff) ? (
        <TouchableOpacity style={styles.fab} onPress={() => router.push('/admin/department-rules/new' as never)}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: adminTheme.colors.text },
  filters: { marginTop: 8, marginBottom: 4, paddingLeft: 16, maxHeight: 40 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#fff', marginRight: 8, borderWidth: 1, borderColor: adminTheme.colors.border },
  chipActive: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  chipText: { fontSize: 12, color: adminTheme.colors.textMuted },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 80 },
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, marginTop: 40 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
});
