import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { CachedImage } from '@/components/CachedImage';
import { useAuthStore } from '@/stores/authStore';
import { sendNotification } from '@/lib/notificationService';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { AdminOrganizationPicker } from '@/components/admin';
import { useTranslation } from 'react-i18next';
import {
  complaintsText,
  complaintCategoryLabel,
  complaintStatusLabel,
  complaintTypeLabel,
  complaintsLocaleTag,
  formatGuestComplaintPushBody,
} from '@/lib/complaintsI18n';

type ComplaintRow = {
  id: string;
  topic_type: 'complaint' | 'suggestion' | 'thanks';
  category: string;
  description: string;
  phone: string | null;
  room_number: string | null;
  image_url: string | null;
  status:
    | 'pending'
    | 'reviewing'
    | 'taken_for_review'
    | 'solution_in_progress'
    | 'resolved'
    | 'rejected'
    | 'unresolved';
  admin_note: string | null;
  created_at: string;
  guest_id: string;
  guests: { id: string; full_name: string | null; photo_url: string | null } | null;
};

export default function AdminComplaintsIndex() {
  useTranslation();
  const loc = complaintsLocaleTag();
  const { staff } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const [list, setList] = useState<ComplaintRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | ComplaintRow['status']>('pending');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [noteById, setNoteById] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const canUseAll = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
    const orgId = canUseAll ? selectedOrganizationId : staff?.organization_id;
    let query = supabase
      .from('guest_complaints')
      .select('id, topic_type, category, description, phone, room_number, image_url, status, admin_note, created_at, guest_id, guests(id, full_name, photo_url)')
      .order('created_at', { ascending: false });
    if (orgId && orgId !== 'all') query = query.eq('organization_id', orgId);
    if (filter !== 'all') query = query.eq('status', filter);
    const { data, error } = await query;
    if (error) {
      Alert.alert(complaintsText('error'), error.message);
      return;
    }
    const rows = (data as ComplaintRow[]) ?? [];
    setList(rows);
    const initialNotes: Record<string, string> = {};
    rows.forEach((row) => {
      initialNotes[row.id] = row.admin_note ?? '';
    });
    setNoteById(initialNotes);
  }, [filter, selectedOrganizationId, staff?.app_permissions?.super_admin, staff?.organization_id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setLoading(true);
    await load();
    setLoading(false);
  }, [load]);

  const updateStatus = async (item: ComplaintRow, status: ComplaintRow['status']) => {
    if (!staff?.id) return;
    setUpdatingId(item.id);
    const note = (noteById[item.id] ?? '').trim();
    const { error } = await supabase
      .from('guest_complaints')
      .update({
        status,
        admin_note: note || null,
        reviewed_by_staff_id: staff.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', item.id);
    if (error) {
      setUpdatingId(null);
      Alert.alert(complaintsText('error'), error.message);
      return;
    }

    await sendNotification({
      guestId: item.guest_id,
      title: complaintsText('complaintUpdated'),
      body: formatGuestComplaintPushBody(status, note),
      category: 'guest',
      notificationType: 'guest_complaint_status',
      data: { complaintId: item.id, status },
      createdByStaffId: staff.id,
    }).catch(() => {});

    setUpdatingId(null);
    await load();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={adminTheme.colors.accent} />}
    >
      <AdminOrganizationPicker
        canUseAll={staff?.app_permissions?.super_admin === true || staff?.role === 'admin'}
        ownOrganizationId={staff?.organization_id}
      />
      <View style={styles.banner}>
        <Ionicons name="shield-checkmark-outline" size={20} color={adminTheme.colors.accent} />
        <Text style={styles.bannerText}>{complaintsText('adminBanner')}</Text>
      </View>

      <View style={styles.filterRow}>
        {(
          [
            'pending',
            'taken_for_review',
            'solution_in_progress',
            'resolved',
            'unresolved',
            'all',
          ] as const
        ).map((f) => (
          <TouchableOpacity key={f} style={[styles.filterChip, filter === f && styles.filterChipActive]} onPress={() => setFilter(f)}>
                <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f === 'all' ? complaintsText('all') : complaintStatusLabel(f)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && list.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={adminTheme.colors.accent} />
        </View>
      ) : list.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>{complaintsText('noRecords')}</Text>
        </View>
      ) : (
        list.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.header}>
              {item.guests?.photo_url ? (
                <CachedImage uri={item.guests.photo_url} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarLetter}>{(item.guests?.full_name ?? 'M').charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.guests?.full_name || complaintsText('guest')}</Text>
                <Text style={styles.meta}>
                  {complaintTypeLabel(item.topic_type)} · {complaintCategoryLabel(item.category)}
                </Text>
              </View>
              <View style={[styles.statusPill, styles[`status_${item.status}` as const]]}>
                <Text style={styles.statusText}>{complaintStatusLabel(item.status)}</Text>
              </View>
            </View>

            <Text style={styles.description}>{item.description}</Text>
            <Text style={styles.metaRow}>
              {item.phone ? `${complaintsText('tel')}: ${item.phone}` : `${complaintsText('tel')}: -`} · {item.room_number ? `${complaintsText('room')}: ${item.room_number}` : `${complaintsText('room')}: -`}
            </Text>
            <Text style={styles.date}>{new Date(item.created_at).toLocaleString(loc)}</Text>
            {item.image_url ? <CachedImage uri={item.image_url} style={styles.image} contentFit="cover" /> : null}

            <TextInput
              style={styles.noteInput}
              value={noteById[item.id] ?? ''}
              onChangeText={(v) => setNoteById((prev) => ({ ...prev, [item.id]: v }))}
              placeholder={complaintsText('adminNotePlaceholder')}
              placeholderTextColor={adminTheme.colors.textMuted}
            />

            <View style={styles.actions}>
              {(['taken_for_review', 'solution_in_progress', 'resolved', 'unresolved'] as const).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.actionBtn, item.status === s && styles.actionBtnActive]}
                  disabled={updatingId === item.id}
                  onPress={() => updateStatus(item, s)}
                >
                  <Text style={[styles.actionText, item.status === s && styles.actionTextActive]}>
                    {complaintStatusLabel(s)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 40 },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: adminTheme.colors.warningLight,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  bannerText: { flex: 1, color: adminTheme.colors.text, fontSize: 13, lineHeight: 19 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surface,
  },
  filterChipActive: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  filterChipText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  filterChipTextActive: { color: '#fff' },
  loadingWrap: { paddingVertical: 32, alignItems: 'center' },
  emptyWrap: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { color: adminTheme.colors.textMuted },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    padding: 12,
    marginBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: adminTheme.colors.borderLight },
  avatarPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminTheme.colors.surfaceTertiary,
  },
  avatarLetter: { fontWeight: '800', color: adminTheme.colors.textSecondary },
  name: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  meta: { fontSize: 12, color: adminTheme.colors.textSecondary, marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  status_pending: { borderColor: '#f59e0b', backgroundColor: '#fef3c7' },
  status_reviewing: { borderColor: '#3b82f6', backgroundColor: '#dbeafe' },
  status_taken_for_review: { borderColor: '#2563eb', backgroundColor: '#dbeafe' },
  status_solution_in_progress: { borderColor: '#7c3aed', backgroundColor: '#ede9fe' },
  status_resolved: { borderColor: '#10b981', backgroundColor: '#d1fae5' },
  status_rejected: { borderColor: '#6b7280', backgroundColor: '#f3f4f6' },
  status_unresolved: { borderColor: '#ef4444', backgroundColor: '#fee2e2' },
  statusText: { fontSize: 11, fontWeight: '700', color: adminTheme.colors.textSecondary },
  description: { marginTop: 10, fontSize: 14, lineHeight: 21, color: adminTheme.colors.text },
  metaRow: { marginTop: 8, fontSize: 12, color: adminTheme.colors.textSecondary },
  date: { marginTop: 4, fontSize: 11, color: adminTheme.colors.textMuted },
  image: { width: '100%', height: 170, borderRadius: 10, marginTop: 10 },
  noteInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: adminTheme.colors.text,
    fontSize: 13,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  actionBtnActive: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  actionText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textSecondary },
  actionTextActive: { color: '#fff' },
});
