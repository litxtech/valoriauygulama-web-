import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { AdminOrganizationPicker } from '@/components/admin';
import { sendNotification } from '@/lib/notificationService';

type Row = {
  id: string;
  note: string;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  admin_action_note: string | null;
  created_at: string;
  complainant_staff_id: string;
  complained_staff_id: string;
  complainant?: { full_name: string | null } | null;
  complained?: { full_name: string | null } | null;
};

type TopicFilter = 'all' | 'suggestion' | 'problem' | 'daily' | 'memory' | 'unknown';

const STATUS_LABEL: Record<Row['status'], string> = {
  open: 'Açık',
  reviewing: 'İnceleniyor',
  resolved: 'Çözüldü',
  dismissed: 'Kapatıldı',
};

const TOPIC_LABEL: Record<TopicFilter, string> = {
  all: 'Tümü',
  suggestion: 'Öneri',
  problem: 'Sorun',
  daily: 'Günlük',
  memory: 'Hatıra',
  unknown: 'Diğer',
};

function inferTopicFromNote(note: string): TopicFilter {
  const line = (note.split('\n')[0] ?? '').toLowerCase();
  if (line.includes('öneri')) return 'suggestion';
  if (line.includes('sorun')) return 'problem';
  if (line.includes('günlük')) return 'daily';
  if (line.includes('hatıra')) return 'memory';
  return 'unknown';
}

export default function AdminStaffComplaintsScreen() {
  const { staff } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<'all' | Row['status']>('all');
  const [topicFilter, setTopicFilter] = useState<TopicFilter>('all');

  const load = useCallback(async () => {
    const canUseAll = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
    const orgId = canUseAll ? selectedOrganizationId : staff?.organization_id;
    let query = supabase
      .from('staff_internal_complaints')
      .select(
        'id, note, status, admin_action_note, created_at, complainant_staff_id, complained_staff_id, complainant:complainant_staff_id(full_name), complained:complained_staff_id(full_name)'
      )
      .order('created_at', { ascending: false });
    if (orgId && orgId !== 'all') query = query.eq('organization_id', orgId);
    const { data, error } = await query;
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    const list = (data ?? []) as Row[];
    setRows(list);
    const n: Record<string, string> = {};
    list.forEach((r) => {
      n[r.id] = r.admin_action_note ?? '';
    });
    setNotes(n);
  }, [selectedOrganizationId, staff?.app_permissions?.super_admin, staff?.organization_id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const updateStatus = async (row: Row, status: Row['status']) => {
    if (!staff?.id) return;
    setSavingId(row.id);
    const { error } = await supabase
      .from('staff_internal_complaints')
      .update({
        status,
        admin_action_note: (notes[row.id] ?? '').trim() || null,
        handled_by_staff_id: staff.id,
        handled_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    setSavingId(null);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    const statusLabel = STATUS_LABEL[status];
    await sendNotification({
      staffId: row.complainant_staff_id,
      title: 'Yönetici notunuzu inceledi',
      body: `Durum: ${statusLabel}${(notes[row.id] ?? '').trim() ? ` • Not: ${(notes[row.id] ?? '').trim()}` : ''}`,
      notificationType: 'staff_internal_note_status',
      category: 'staff',
      data: {
        screen: '/staff/(tabs)/notifications',
        complaintId: row.id,
        status,
      },
      createdByStaffId: staff.id,
    });
    await load();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={async () => { setLoading(true); await load(); setLoading(false); }} />}
    >
      <AdminOrganizationPicker
        canUseAll={staff?.app_permissions?.super_admin === true || staff?.role === 'admin'}
        ownOrganizationId={staff?.organization_id}
      />
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Personel Not / Öneri / Sorun Kayıtları</Text>
        <Text style={styles.bannerSub}>
          Bu ekran yalnızca otel sorumlusu içindir. Durum güncellendiğinde ilgili personele otomatik bildirim gider.
        </Text>
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={adminTheme.colors.accent} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>Kayıt bulunamadı.</Text>
        </View>
      ) : (
        <>
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Durum</Text>
            <View style={styles.filterChips}>
              {(['all', 'open', 'reviewing', 'resolved', 'dismissed'] as const).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
                  onPress={() => setStatusFilter(s)}
                >
                  <Text style={[styles.filterChipText, statusFilter === s && styles.filterChipTextActive]}>
                    {s === 'all' ? 'Tümü' : STATUS_LABEL[s]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.filterLabel, { marginTop: 8 }]}>Konu</Text>
            <View style={styles.filterChips}>
              {(['all', 'suggestion', 'problem', 'daily', 'memory', 'unknown'] as const).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.filterChip, topicFilter === s && styles.filterChipActive]}
                  onPress={() => setTopicFilter(s)}
                >
                  <Text style={[styles.filterChipText, topicFilter === s && styles.filterChipTextActive]}>
                    {TOPIC_LABEL[s]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {rows
            .filter((r) => statusFilter === 'all' || r.status === statusFilter)
            .filter((r) => topicFilter === 'all' || inferTopicFromNote(r.note) === topicFilter)
            .map((r) => (
          <View key={r.id} style={styles.card}>
            <Text style={styles.title}>
              Şikayet Eden: {r.complainant?.full_name || r.complainant_staff_id}
            </Text>
            <Text style={styles.title}>
              Şikayet Edilen: {r.complained?.full_name || r.complained_staff_id}
            </Text>
            <Text style={styles.meta}>{new Date(r.created_at).toLocaleString('tr-TR')} · {STATUS_LABEL[r.status]}</Text>
            <Text style={styles.note}>{r.note}</Text>

            <TextInput
              style={styles.input}
              value={notes[r.id] ?? ''}
              onChangeText={(v) => setNotes((p) => ({ ...p, [r.id]: v }))}
              placeholder="Sadece yönetici notu"
              placeholderTextColor={adminTheme.colors.textMuted}
              multiline
            />

            <View style={styles.actions}>
              {(['reviewing', 'resolved', 'dismissed'] as const).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.btn, r.status === s && styles.btnActive]}
                  disabled={savingId === r.id}
                  onPress={() => updateStatus(r, s)}
                >
                  <Text style={[styles.btnText, r.status === s && styles.btnTextActive]}>{STATUS_LABEL[s]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
            ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 36 },
  center: { paddingVertical: 30, alignItems: 'center' },
  empty: { color: adminTheme.colors.textMuted },
  banner: {
    backgroundColor: '#fff7ed',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fdba74',
    padding: 12,
    marginBottom: 12,
  },
  bannerTitle: { fontSize: 15, fontWeight: '800', color: '#9a3412' },
  bannerSub: { marginTop: 4, fontSize: 12, lineHeight: 18, color: '#7c2d12' },
  filterSection: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  filterLabel: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textSecondary, marginBottom: 6 },
  filterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f8fafc',
  },
  filterChipActive: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textSecondary },
  filterChipTextActive: { color: '#fff' },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  title: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text },
  meta: { marginTop: 4, fontSize: 11, color: adminTheme.colors.textMuted },
  note: { marginTop: 8, fontSize: 13, lineHeight: 20, color: adminTheme.colors.text },
  input: {
    marginTop: 10,
    minHeight: 70,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlignVertical: 'top',
    color: adminTheme.colors.text,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  actions: { marginTop: 10, flexDirection: 'row', gap: 8 },
  btn: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
  },
  btnActive: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  btnText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textSecondary },
  btnTextActive: { color: '#fff' },
});

