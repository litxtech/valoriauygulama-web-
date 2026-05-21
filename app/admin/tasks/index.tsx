import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminButton, AdminCard } from '@/components/admin';
import { AdminOrganizationPicker } from '@/components/admin';
import {
  ASSIGNMENT_TASK_LABELS,
  ASSIGNMENT_PRIORITY_LABELS,
  ASSIGNMENT_STATUS_LABELS,
  STAFF_ROLE_LABELS,
} from '@/lib/staffAssignments';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';

type AssignmentRow = {
  id: string;
  title: string;
  body: string | null;
  task_type: string;
  priority: string;
  status: string;
  assigned_staff_id: string;
  created_by_staff_id: string | null;
  room_ids: string[] | null;
  due_at: string | null;
  created_at: string;
  attachment_urls?: string[] | null;
  completion_proof_urls?: string[] | null;
  completion_note?: string | null;
};

type StaffMini = { id: string; full_name: string | null; role: string | null; department: string | null };

type FilterKey = 'all' | 'open' | 'done';

export default function AdminTasksIndexScreen() {
  const router = useRouter();
  const authStaff = useAuthStore((s) => s.staff);
  const { selectedOrganizationId } = useAdminOrgStore();
  const isAdmin = authStaff?.role === 'admin';
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, StaffMini>>({});
  const [roomMap, setRoomMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('open');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const canUseAll = authStaff?.app_permissions?.super_admin === true || authStaff?.role === 'admin';
    const orgId = canUseAll ? selectedOrganizationId : authStaff?.organization_id;
    let baseQuery = supabase
      .from('staff_assignments')
      .select(
        'id, title, body, task_type, priority, status, assigned_staff_id, created_by_staff_id, room_ids, due_at, created_at, attachment_urls, completion_proof_urls, completion_note'
      )
      .order('created_at', { ascending: false })
      .limit(120);
    if (orgId && orgId !== 'all') baseQuery = baseQuery.eq('organization_id', orgId);
    const { data: list, error } = await baseQuery;
    if (error) {
      const msg = error.message ?? '';
      if (msg.includes('attachment_urls') || error.code === 'PGRST204') {
        let legacyQuery = supabase
          .from('staff_assignments')
          .select(
            'id, title, body, task_type, priority, status, assigned_staff_id, created_by_staff_id, room_ids, due_at, created_at'
          )
          .order('created_at', { ascending: false })
          .limit(120);
        if (orgId && orgId !== 'all') legacyQuery = legacyQuery.eq('organization_id', orgId);
        const { data: list2, error: e2 } = await legacyQuery;
        if (e2) {
          setRows([]);
          setStaffMap({});
          setRoomMap({});
          setLoading(false);
          setRefreshing(false);
          return;
        }
        const assignments = (list2 ?? []) as AssignmentRow[];
        setRows(assignments);
        await hydrateMaps(assignments);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      setRows([]);
      setStaffMap({});
      setRoomMap({});
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const assignments = (list ?? []) as AssignmentRow[];
    setRows(assignments);
    await hydrateMaps(assignments, orgId);
    setLoading(false);
    setRefreshing(false);
  }, [authStaff?.app_permissions?.super_admin, authStaff?.organization_id, selectedOrganizationId]);

  async function hydrateMaps(assignments: AssignmentRow[], organizationId?: string | 'all') {
    const staffIds = [
      ...new Set([
        ...assignments.map((a) => a.assigned_staff_id),
        ...assignments.map((a) => a.created_by_staff_id).filter(Boolean),
      ]),
    ] as string[];
    if (staffIds.length) {
      let staffQuery = supabase.from('staff').select('id, full_name, role, department').in('id', staffIds);
      if (organizationId && organizationId !== 'all') staffQuery = staffQuery.eq('organization_id', organizationId);
      const { data: sm } = await staffQuery;
      setStaffMap(Object.fromEntries((sm ?? []).map((s: StaffMini) => [s.id, s])));
    } else setStaffMap({});

    const roomIds = [...new Set(assignments.flatMap((a) => a.room_ids ?? []))];
    if (roomIds.length) {
      let roomQuery = supabase.from('rooms').select('id, room_number').in('id', roomIds);
      if (organizationId && organizationId !== 'all') roomQuery = roomQuery.eq('organization_id', organizationId);
      const { data: rm } = await roomQuery;
      setRoomMap(Object.fromEntries((rm ?? []).map((r: { id: string; room_number: string }) => [r.id, r.room_number])));
    } else setRoomMap({});
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const cancelAssignment = (id: string) => {
    Alert.alert('Görevi iptal et', 'Bu görev iptal edilecek. Emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'İptal et',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('staff_assignments').update({ status: 'cancelled' }).eq('id', id);
          if (error) Alert.alert('Hata', error.message);
          else load();
        },
      },
    ]);
  };

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('tr-TR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const stats = useMemo(() => {
    const open = rows.filter((r) => r.status === 'pending' || r.status === 'in_progress').length;
    const done = rows.filter((r) => r.status === 'completed').length;
    const urgent = rows.filter((r) => (r.priority === 'urgent' || r.priority === 'high') && r.status !== 'completed' && r.status !== 'cancelled').length;
    return { open, done, urgent, total: rows.length };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (filter === 'open') {
      list = list.filter((r) => r.status === 'pending' || r.status === 'in_progress');
    } else if (filter === 'done') {
      list = list.filter((r) => r.status === 'completed' || r.status === 'cancelled');
    }
    if (!q) return list;
    return list.filter((r) => {
      const assignee = staffMap[r.assigned_staff_id]?.full_name ?? '';
      const creator = r.created_by_staff_id ? staffMap[r.created_by_staff_id]?.full_name ?? '' : '';
      const rooms = (r.room_ids ?? []).map((id) => roomMap[id]).join(' ');
      const blob = `${r.title} ${r.body ?? ''} ${assignee} ${creator} ${rooms}`.toLowerCase();
      return blob.includes(q);
    });
  }, [rows, filter, query, staffMap, roomMap]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adminTheme.colors.accent} />}
    >
      <AdminOrganizationPicker
        canUseAll={authStaff?.app_permissions?.super_admin === true || authStaff?.role === 'admin'}
        ownOrganizationId={authStaff?.organization_id}
      />
      <AdminCard style={styles.hero} elevated>
        <View style={styles.heroRow}>
          <View style={styles.heroIcon}>
            <Ionicons name="clipboard" size={28} color={adminTheme.colors.accent} />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Görev merkezi</Text>
            <Text style={styles.heroSub}>
              Personele görev atayın; fotoğraf ve video ekleyebilirsiniz. Atanan kişiye uygulama içi bildirim ve push gider.
            </Text>
          </View>
        </View>
        <View style={styles.statRow}>
          <View style={styles.statCell}>
            <Text style={styles.statVal}>{stats.open}</Text>
            <Text style={styles.statLbl}>Açık</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={[styles.statVal, stats.urgent > 0 && { color: adminTheme.colors.error }]}>{stats.urgent}</Text>
            <Text style={styles.statLbl}>Acil / yüksek</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statVal}>{stats.done}</Text>
            <Text style={styles.statLbl}>Tamamlanan</Text>
          </View>
        </View>
        <AdminButton
          title="Yeni görev ata"
          onPress={() => router.push('/admin/tasks/assign')}
          variant="accent"
          fullWidth
          leftIcon={<Ionicons name="add-circle-outline" size={20} color="#fff" />}
        />
      </AdminCard>

      <Text style={styles.listTitle}>Görev listesi</Text>
      <TextInput
        style={styles.search}
        placeholder="Başlık, personel, oda ara…"
        placeholderTextColor={adminTheme.colors.textMuted}
        value={query}
        onChangeText={setQuery}
      />
      <View style={styles.filterRow}>
        {(
          [
            { key: 'open' as const, label: 'Açık' },
            { key: 'all' as const, label: 'Tümü' },
            { key: 'done' as const, label: 'Arşiv' },
          ] as const
        ).map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.filterChip, filter === key && styles.filterChipOn]}
            onPress={() => setFilter(key)}
            activeOpacity={0.85}
          >
            <Text style={[styles.filterChipText, filter === key && styles.filterChipTextOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {filteredRows.length === 0 ? (
        <AdminCard>
          <Text style={styles.empty}>
            {rows.length === 0
              ? 'Henüz görev yok. Yukarıdan yeni görev oluşturun.'
              : 'Filtre veya aramanıza uygun görev bulunamadı.'}
          </Text>
        </AdminCard>
      ) : (
        filteredRows.map((r) => {
          const assignee = staffMap[r.assigned_staff_id];
          const creator = r.created_by_staff_id ? staffMap[r.created_by_staff_id] : null;
          const rooms = (r.room_ids ?? []).map((id) => roomMap[id]).filter(Boolean);
          const attachCount = (r.attachment_urls ?? []).filter(Boolean).length;
          const proofCount = (r.completion_proof_urls ?? []).filter(Boolean).length;
          const statusColor =
            r.status === 'completed'
              ? adminTheme.colors.success
              : r.status === 'cancelled'
                ? adminTheme.colors.textMuted
                : r.status === 'in_progress'
                  ? adminTheme.colors.info
                  : adminTheme.colors.accent;
          return (
            <AdminCard key={r.id} style={styles.rowCard} elevated>
              <View style={styles.rowTop}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={styles.rowStatus}>{ASSIGNMENT_STATUS_LABELS[r.status] ?? r.status}</Text>
                {r.priority === 'urgent' || r.priority === 'high' ? (
                  <View style={styles.prioBadge}>
                    <Text style={styles.prioBadgeText}>{ASSIGNMENT_PRIORITY_LABELS[r.priority] ?? r.priority}</Text>
                  </View>
                ) : null}
                {attachCount > 0 ? (
                  <View style={styles.attachBadge}>
                    <Ionicons name="attach-outline" size={14} color={adminTheme.colors.primary} />
                    <Text style={styles.attachBadgeText}>{attachCount}</Text>
                  </View>
                ) : null}
                {proofCount > 0 ? (
                  <View style={[styles.attachBadge, { borderColor: adminTheme.colors.success }]}>
                    <Ionicons name="camera-outline" size={14} color={adminTheme.colors.success} />
                    <Text style={[styles.attachBadgeText, { color: adminTheme.colors.success }]}>{proofCount}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.rowTitle}>{r.title}</Text>
              <View style={styles.metaBlock}>
                <View style={styles.metaLine}>
                  <Ionicons name="person-outline" size={16} color={adminTheme.colors.textSecondary} />
                  <Text style={styles.metaText}>
                    <Text style={styles.metaStrong}>Atanan: </Text>
                    {assignee?.full_name ?? 'Personel'}
                    {assignee?.role ? ` · ${STAFF_ROLE_LABELS[assignee.role] ?? assignee.role}` : ''}
                  </Text>
                </View>
                {creator ? (
                  <View style={styles.metaLine}>
                    <Ionicons name="create-outline" size={16} color={adminTheme.colors.textSecondary} />
                    <Text style={styles.metaText}>
                      <Text style={styles.metaStrong}>Atayan: </Text>
                      {creator.full_name ?? 'Yönetici'}
                      {creator.role ? ` · ${STAFF_ROLE_LABELS[creator.role] ?? creator.role}` : ''}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.metaLine}>
                  <Ionicons name="pricetag-outline" size={16} color={adminTheme.colors.textSecondary} />
                  <Text style={styles.metaText}>{ASSIGNMENT_TASK_LABELS[r.task_type] ?? r.task_type}</Text>
                </View>
                <View style={styles.metaLine}>
                  <Ionicons name="time-outline" size={16} color={adminTheme.colors.textSecondary} />
                  <Text style={styles.metaText}>Oluşturulma: {formatDateTime(r.created_at)}</Text>
                </View>
                {r.due_at ? (
                  <View style={styles.metaLine}>
                    <Ionicons name="alarm-outline" size={16} color={adminTheme.colors.accent} />
                    <Text style={[styles.metaText, styles.dueHighlight]}>Son tarih: {formatDateTime(r.due_at)}</Text>
                  </View>
                ) : null}
              </View>
              {rooms.length > 0 && (
                <View style={styles.roomRow}>
                  <Ionicons name="bed-outline" size={16} color={adminTheme.colors.textSecondary} />
                  <Text style={styles.roomText}>Odalar: {rooms.join(', ')}</Text>
                </View>
              )}
              {r.body ? (
                <Text style={styles.rowBody} numberOfLines={5}>
                  {r.body}
                </Text>
              ) : null}
              {isAdmin && r.status !== 'completed' && r.status !== 'cancelled' ? (
                <TouchableOpacity style={styles.cancelBtn} onPress={() => cancelAssignment(r.id)} activeOpacity={0.8}>
                  <Text style={styles.cancelBtnText}>Görevi iptal et</Text>
                </TouchableOpacity>
              ) : null}
            </AdminCard>
          );
        })
      )}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  scroll: { padding: adminTheme.spacing.lg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: adminTheme.colors.surfaceSecondary },
  hero: { marginBottom: adminTheme.spacing.lg },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: adminTheme.spacing.md },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: adminTheme.spacing.md,
  },
  heroText: { flex: 1 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: adminTheme.colors.text, marginBottom: 6 },
  heroSub: { fontSize: 14, lineHeight: 21, color: adminTheme.colors.textSecondary },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: adminTheme.spacing.md,
    marginBottom: adminTheme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: adminTheme.colors.border,
  },
  statCell: { alignItems: 'center', flex: 1 },
  statVal: { fontSize: 22, fontWeight: '800', color: adminTheme.colors.text },
  statLbl: { fontSize: 11, fontWeight: '600', color: adminTheme.colors.textMuted, marginTop: 4, textTransform: 'uppercase' },
  statDivider: { width: 1, height: 36, backgroundColor: adminTheme.colors.border },
  listTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: adminTheme.colors.text,
    marginBottom: adminTheme.spacing.sm,
  },
  search: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: adminTheme.colors.text,
    backgroundColor: adminTheme.colors.surface,
    marginBottom: adminTheme.spacing.md,
  },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: adminTheme.spacing.md },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: adminTheme.radius.full,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  filterChipOn: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  filterChipText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.textSecondary },
  filterChipTextOn: { color: '#fff' },
  empty: { fontSize: 14, color: adminTheme.colors.textSecondary, textAlign: 'center', paddingVertical: 8 },
  rowCard: { marginBottom: adminTheme.spacing.md },
  rowTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  rowStatus: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textSecondary, textTransform: 'uppercase' },
  prioBadge: {
    backgroundColor: adminTheme.colors.errorLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  prioBadgeText: { fontSize: 11, fontWeight: '700', color: adminTheme.colors.error },
  attachBadge: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: adminTheme.colors.warningLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  attachBadgeText: { fontSize: 12, fontWeight: '800', color: adminTheme.colors.primary },
  rowTitle: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text, marginBottom: 10 },
  metaBlock: { gap: 6, marginBottom: 10 },
  metaLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  metaText: { flex: 1, fontSize: 14, color: adminTheme.colors.textSecondary, lineHeight: 20 },
  metaStrong: { fontWeight: '700', color: adminTheme.colors.text },
  dueHighlight: { color: adminTheme.colors.accent, fontWeight: '700' },
  roomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  roomText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.primary },
  rowBody: { fontSize: 14, lineHeight: 21, color: adminTheme.colors.textSecondary, marginBottom: 8 },
  cancelBtn: { marginTop: 8, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12 },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.error },
});
