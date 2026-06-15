import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { adminTheme } from '@/constants/adminTheme';
import { useAuthStore } from '@/stores/authStore';
import { listStaffDepartmentRules } from '@/lib/departmentRules';
import { DepartmentRuleListItem } from '@/components/departmentRules/DepartmentRuleListItem';

type Tab = 'all' | 'unread' | 'pending_ack' | 'archive';

export default function StaffDepartmentRulesScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listStaffDepartmentRules>>['data']>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('all');

  const load = useCallback(async () => {
    if (!staff?.id || !staff.organization_id) return;
    setLoading(true);
    const res = await listStaffDepartmentRules(staff.id, staff.organization_id, staff.department ?? null);
    setRows(res.data);
    setLoading(false);
  }, [staff?.id, staff?.organization_id, staff?.department]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = useMemo(() => {
    if (tab === 'unread') return rows.filter((r) => !r.readStatus || r.readStatus === 'unread');
    if (tab === 'pending_ack') return rows.filter((r) => r.requires_acknowledgement && r.readStatus !== 'acknowledged');
    if (tab === 'archive') return rows.filter((r) => r.status === 'archived' || r.status === 'expired');
    return rows.filter((r) => r.status === 'published');
  }, [rows, tab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: 'Benim kurallarım' },
    { key: 'unread', label: 'Okunmadı' },
    { key: 'pending_ack', label: 'Onay bekliyor' },
    { key: 'archive', label: 'Arşiv' },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bölüm Kuralları</Text>
      <Text style={styles.sub}>Departmanınıza atanmış kurallar ve talimatlar</Text>
      <View style={styles.tabs}>
        {tabs.map((t) => (
          <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adminTheme.colors.accent} />}
        ListEmptyComponent={<Text style={styles.empty}>{loading ? 'Yükleniyor…' : 'Görüntülenecek kural yok'}</Text>}
        renderItem={({ item }) => (
          <DepartmentRuleListItem
            item={item}
            showReadStatus
            onPress={() => router.push(`/staff/department-rules/${item.id}` as never)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  title: { fontSize: 20, fontWeight: '900', color: adminTheme.colors.text, paddingHorizontal: 20, paddingTop: 12 },
  sub: { fontSize: 13, color: adminTheme.colors.textMuted, paddingHorizontal: 20, marginTop: 4, marginBottom: 8 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: adminTheme.colors.border },
  tabActive: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  tabText: { fontSize: 12, color: adminTheme.colors.textMuted },
  tabTextActive: { color: '#fff', fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, marginTop: 32, fontSize: 14 },
});
