import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchRecentOrgMaintenanceLogs } from '@/lib/technicalAssets';
import { hasTechnicalAssetsStaffAccess } from '@/lib/staffPermissions';
import { useAuthStore } from '@/stores/authStore';

type Row = Awaited<ReturnType<typeof fetchRecentOrgMaintenanceLogs>>[number];

export default function TechnicalRecentLogsScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRows(await fetchRecentOrgMaintenanceLogs(120));
  }, []);

  useEffect(() => {
    if (!hasTechnicalAssetsStaffAccess(staff)) {
      router.replace('/staff/technical-assets');
      return;
    }
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load, router, staff]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!hasTechnicalAssetsStaffAccess(staff)) return null;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a365d" />
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListEmptyComponent={<Text style={styles.empty}>Henüz müdahale kaydı yok.</Text>}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push(`/staff/technical-assets/${item.asset_id}`)}
          activeOpacity={0.85}
        >
          <Text style={styles.date}>{new Date(item.created_at).toLocaleString('tr-TR')}</Text>
          <Text style={styles.asset}>{item.asset_name ?? 'Varlık'} · {item.asset_code ?? ''}</Text>
          <Text style={styles.action}>{item.action_type}</Text>
          {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  list: { padding: 16, paddingBottom: 32 },
  empty: { textAlign: 'center', color: '#64748b', padding: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  date: { fontSize: 12, color: '#94a3b8' },
  asset: { fontSize: 14, fontWeight: '800', color: '#1a365d', marginTop: 4 },
  action: { fontSize: 15, color: '#0f172a', marginTop: 6, fontWeight: '700' },
  note: { fontSize: 13, color: '#475569', marginTop: 4 },
});
