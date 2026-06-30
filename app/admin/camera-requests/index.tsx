import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BreakfastPartnerAdminGate } from '@/components/breakfastPartner/BreakfastPartnerAdminGate';
import { PartnerCameraRequestStatusChip } from '@/components/breakfastPartner/PartnerCameraRequestStatusChip';
import { useBreakfastPartnerProviderOrgId } from '@/hooks/useBreakfastPartnerProviderOrgId';
import {
  adminListCameraRequests,
  countPendingCameraRequestsForAdmin,
  formatCameraRequestCreatedMeta,
  formatCameraRequestListMeta,
  type CameraRequestRow,
} from '@/lib/breakfastPartnerCameraRequests';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';

export default function AdminCameraRequestsScreen() {
  return (
    <BreakfastPartnerAdminGate>
      <AdminCameraRequestsList />
    </BreakfastPartnerAdminGate>
  );
}

function AdminCameraRequestsList() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orgId, loading: orgLoading } = useBreakfastPartnerProviderOrgId();
  const [rows, setRows] = useState<CameraRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) {
      setRows([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      setRows(await adminListCameraRequests(orgId));
    } catch {
      setRows([]);
    }
    setLoading(false);
    setRefreshing(false);
  }, [orgId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const pending = countPendingCameraRequestsForAdmin(rows);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color="#e2e8f0" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Kahvaltı kamera kayıt talepleri</Text>
          <Text style={styles.sub}>
            {pending > 0 ? `${pending} bekleyen talep` : 'Partner otellerinden gelen kamera kaydı talepleri'}
          </Text>
        </View>
      </View>

      {orgLoading || (loading && rows.length === 0) ? (
        <ActivityIndicator color={partnerTheme.accent} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={partnerTheme.accent} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>Henüz kamera talebi yok.</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push(`/admin/camera-requests/${item.id}`)}
            >
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.hotel}>{item.hotelName ?? 'Partner otel'}</Text>
                <Text style={styles.date}>{formatCameraRequestListMeta(item)}</Text>
                <PartnerCameraRequestStatusChip status={item.status} />
                <Text style={styles.meta}>{formatCameraRequestCreatedMeta(item.createdAt)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748b" />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0c1222' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  title: { color: '#f8fafc', fontSize: 22, fontWeight: '800' },
  sub: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#111827',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
    marginBottom: 10,
  },
  hotel: { color: '#f1f5f9', fontWeight: '800', fontSize: 15 },
  date: { color: '#cbd5e1', fontSize: 14 },
  meta: { color: '#64748b', fontSize: 12 },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 40 },
});
