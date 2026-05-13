import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { canAccessTechnicalAssetsAdminRoutes } from '@/lib/staffPermissions';

type Row = { id: string; name: string; asset_code: string; criticality: string; status: string };

export default function AdminTechnicalAssetsListScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const ok = canAccessTechnicalAssetsAdminRoutes(staff);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('tech_assets').select('id, name, asset_code, criticality, status').order('name');
    if (!error && data) setRows(data as Row[]);
    else setRows([]);
  }, []);

  useEffect(() => {
    if (!ok) {
      router.replace('/admin');
      return;
    }
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load, ok, router]);

  if (!ok) return null;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a365d" />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/admin/technical-assets/assets/new')}>
        <Text style={styles.addBtnText}>+ Yeni teknik varlık</Text>
      </TouchableOpacity>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>Henüz varlık yok. Önce bina/lokasyon tanımlayıp buradan ekleyin.</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => router.push(`/admin/technical-assets/assets/${item.id}`)}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardCode}>{item.asset_code}</Text>
            <Text style={styles.cardMeta}>
              {item.criticality} · {item.status}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f7fafc' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  addBtn: {
    margin: 16,
    backgroundColor: '#b8860b',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#1a202c' },
  cardCode: { fontSize: 13, color: '#718096', marginTop: 4, fontFamily: 'monospace' },
  cardMeta: { fontSize: 12, color: '#a0aec0', marginTop: 6, textTransform: 'capitalize' },
  empty: { textAlign: 'center', color: '#718096', padding: 24 },
});
