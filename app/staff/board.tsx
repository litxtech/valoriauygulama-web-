import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useStaffBoardStore } from '@/stores/staffBoardStore';
import {
  isTaskAssignmentBoardRow,
  markStaffAnnouncementRead,
  priorityAccent,
  priorityLabel,
  type StaffAnnouncementRow,
} from '@/lib/staffBoard';
import { formatDateTime } from '@/lib/date';
import { pds } from '@/constants/personelDesignSystem';
import { TaskCompletionSheet } from '@/components/TaskCompletionSheet';
import { StaffAnnouncementDetailSheet } from '@/components/staff/StaffAnnouncementDetailSheet';
import { completeStaffAssignment } from '@/lib/staffAssignmentComplete';
import { dispatchTaskCompletionNotify } from '@/lib/staffAssignmentCreate';
import {
  fetchMyStaffAssignmentBrief,
  isAssignmentOpen,
  type StaffAssignmentBrief,
} from '@/lib/staffAssignmentNotification';

export default function StaffBoardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ boardAnnouncementId?: string }>();
  const staff = useAuthStore((s) => s.staff);
  const { announcements, loading, loadList, refresh } = useStaffBoardStore();
  const [refreshing, setRefreshing] = useState(false);
  const [ackBusy, setAckBusy] = useState<string | null>(null);
  const [detailRow, setDetailRow] = useState<StaffAnnouncementRow | null>(null);
  const [completeTarget, setCompleteTarget] = useState<StaffAssignmentBrief | null>(null);
  const [completeBoardRowId, setCompleteBoardRowId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  const load = useCallback(async () => {
    if (!staff?.id) return;
    await loadList(staff.id);
  }, [staff?.id, loadList]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const openId = typeof params.boardAnnouncementId === 'string' ? params.boardAnnouncementId : '';
    if (!openId || loading || announcements.length === 0) return;
    const row = announcements.find((a) => a.id === openId);
    if (row) setDetailRow(row);
  }, [params.boardAnnouncementId, announcements, loading]);

  const unread = useMemo(() => announcements.filter((a) => !a.read_at), [announcements]);
  const history = useMemo(() => announcements.filter((a) => !!a.read_at), [announcements]);

  const onRefresh = async () => {
    if (!staff?.id) return;
    setRefreshing(true);
    await loadList(staff.id);
    setRefreshing(false);
  };

  const goTasks = useCallback(() => {
    router.push('/staff/tasks');
  }, [router]);

  const openDetail = useCallback((row: StaffAnnouncementRow) => {
    setDetailRow(row);
  }, []);

  const acknowledge = async (row: StaffAnnouncementRow) => {
    if (!staff?.id || ackBusy) return;
    setAckBusy(row.id);
    await markStaffAnnouncementRead(staff.id, row.id);
    await loadList(staff.id);
    await refresh(staff.id);
    setAckBusy(null);
    setDetailRow((prev) => (prev?.id === row.id ? { ...prev, read_at: new Date().toISOString() } : prev));
  };

  const startCompleteFromBoard = async (row: StaffAnnouncementRow) => {
    if (!staff?.id || !row.staff_assignment_id || ackBusy) return;
    setAckBusy(row.id);
    const brief = await fetchMyStaffAssignmentBrief(row.staff_assignment_id, staff.id);
    setAckBusy(null);
    if (!brief) {
      Alert.alert(t('error'), t('staffNotifTaskCompleteFailed'));
      goTasks();
      return;
    }
    if (!isAssignmentOpen(brief.status)) {
      await markStaffAnnouncementRead(staff.id, row.id);
      await loadList(staff.id);
      Alert.alert(t('staffTasks_savedTitle'), t('staffNotifTaskCompleted'));
      setDetailRow(null);
      return;
    }
    setDetailRow(null);
    setCompleteBoardRowId(row.id);
    setCompleteTarget(brief);
  };

  const submitTaskCompletion = async (payload: { note?: string; proofUris: string[] }) => {
    if (!staff?.id || !completeTarget) return;
    const target = completeTarget;
    setCompleting(true);
    const result = await completeStaffAssignment({
      assignmentId: target.id,
      staffId: staff.id,
      note: payload.note,
      proofUris: payload.proofUris,
    });
    setCompleting(false);
    if (result.error) {
      Alert.alert(t('error'), result.error);
      return;
    }
    dispatchTaskCompletionNotify({
      assignmentId: target.id,
      title: target.title,
      createdByStaffId: target.created_by_staff_id,
      completedByStaffId: staff.id,
      completedByStaffName: staff.full_name ?? '',
    });
    if (completeBoardRowId) {
      await markStaffAnnouncementRead(staff.id, completeBoardRowId);
      await loadList(staff.id);
      await refresh(staff.id);
    }
    setCompleteTarget(null);
    setCompleteBoardRowId(null);
    Alert.alert(t('staffTasks_savedTitle'), t('staffTasks_taskCompletedBody'));
  };

  if (!staff) return null;

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={pds.indigo} />}
      >
        <View style={styles.hero}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="megaphone-outline" size={18} color="#2563eb" />
          </View>
          <View style={styles.heroTextCol}>
            <Text style={styles.heroTitle}>{t('staffBoardTitle')}</Text>
            {unread.length > 0 ? (
              <Text style={styles.heroSub}>{t('staffBoardUnread', { count: unread.length })}</Text>
            ) : (
              <Text style={styles.heroSubMuted}>{t('staffBoardSubtitleShort')}</Text>
            )}
          </View>
        </View>

        {loading && announcements.length === 0 ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={pds.indigo} />
        ) : null}

        {unread.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('staffBoardCurrent')}</Text>
            {unread.map((row) => (
              <AnnouncementCard key={row.id} row={row} highlight onPress={() => openDetail(row)} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyCurrent}>
            <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
            <Text style={styles.emptyCurrentText}>{t('staffBoardAllRead')}</Text>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionLabel}>{t('staffBoardHistory')}</Text>
            <TouchableOpacity onPress={onRefresh} style={styles.refreshChip} activeOpacity={0.85}>
              <Ionicons name="refresh-outline" size={14} color={pds.indigo} />
            </TouchableOpacity>
          </View>
          {history.length === 0 ? (
            <Text style={styles.historyEmpty}>{t('staffBoardHistoryEmpty')}</Text>
          ) : (
            history.map((row) => (
              <AnnouncementCard key={row.id} row={row} onPress={() => openDetail(row)} />
            ))
          )}
        </View>
      </ScrollView>

      <StaffAnnouncementDetailSheet
        visible={!!detailRow}
        row={detailRow}
        busy={detailRow ? ackBusy === detailRow.id : false}
        onClose={() => setDetailRow(null)}
        onAcknowledge={
          detailRow && !detailRow.read_at && !isTaskAssignmentBoardRow(detailRow)
            ? () => void acknowledge(detailRow)
            : undefined
        }
        onCompleteTask={
          detailRow && isTaskAssignmentBoardRow(detailRow)
            ? () => void startCompleteFromBoard(detailRow)
            : undefined
        }
        onOpenTasks={goTasks}
        onOpenActionUrl={(href) => {
          setDetailRow(null);
          router.push(href as Href);
        }}
      />

      <TaskCompletionSheet
        visible={!!completeTarget}
        taskTitle={completeTarget?.title ?? ''}
        saving={completing}
        onClose={() => {
          setCompleteTarget(null);
          setCompleteBoardRowId(null);
        }}
        onSubmit={submitTaskCompletion}
      />
    </>
  );
}

