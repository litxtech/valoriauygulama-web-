import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { canAccessTechnicalAssetsAdminRoutes } from '@/lib/staffPermissions';
import { fetchTechAssetDetail, type TechFaultReportRow } from '@/lib/technicalAssets';
import { notifyTechFaultStatusChanged } from '@/lib/technicalAssetNotifications';

export default function AdminTechnicalFaultsScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const ok = canAccessTechnicalAssetsAdminRoutes(staff);
  const [rows, setRows] = useState<TechFaultReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('tech_fault_reports').select('*').order('created_at', { ascending: false }).limit(300);
    if (!error && data) setRows(data as TechFaultReportRow[]);
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

  const resolveQuick = (row: TechFaultReportRow) => {
    Alert.alert('Çözüldü işaretle', row.title, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Çözüldü',
        onPress: async () => {
          const { error } = await supabase
            .from('tech_fault_reports')
            .update({
              status: 'resolved',
              resolved_at: new Date().toISOString(),
              resolved_by_staff_id: staff?.id ?? null,
            })
            .eq('id', row.id);
          if (error) Alert.alert('Hata', error.message);
          else {
            if (staff?.id) {
              let assetDetail = null;
              if (row.asset_id) {
                const { data: a } = await fetchTechAssetDetail(row.asset_id);
                assetDetail = a;
              }
              void notifyTechFaultStatusChanged({
                organizationId: row.organization_id,
                faultId: row.id,
                title: row.title,
                status: 'resolved',
                asset: assetDetail,
                updatedByStaffId: staff.id,
              });
            }
            await load();
          }
        },
      },
    ]);
  };

  if (!ok) return null;

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
      ListEmptyComponent={<Text style={styles.empty}>Arıza kaydı yok.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          {item.is_emergency ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>ACİL</Text>
            </View>
          ) : null}
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.meta}>
            {item.status} · {new Date(item.created_at).toLocaleString('tr-TR')}
          </Text>
          {item.description ? (
            <Text style={styles.desc} numberOfLines={3}>
              {item.description}
            </Text>
          ) : null}
          <View style={styles.actions}>
            {item.asset_id ? (
              <TouchableOpacity onPress={() => router.push(`/admin/technical-assets/assets/${item.asset_id}`)}>
                <Text style={styles.link}>Varlık →</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.muted}>Varlık bağlantısı yok</Text>
            )}
            {item.status !== 'resolved' && item.status !== 'cancelled' ? (
              <TouchableOpacity onPress={() => resolveQuick(item)}>
                <Text style={styles.resolve}>Çözüldü</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f7fafc' },
  list: { padding: 16, paddingBottom: 32 },
  empty: { textAlign: 'center', color: '#718096', padding: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  badge: { alignSelf: 'flex-start', backgroundColor: '#dc2626', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 8 },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 11 },
  title: { fontSize: 16, fontWeight: '800', color: '#1a202c' },
  meta: { fontSize: 12, color: '#718096', marginTop: 6 },
  desc: { fontSize: 14, color: '#4a5568', marginTop: 8, lineHeight: 20 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  link: { color: '#1d4ed8', fontWeight: '800' },
  muted: { fontSize: 12, color: '#a0aec0' },
  resolve: { color: '#047857', fontWeight: '800' },
});
