import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Modal,
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
import { awardStaffPoints } from '@/lib/staffPoints';
import { prefetchAdminAssignPickers } from '@/lib/adminAssignPickersCache';
import {
  fetchStaffAssignmentViewers,
  fetchStaffTasksTabViewers,
  type StaffAssignmentViewerRow,
  type StaffTasksTabViewerRow,
} from '@/lib/staffAssignmentViews';

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
  failure_reason?: string | null;
  failed_at?: string | null;
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
  const [scoreTarget, setScoreTarget] = useState<AssignmentRow | null>(null);
  const [scoreValue, setScoreValue] = useState('5');
  const [scoreNote, setScoreNote] = useState('');
  const [scoring, setScoring] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewers, setViewers] = useState<StaffTasksTabViewerRow[]>([]);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [assignmentViewersOpen, setAssignmentViewersOpen] = useState(false);
  const [assignmentViewers, setAssignmentViewers] = useState<StaffAssignmentViewerRow[]>([]);
  const [assignmentViewersTitle, setAssignmentViewersTitle] = useState('');
  const [assignmentViewersLoading, setAssignmentViewersLoading] = useState(false);

  const orgIdForViewers = useMemo(() => {
    const canUseAll = authStaff?.app_permissions?.super_admin === true || authStaff?.role === 'admin';
    const orgId = canUseAll ? selectedOrganizationId : authStaff?.organization_id;
    return orgId && orgId !== 'all' ? orgId : authStaff?.organization_id ?? null;
  }, [authStaff?.app_permissions?.super_admin, authStaff?.organization_id, authStaff?.role, selectedOrganizationId]);

  const viewerCount = viewers.length;

  const loadViewers = useCallback(async () => {
    if (!orgIdForViewers) {
      setViewers([]);
      return;
    }
    setViewersLoading(true);
    try {
      setViewers(await fetchStaffTasksTabViewers(orgIdForViewers));
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Personel listesi yüklenemedi.');
      setViewers([]);
    } finally {
      setViewersLoading(false);
    }
  }, [orgIdForViewers]);

  useEffect(() => {
    if (viewersOpen) void loadViewers();
  }, [viewersOpen, loadViewers]);

  useEffect(() => {
    if (!isAdmin || !orgIdForViewers) {
      setViewers([]);
      return;
    }
    void fetchStaffTasksTabViewers(orgIdForViewers)
      .then(setViewers)
      .catch(() => setViewers([]));
  }, [isAdmin, orgIdForViewers]);

  const load = useCallback(async () => {
    const canUseAll = authStaff?.app_permissions?.super_admin === true || authStaff?.role === 'admin';
    const orgId = canUseAll ? selectedOrganizationId : authStaff?.organization_id;

    let orgStaffIds: string[] | null = null;
    if (orgId && orgId !== 'all') {
      const { data: orgStaffRows } = await supabase.from('staff').select('id').eq('organization_id', orgId);
      orgStaffIds = (orgStaffRows ?? []).map((r: { id: string }) => r.id);
      if (orgStaffIds.length === 0) {
        setRows([]);
        setStaffMap({});
        setRoomMap({});
        setLoading(false);
        setRefreshing(false);
        return;
      }
    }

    const applyOrgFilter = <T extends { in: (col: string, vals: string[]) => T }>(query: T) =>
      orgStaffIds ? query.in('assigned_staff_id', orgStaffIds) : query;

    let baseQuery = applyOrgFilter(
      supabase
        .from('staff_assignments')
        .select(
          'id, title, body, task_type, priority, status, assigned_staff_id, created_by_staff_id, room_ids, due_at, created_at, attachment_urls, completion_proof_urls, completion_note, failure_reason, failed_at'
        )
        .order('created_at', { ascending: false })
        .limit(120)
    );
    const { data: list, error } = await baseQuery;
    if (error) {
      const msg = error.message ?? '';
      if (
        msg.includes('attachment_urls') ||
        msg.includes('completion_') ||
        msg.includes('failure_') ||
        error.code === 'PGRST204'
      ) {
        let legacyQuery = applyOrgFilter(
          supabase
            .from('staff_assignments')
            .select(
              'id, title, body, task_type, priority, status, assigned_staff_id, created_by_staff_id, room_ids, due_at, created_at'
            )
            .order('created_at', { ascending: false })
            .limit(120)
        );
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

  const submitTaskScore = async () => {
    if (!authStaff?.id || !scoreTarget) return;
    const orgId = authStaff.organization_id;
    if (!orgId) return;
    const pts = parseInt(scoreValue, 10);
    if (isNaN(pts) || pts === 0) {
      setScoreTarget(null);
      return;
    }
    setScoring(true);
    try {
      const result = await awardStaffPoints({
        organizationId: orgId,
        staffId: scoreTarget.assigned_staff_id,
        points: pts,
        category: 'task',
        reason: scoreNote.trim() || `Görev tamamlandı: ${scoreTarget.title}`,
        referenceType: 'staff_assignment',
        referenceId: scoreTarget.id,
        createdByStaffId: authStaff.id,
      });
      if (!result.success) throw new Error(result.error);
      Alert.alert('Başarılı', `${pts > 0 ? '+' : ''}${pts} puan verildi.`);
      setScoreTarget(null);
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Puanlama başarısız');
    } finally {
      setScoring(false);
    }
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

  const openAssignmentViewers = async (row: AssignmentRow) => {
    setAssignmentViewersTitle(row.title);
    setAssignmentViewersOpen(true);
    setAssignmentViewersLoading(true);
    try {
      setAssignmentViewers(await fetchStaffAssignmentViewers(row.id));
    } catch {
      setAssignmentViewers([]);
    } finally {
      setAssignmentViewersLoading(false);
    }
  };

  const stats = useMemo(() => {
    const open = rows.filter((r) => r.status === 'pending' || r.status === 'in_progress').length;
    const done = rows.filter((r) => r.status === 'completed').length;
    const failed = rows.filter((r) => r.status === 'failed').length;
    const urgent = rows.filter((r) => (r.priority === 'urgent' || r.priority === 'high') && r.status !== 'completed' && r.status !== 'cancelled' && r.status !== 'failed').length;
    return { open, done, failed, urgent, total: rows.length };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (filter === 'open') {
      list = list.filter((r) => r.status === 'pending' || r.status === 'in_progress');
    } else if (filter === 'done') {
      list = list.filter((r) => r.status === 'completed' || r.status === 'cancelled' || r.status === 'failed');
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
          onPress={() => {
            prefetchAdminAssignPickers();
            router.push('/admin/tasks/assign');
          }}
          variant="accent"
          fullWidth
          leftIcon={<Ionicons name="add-circle-outline" size={20} color="#fff" />}
        />
        {isAdmin ? (
          <TouchableOpacity
            style={styles.viewersBtn}
            onPress={() => setViewersOpen(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="eye-outline" size={18} color={adminTheme.colors.primary} />
            <Text style={styles.viewersBtnText}>Görev sekmesini açanlar</Text>
            {viewerCount > 0 ? (
              <View style={styles.viewersBadge}>
                <Text style={styles.viewersBadgeText}>{viewerCount}</Text>
              </View>
            ) : null}
            <Ionicons name="chevron-forward" size={16} color={adminTheme.colors.textMuted} />
          </TouchableOpacity>
        ) : null}
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
              : r.status === 'failed'
                ? adminTheme.colors.error
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
              {r.failure_reason?.trim() ? (
                <Text style={styles.failureNote}>
                  Yapılamadı açıklaması: {r.failure_reason.trim()}
                </Text>
              ) : null}
              {r.body ? (
                <Text style={styles.rowBody} numberOfLines={5}>
                  {r.body}
                </Text>
              ) : null}
              {isAdmin ? (
                <TouchableOpacity
                  style={styles.viewersInlineBtn}
                  onPress={() => void openAssignmentViewers(r)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="eye-outline" size={16} color={adminTheme.colors.primary} />
                  <Text style={styles.viewersInlineBtnText}>Kim gördü</Text>
                </TouchableOpacity>
              ) : null}
              {isAdmin && r.status !== 'completed' && r.status !== 'cancelled' && r.status !== 'failed' ? (
                <TouchableOpacity style={styles.cancelBtn} onPress={() => cancelAssignment(r.id)} activeOpacity={0.8}>
                  <Text style={styles.cancelBtnText}>Görevi iptal et</Text>
                </TouchableOpacity>
              ) : null}
              {isAdmin && r.status === 'completed' ? (
                <TouchableOpacity
                  style={styles.scoreBtn}
                  onPress={() => { setScoreTarget(r); setScoreValue('5'); setScoreNote(''); }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="star" size={16} color="#047857" />
                  <Text style={styles.scoreBtnText}>Puanla</Text>
                </TouchableOpacity>
              ) : null}
            </AdminCard>
          );
        })
      )}
      <View style={{ height: 32 }} />

      {/* Task scoring modal */}
      <Modal visible={scoreTarget !== null} transparent animationType="fade" onRequestClose={() => setScoreTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Ionicons name="star" size={28} color="#047857" />
              <Text style={styles.modalTitle}>Görev Puanla</Text>
              <Text style={styles.modalSub}>
                {scoreTarget ? staffMap[scoreTarget.assigned_staff_id]?.full_name ?? 'Personel' : ''} — {scoreTarget?.title ?? ''}
              </Text>
            </View>

            <Text style={styles.modalLabel}>Puan</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {[3, 5, 10, 15].map((v) => (
                <TouchableOpacity
                  key={v}
                  onPress={() => setScoreValue(String(v))}
                  style={[
                    styles.scoreChip,
                    scoreValue === String(v) && styles.scoreChipActive,
                  ]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.scoreChipText, scoreValue === String(v) && styles.scoreChipTextActive]}>+{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.modalInput}
              value={scoreValue}
              onChangeText={setScoreValue}
              placeholder="Özel puan"
              placeholderTextColor={adminTheme.colors.textMuted}
              keyboardType="number-pad"
            />

            <Text style={[styles.modalLabel, { marginTop: 8 }]}>Not (opsiyonel)</Text>
            <TextInput
              style={[styles.modalInput, { minHeight: 60 }]}
              value={scoreNote}
              onChangeText={setScoreNote}
              placeholder="Neden puan veriliyor?"
              placeholderTextColor={adminTheme.colors.textMuted}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setScoreTarget(null)} activeOpacity={0.85}>
                <Text style={styles.modalCancelText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={submitTaskScore} disabled={scoring} activeOpacity={0.85}>
                {scoring ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="star" size={16} color="#fff" />
                    <Text style={styles.modalConfirmText}>Puanla</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={viewersOpen} transparent animationType="slide" onRequestClose={() => setViewersOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, styles.viewersSheet]}>
            <View style={styles.viewersSheetHeader}>
              <Ionicons name="people-outline" size={24} color={adminTheme.colors.primary} />
              <Text style={styles.viewersSheetTitle}>Görev sekmesini açanlar</Text>
              <TouchableOpacity onPress={() => setViewersOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={adminTheme.colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.viewersSheetSub}>
              Personel görevler sekmesine girdiğinde burada listelenir. Görev kartını açanlar ilgili görevde &quot;Kim gördü&quot; ile görünür.
            </Text>
            {viewersLoading ? (
              <ActivityIndicator style={{ marginVertical: 24 }} color={adminTheme.colors.primary} />
            ) : viewers.length === 0 ? (
              <Text style={styles.viewersEmpty}>Henüz kayıt yok veya otel seçilmedi.</Text>
            ) : (
              <ScrollView style={styles.viewersList} keyboardShouldPersistTaps="handled">
                {viewers.map((v) => (
                  <View key={v.staff_id} style={styles.viewerRow}>
                    <View style={styles.viewerAvatar}>
                      <Text style={styles.viewerAvatarText}>{(v.full_name?.[0] ?? '?').toUpperCase()}</Text>
                    </View>
                    <View style={styles.viewerBody}>
                      <Text style={styles.viewerName}>{v.full_name ?? 'Personel'}</Text>
                      <Text style={styles.viewerMeta}>
                        {v.role ? STAFF_ROLE_LABELS[v.role] ?? v.role : '—'}
                        {v.department ? ` · ${v.department}` : ''}
                      </Text>
                      <Text style={styles.viewerTime}>{formatDateTime(v.last_opened_at)}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={assignmentViewersOpen} transparent animationType="slide" onRequestClose={() => setAssignmentViewersOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, styles.viewersSheet]}>
            <View style={styles.viewersSheetHeader}>
              <Ionicons name="eye-outline" size={24} color={adminTheme.colors.primary} />
              <Text style={styles.viewersSheetTitle} numberOfLines={2}>
                {assignmentViewersTitle}
              </Text>
              <TouchableOpacity onPress={() => setAssignmentViewersOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={adminTheme.colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.viewersSheetSub}>Bu görev kartını açan personel</Text>
            {assignmentViewersLoading ? (
              <ActivityIndicator style={{ marginVertical: 24 }} color={adminTheme.colors.primary} />
            ) : assignmentViewers.length === 0 ? (
              <Text style={styles.viewersEmpty}>Henüz kimse açmamış.</Text>
            ) : (
              <ScrollView style={styles.viewersList} keyboardShouldPersistTaps="handled">
                {assignmentViewers.map((v) => (
                  <View key={v.staff_id} style={styles.viewerRow}>
                    <View style={styles.viewerAvatar}>
                      <Text style={styles.viewerAvatarText}>{(v.full_name?.[0] ?? '?').toUpperCase()}</Text>
                    </View>
                    <View style={styles.viewerBody}>
                      <Text style={styles.viewerName}>{v.full_name ?? 'Personel'}</Text>
                      <Text style={styles.viewerMeta}>
                        {v.role ? STAFF_ROLE_LABELS[v.role] ?? v.role : '—'}
                        {v.department ? ` · ${v.department}` : ''}
                      </Text>
                      <Text style={styles.viewerTime}>{formatDateTime(v.viewed_at)}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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
  failureNote: {
    fontSize: 13,
    lineHeight: 19,
    color: adminTheme.colors.error,
    marginBottom: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: adminTheme.colors.error + '10',
  },
  cancelBtn: { marginTop: 8, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12 },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.error },
  scoreBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  scoreBtnText: { fontSize: 13, fontWeight: '700', color: '#047857' },
  viewersBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  viewersBtnText: { flex: 1, fontSize: 14, fontWeight: '700', color: adminTheme.colors.primary },
  viewersInlineBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  viewersInlineBtnText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.primary },
  viewersBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: adminTheme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  viewersBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  viewersSheet: { maxHeight: '80%' },
  viewersSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  viewersSheetTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: adminTheme.colors.text },
  viewersSheetSub: { fontSize: 13, lineHeight: 19, color: adminTheme.colors.textMuted, marginBottom: 12 },
  viewersEmpty: { fontSize: 14, color: adminTheme.colors.textMuted, textAlign: 'center', paddingVertical: 20 },
  viewersList: { maxHeight: 360 },
  viewerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: adminTheme.colors.border,
  },
  viewerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: adminTheme.colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerAvatarText: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.primary },
  viewerBody: { flex: 1, minWidth: 0 },
  viewerName: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  viewerMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  viewerTime: { fontSize: 11, color: '#64748b', marginTop: 4, fontWeight: '600' },
  viewerTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: adminTheme.colors.warningLight,
  },
  viewerTagText: { fontSize: 10, fontWeight: '800', color: adminTheme.colors.accent },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: { alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.text, marginTop: 8 },
  modalSub: { fontSize: 13, color: adminTheme.colors.textSecondary, marginTop: 4, textAlign: 'center' },
  modalLabel: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 8 },
  modalInput: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: adminTheme.colors.text,
    backgroundColor: '#F9FAFB',
    marginBottom: 8,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.textSecondary },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#047857',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modalConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  scoreChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  scoreChipActive: { borderColor: '#047857', backgroundColor: '#ECFDF5' },
  scoreChipText: { fontSize: 16, fontWeight: '800', color: '#6B7280' },
  scoreChipTextActive: { color: '#047857' },
});