function AnnouncementCard({
  row,
  highlight,
  onPress,
}: {
  row: StaffAnnouncementRow;
  highlight?: boolean;
  onPress: () => void;
}) {
  const accent = priorityAccent(row.priority, row);
  const read = !!row.read_at;
  const isTask = isTaskAssignmentBoardRow(row);
  const hasMedia =
    !!row.media_payload?.images?.length ||
    !!row.media_payload?.videoUrl ||
    !!row.media_payload?.websiteUrl ||
    !!row.image_url;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.card, highlight && styles.cardHighlight, read && styles.cardRead]}
    >
      <View style={styles.cardRow}>
        <View style={styles.cardMain}>
          <View style={styles.cardTop}>
            <View style={[styles.priorityPill, { backgroundColor: `${accent}14`, borderColor: `${accent}44` }]}>
              <Text style={[styles.priorityText, { color: accent }]}>{priorityLabel(row.priority, row)}</Text>
            </View>
            {isTask ? (
              <View style={styles.taskChip}>
                <Ionicons name="clipboard-outline" size={11} color="#2563eb" />
              </View>
            ) : null}
            {hasMedia ? (
              <View style={styles.mediaChip}>
                <Ionicons name="attach-outline" size={11} color="#7c3aed" />
              </View>
            ) : null}
            <Text style={styles.cardDate}>{formatDateTime(row.created_at)}</Text>
          </View>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {row.title}
          </Text>
          <Text style={styles.cardPreview} numberOfLines={2}>
            {row.content}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#94a3b8" style={styles.cardChevron} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 14, paddingBottom: 32 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  heroIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextCol: { flex: 1, minWidth: 0 },
  heroTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  heroSub: { marginTop: 2, fontSize: 12, fontWeight: '600', color: '#2563eb' },
  heroSubMuted: { marginTop: 2, fontSize: 11, color: '#64748b', lineHeight: 15 },
  section: { marginBottom: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 },
  refreshChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  emptyCurrent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#bbf7d0',
  },
  emptyCurrentText: { fontSize: 12, fontWeight: '600', color: '#166534' },
  historyEmpty: { fontSize: 13, color: '#94a3b8', paddingVertical: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 11,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  cardHighlight: {
    borderColor: '#93c5fd',
    backgroundColor: '#f8fbff',
  },
  cardRead: { opacity: 0.94 },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardMain: { flex: 1, minWidth: 0 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  priorityPill: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
  },
  priorityText: { fontSize: 10, fontWeight: '800' },
  taskChip: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaChip: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#f5f3ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardDate: { marginLeft: 'auto', fontSize: 10, color: '#94a3b8', fontWeight: '600' },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  cardPreview: { marginTop: 3, fontSize: 12, color: '#64748b', lineHeight: 17 },
  cardChevron: { marginLeft: 6 },
});
