import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import type { TechFaultReportRow } from '@/lib/technicalAssets';
import { hasTechnicalAssetsStaffAccess } from '@/lib/staffPermissions';
import { useAuthStore } from '@/stores/authStore';
import { useCachedList } from '@/hooks/useCachedList';

const TECH_FAULTS_CACHE_KEY = 'tech-fault-reports-all';

export default function TechnicalFaultsListScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [tab, setTab] = useState<'open' | 'all'>('open');

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('tech_fault_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return [];
    return (data ?? []) as TechFaultReportRow[];
  }, []);

  const { items: allRows, refreshing, refresh, showList } = useCachedList({
    cacheKey: TECH_FAULTS_CACHE_KEY,
    enabled: hasTechnicalAssetsStaffAccess(staff),
    fetchItems,
  });

  const rows = useMemo(
    () =>
      tab === 'open'
        ? allRows.filter((r) => r.status === 'open' || r.status === 'in_progress')
        : allRows,
    [allRows, tab]
  );

  useEffect(() => {
    if (!hasTechnicalAssetsStaffAccess(staff)) {
      router.replace('/staff/technical-assets');
    }
  }, [router, staff]);

  if (!hasTechnicalAssetsStaffAccess(staff)) return null;

  if (!showList && rows.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a365d" />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'open' && styles.tabOn]} onPress={() => setTab('open')}>
          <Text style={[styles.tabText, tab === 'open' && styles.tabTextOn]}>Açık</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'all' && styles.tabOn]} onPress={() => setTab('all')}>
          <Text style={[styles.tabText, tab === 'all' && styles.tabTextOn]}>Tümü</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/staff/technical-assets/faults/new')}>
        <Text style={styles.addBtnText}>+ Yeni arıza bildir</Text>
      </TouchableOpacity>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Kayıt yok.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => router.push(`/staff/technical-assets/faults/${item.id}`)}>
            {item.is_emergency ? (
              <View style={styles.emergency}>
                <Text style={styles.emergencyText}>ACİL</Text>
              </View>
            ) : null}
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.meta}>
              {item.status} · {new Date(item.created_at).toLocaleString('tr-TR')}
            </Text>
            {item.description ? (
              <Text style={styles.desc} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabs: { flexDirection: 'row', padding: 12, gap: 10 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#e2e8f0', alignItems: 'center' },
  tabOn: { backgroundColor: '#1a365d' },
  tabText: { fontWeight: '700', color: '#475569' },
  tabTextOn: { color: '#fff' },
  addBtn: { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#b45309', padding: 14, borderRadius: 12 },
  addBtnText: { color: '#fff', fontWeight: '800', textAlign: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  empty: { textAlign: 'center', color: '#64748b', padding: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emergency: { alignSelf: 'flex-start', backgroundColor: '#dc2626', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 8 },
  emergencyText: { color: '#fff', fontWeight: '900', fontSize: 11 },
  title: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  meta: { fontSize: 12, color: '#64748b', marginTop: 6 },
  desc: { fontSize: 13, color: '#475569', marginTop: 8 },
});