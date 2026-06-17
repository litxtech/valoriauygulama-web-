import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { AdminOrganizationPicker } from '@/components/admin';
import { adminTheme } from '@/constants/adminTheme';
import { formatDateTime } from '@/lib/date';
import {
  fetchAnnouncementEngagement,
  fetchAnnouncementReaders,
  type AnnouncementEngagementRow,
  type AnnouncementReaderRow,
} from '@/lib/adminAnnouncementEngagement';
import { fetchStaffTasksTabViewers, type StaffTasksTabViewerRow } from '@/lib/staffAssignmentViews';
import { STAFF_ROLE_LABELS } from '@/lib/staffAssignments';

type TabKey = 'announcements' | 'tasks';

const PAGE_BG = adminTheme.colors.surfaceSecondary;

export default function AdminEngagementScreen() {
  const { staff } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const canUseAll = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
  const orgId = useMemo(() => {
    const raw = canUseAll ? selectedOrganizationId : staff?.organization_id;
    return raw && raw !== 'all' ? raw : staff?.organization_id ?? null;
  }, [canUseAll, selectedOrganizationId, staff?.organization_id]);

  const [tab, setTab] = useState<TabKey>('announcements');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementEngagementRow[]>([]);
  const [taskViewers, setTaskViewers] = useState<StaffTasksTabViewerRow[]>([]);
  const [detailAnn, setDetailAnn] = useState<AnnouncementEngagementRow | null>(null);
  const [readers, setReaders] = useState<AnnouncementReaderRow[]>([]);
  const [unread, setUnread] = useState<AnnouncementReaderRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) {
      setAnnouncements([]);
      setTaskViewers([]);
      setLoadError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const [annResult, tasksResult] = await Promise.allSettled([
        fetchAnnouncementEngagement(orgId),
        fetchStaffTasksTabViewers(orgId),
      ]);

      setAnnouncements(annResult.status === 'fulfilled' ? annResult.value : []);
      setTaskViewers(tasksResult.status === 'fulfilled' ? tasksResult.value : []);

      const errors: string[] = [];
      if (annResult.status === 'rejected') {
        errors.push(annResult.reason instanceof Error ? annResult.reason.message : 'Duyurular yüklenemedi');
      }
      if (tasksResult.status === 'rejected') {
        errors.push(tasksResult.reason instanceof Error ? tasksResult.reason.message : 'Görev görüntüleme kayıtları yüklenemedi');
      }
      setLoadError(errors.length > 0 ? errors.join(' · ') : null);
    } catch (e) {
      console.warn('admin engagement load', e);
      setAnnouncements([]);
      setTaskViewers([]);
      setLoadError((e as Error).message ?? 'Veriler yüklenemedi');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const openAnnouncementDetail = async (row: AnnouncementEngagementRow) => {
    if (!orgId) return;
    setDetailAnn(row);
    setDetailLoading(true);
    try {
      const result = await fetchAnnouncementReaders(row.id, orgId);
      setReaders(result.readers);
      setUnread(result.unread);
    } catch {
      setReaders([]);
      setUnread([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailAnn(null);
    setReaders([]);
    setUnread([]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
        <Text style={styles.loadingText}>Okuma kayıtları yükleniyor…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={adminTheme.colors.accent}
          />
        }
      >
        <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} />

        <View style={styles.hero}>
          <Ionicons name="analytics-outline" size={24} color="#4f46e5" />
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Okuma & görüntüleme takibi</Text>
            <Text style={styles.heroSub}>Duyuruyu kim okudu, görevleri kim açtı — canlı liste.</Text>
          </View>
        </View>

        {loadError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={18} color={adminTheme.colors.error} />
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        ) : null}

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabChip, tab === 'announcements' && styles.tabChipOn]}
            onPress={() => setTab('announcements')}
          >
            <Text style={[styles.tabChipText, tab === 'announcements' && styles.tabChipTextOn]}>Duyurular</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabChip, tab === 'tasks' && styles.tabChipOn]}
            onPress={() => setTab('tasks')}
          >
            <Text style={[styles.tabChipText, tab === 'tasks' && styles.tabChipTextOn]}>Görev sekmesi</Text>
          </TouchableOpacity>
        </View>

        {tab === 'announcements' ? (
          announcements.length === 0 ? (
            <Text style={styles.empty}>
              {orgId ? 'Henüz duyuru yok.' : 'İşletme seçin veya yetkinizi kontrol edin.'}
            </Text>
          ) : (
            announcements.map((row) => {
              const pct = row.target_count > 0 ? Math.round((row.read_count / row.target_count) * 100) : 0;
              return (
                <TouchableOpacity
                  key={row.id}
                  style={styles.card}
                  activeOpacity={0.88}
                  onPress={() => void openAnnouncementDetail(row)}
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {row.title}
                    </Text>
                    <Text style={styles.cardDate}>{formatDateTime(row.created_at)}</Text>
                  </View>
                  <Text style={styles.cardPreview} numberOfLines={2}>
                    {row.content}
                  </Text>
                  <View style={styles.statRow}>
                    <View style={styles.statPill}>
                      <Ionicons name="checkmark-done-outline" size={14} color="#15803d" />
                      <Text style={styles.statPillText}>
                        {row.read_count}/{row.target_count} okudu
                      </Text>
                    </View>
                    <View style={[styles.statPill, row.read_count < row.target_count && styles.statPillWarn]}>
                      <Text style={[styles.statPillText, row.read_count < row.target_count && styles.statPillTextWarn]}>
                        %{pct}
                      </Text>
                    </View>
                    {row.staff_assignment_id ? (
                      <View style={styles.taskBadge}>
                        <Text style={styles.taskBadgeText}>Görev</Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })
          )
        ) : taskViewers.length === 0 ? (
          <Text style={styles.empty}>Henüz görevler sekmesini açan personel kaydı yok.</Text>
        ) : (
          taskViewers.map((v) => (
            <View key={v.staff_id} style={styles.viewerCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(v.full_name?.[0] ?? '?').toUpperCase()}</Text>
              </View>
              <View style={styles.viewerBody}>
                <Text style={styles.viewerName}>{v.full_name ?? 'Personel'}</Text>
                <Text style={styles.viewerMeta}>
                  {v.role ? STAFF_ROLE_LABELS[v.role] ?? v.role : '—'}
                  {v.department ? ` · ${v.department}` : ''}
                </Text>
                <Text style={styles.viewerTime}>Son açılış: {formatDateTime(v.last_opened_at)}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={!!detailAnn} transparent animationType="slide" onRequestClose={closeDetail}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={2}>
                {detailAnn?.title}
              </Text>
              <TouchableOpacity onPress={closeDetail} hitSlop={12}>
                <Ionicons name="close" size={24} color={adminTheme.colors.textMuted} />
              </TouchableOpacity>
            </View>
            {detailLoading ? (
              <ActivityIndicator style={{ marginVertical: 24 }} color={adminTheme.colors.accent} />
            ) : (
              <ScrollView contentContainerStyle={styles.modalContent}>
                <Text style={styles.sectionLabel}>Okuyanlar ({readers.length})</Text>
                {readers.length === 0 ? (
                  <Text style={styles.emptyInline}>Henüz okuyan yok.</Text>
                ) : (
                  readers.map((r) => (
                    <View key={r.staff_id} style={styles.readerRow}>
                      <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                      <View style={styles.readerBody}>
                        <Text style={styles.readerName}>{r.full_name ?? 'Personel'}</Text>
                        <Text style={styles.readerMeta}>{formatDateTime(r.read_at)}</Text>
                      </View>
                    </View>
                  ))
                )}

                <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Okumayanlar ({unread.length})</Text>
                {unread.length === 0 ? (
                  <Text style={styles.emptyInline}>Herkes okumuş.</Text>
                ) : (
                  unread.map((r) => (
                    <View key={r.staff_id} style={styles.readerRow}>
                      <Ionicons name="ellipse-outline" size={18} color="#94a3b8" />
                      <View style={styles.readerBody}>
                        <Text style={styles.readerName}>{r.full_name ?? 'Personel'}</Text>
                        <Text style={styles.readerMeta}>
                          {r.role ? STAFF_ROLE_LABELS[r.role] ?? r.role : '—'}
                          {r.department ? ` · ${r.department}` : ''}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  screen: { flex: 1, backgroundColor: PAGE_BG },
  content: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PAGE_BG,
    gap: 12,
  },
  loadingText: { fontSize: 13, color: adminTheme.colors.textMuted, fontWeight: '600' },
  hero: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#eef2ff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  heroText: { flex: 1 },
  heroTitle: { fontSize: 16, fontWeight: '800', color: '#312e81' },
  heroSub: { marginTop: 4, fontSize: 12, color: '#4338ca', lineHeight: 17 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: adminTheme.colors.errorLight,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: { flex: 1, fontSize: 12, color: adminTheme.colors.error, lineHeight: 17, fontWeight: '600' },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tabChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    alignItems: 'center',
  },
  tabChipOn: { backgroundColor: '#eef2ff', borderColor: '#818cf8' },
  tabChipText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.textMuted },
  tabChipTextOn: { color: '#4338ca' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: adminTheme.colors.text },
  cardDate: { fontSize: 11, color: adminTheme.colors.textMuted },
  cardPreview: { fontSize: 13, color: adminTheme.colors.textMuted, lineHeight: 18 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#f0fdf4',
  },
  statPillWarn: { backgroundColor: '#fff7ed' },
  statPillText: { fontSize: 12, fontWeight: '700', color: '#166534' },
  statPillTextWarn: { color: '#c2410c' },
  taskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#f5f3ff',
  },
  taskBadgeText: { fontSize: 11, fontWeight: '700', color: '#6d28d9' },
  viewerCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#4338ca' },
  viewerBody: { flex: 1 },
  viewerName: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  viewerMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  viewerTime: { fontSize: 11, color: '#64748b', marginTop: 4, fontWeight: '600' },
  empty: { fontSize: 14, color: adminTheme.colors.textMuted, textAlign: 'center', marginTop: 24 },
  emptyInline: { fontSize: 13, color: adminTheme.colors.textMuted, marginBottom: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    maxHeight: '82%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: adminTheme.colors.border,
  },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: adminTheme.colors.text },
  modalContent: { padding: 16 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 8 },
  readerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  readerBody: { flex: 1 },
  readerName: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  readerMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
});
