import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { AdminOrganizationPicker } from '@/components/admin';

type NotifRow = {
  id: string;
  title: string;
  body: string | null;
  category: string | null;
  guest_id: string | null;
  staff_id: string | null;
  created_at: string;
};

export default function AdminNotificationsIndex() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const [list, setList] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const canUseAll = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
    const orgId = canUseAll ? selectedOrganizationId : staff?.organization_id;
    let query = supabase
      .from('notifications')
      .select('id, title, body, category, guest_id, staff_id, created_at, created_by')
      .order('created_at', { ascending: false })
      .limit(120);
    if (orgId && orgId !== 'all') {
      const { data: orgStaff } = await supabase.from('staff').select('id').eq('organization_id', orgId);
      const ids = (orgStaff ?? []).map((s: { id: string }) => s.id);
      if (ids.length === 0) {
        setList([]);
        setLoading(false);
        return;
      }
      query = query.in('created_by', ids);
    }
    const { data } = await query;
    setList(((data ?? []) as Array<NotifRow & { created_by?: string | null }>).map(({ created_by: _createdBy, ...rest }) => rest));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [selectedOrganizationId, staff?.app_permissions?.super_admin, staff?.organization_id]);

  useEffect(() => {
    if (!staff?.id) return;
    supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('staff_id', staff.id)
      .is('read_at', null)
      .then(() => {});
  }, [staff?.id]);

  const categoryLabel = (c: string | null) => {
    const m: Record<string, string> = {
      emergency: 'Acil',
      guest: 'Misafir',
      staff: 'Personel',
      admin: 'Admin',
      bulk: 'Toplu',
    };
    return c ? m[c] ?? c : '—';
  };

  const recipient = (r: NotifRow) => (r.guest_id ? 'Misafir' : 'Personel');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <Text style={styles.title}>Bildirim Sistemi</Text>
      <AdminOrganizationPicker
        canUseAll={staff?.app_permissions?.super_admin === true || staff?.role === 'admin'}
        ownOrganizationId={staff?.organization_id}
      />
      <Text style={styles.subtitle}>Toplu bildirim gönder, şablonları yönet, son bildirimlere bakın.</Text>

      <TouchableOpacity style={styles.card} onPress={() => router.push('/admin/notifications/bulk')}>
        <Text style={styles.cardTitle}>📢 Toplu Bildirim Gönder</Text>
        <Text style={styles.cardDesc}>Misafirlere veya personele toplu duyuru gönder</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.card} onPress={() => router.push('/admin/notifications/templates')}>
        <Text style={styles.cardTitle}>📋 Hazır Şablonlar</Text>
        <Text style={styles.cardDesc}>Bilgi, uyarı, kampanya şablonları</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.card} onPress={() => router.push('/admin/notifications/sounds')}>
        <Text style={styles.cardTitle}>🔊 Bildirim Sesleri</Text>
        <Text style={styles.cardDesc}>Özellik bazlı ses yükle; varsayılan sistem sesini kapatıp yalnızca özel ses kullan</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.card} onPress={() => router.push('/admin/notifications/event-log')}>
        <Text style={styles.cardTitle}>📊 Bildirim Log & Takip</Text>
        <Text style={styles.cardDesc}>Kim gördü, kim onayladı, hangi ses çaldı</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.card, styles.cardEmergency]}
        onPress={() => router.push('/admin/staff-emergency')}
      >
        <Text style={styles.cardTitle}>🚨 Personel Toplanma Alarmı</Text>
        <Text style={styles.cardDesc}>Toplanma alanı seçip tüm personele acil bildirim gönder</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.card, styles.cardEmergency]}
        onPress={() => router.push('/admin/notifications/emergency')}
      >
        <Text style={styles.cardTitle}>🚨 Misafir Acil Bildirimi</Text>
        <Text style={styles.cardDesc}>Tüm misafirlere zorunlu acil duyuru (tahliye, kesinti vb.)</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Son Bildirimler</Text>
      {list.length === 0 && !loading ? (
        <Text style={styles.empty}>Henüz bildirim yok.</Text>
      ) : (
        list.map((n) => (
          <View key={n.id} style={styles.row}>
            <View style={styles.rowHead}>
              <Text style={styles.rowTitle} numberOfLines={1}>{n.title}</Text>
              <Text style={styles.rowMeta}>{categoryLabel(n.category)} · {recipient(n)}</Text>
            </View>
            {n.body ? <Text style={styles.rowBody} numberOfLines={2}>{n.body}</Text> : null}
            <Text style={styles.rowTime}>{new Date(n.created_at).toLocaleString('tr-TR')}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a365d', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#718096', marginBottom: 20 },
  card: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardEmergency: { borderColor: '#fc8181', backgroundColor: '#fff5f5' },
  cardTitle: { fontSize: 17, fontWeight: '600', color: '#1a202c' },
  cardDesc: { fontSize: 13, color: '#718096', marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#2d3748', marginTop: 24, marginBottom: 12 },
  empty: { color: '#a0aec0', fontSize: 14 },
  row: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#edf2f7',
  },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#2d3748', flex: 1 },
  rowMeta: { fontSize: 12, color: '#718096', marginLeft: 8 },
  rowBody: { fontSize: 13, color: '#4a5568', marginTop: 4 },
  rowTime: { fontSize: 11, color: '#a0aec0', marginTop: 6 },
});
