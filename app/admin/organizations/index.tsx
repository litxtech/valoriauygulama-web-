import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  is_active: boolean;
  currency_code: string;
};

export default function AdminOrganizationsIndexScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<OrganizationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('organizations')
      .select('id,name,slug,city,is_active,currency_code')
      .order('name');
    setRows((data ?? []) as OrganizationRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/admin/organizations/new')}>
        <Ionicons name="add-circle-outline" size={20} color="#fff" />
        <Text style={styles.addBtnText}>Yeni Otel Ekle</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator size="large" color={adminTheme.colors.accent} style={{ marginTop: 24 }} />
      ) : (
        <View style={{ gap: 10 }}>
          {rows.map((o) => (
            <AdminCard key={o.id}>
              <View style={styles.rowHeader}>
                <Text style={styles.name}>{o.name}</Text>
                <Text style={[styles.badge, o.is_active ? styles.badgeOn : styles.badgeOff]}>
                  {o.is_active ? 'Aktif' : 'Pasif'}
                </Text>
              </View>
              <Text style={styles.meta}>Kod: {o.slug}</Text>
              <Text style={styles.meta}>Sehir: {o.city ?? '—'} • Para birimi: {o.currency_code}</Text>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => router.push({ pathname: '/admin/organizations/[id]', params: { id: o.id } })}
              >
                <Ionicons name="create-outline" size={16} color={adminTheme.colors.accent} />
                <Text style={styles.editBtnText}>Duzenle</Text>
              </TouchableOpacity>
            </AdminCard>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 32 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: adminTheme.colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 14,
  },
  addBtnText: { color: '#fff', fontWeight: '700' },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text, flex: 1, paddingRight: 8 },
  badge: { fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  badgeOn: { color: '#14532d', backgroundColor: '#dcfce7' },
  badgeOff: { color: '#7f1d1d', backgroundColor: '#fee2e2' },
  meta: { fontSize: 13, color: adminTheme.colors.textMuted, marginTop: 4 },
  editBtn: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  editBtnText: { color: adminTheme.colors.accent, fontWeight: '600' },
});

