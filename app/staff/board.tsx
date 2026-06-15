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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
  const staff = useAuthStore((s) => s.staff);
  const { announcements, loading, loadList, refresh } = useStaffBoardStore();
  const [refreshing, setRefreshing] = useState(false);
  const [ackBusy, setAckBusy] = useState<string | null>(null);
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

  const acknowledge = async (row: StaffAnnouncementRow) => {
    if (!staff?.id || ackBusy) return;
    setAckBusy(row.id);
    await markStaffAnnouncementRead(staff.id, row.id);
    await loadList(staff.id);
    await refresh(staff.id);
    setAckBusy(null);
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
      return;
    }
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
        <LinearGradient colors={['#1e3a8a', '#2563eb', '#3b82f6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="eye" size={28} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>{t('staffBoardTitle')}</Text>
          <Text style={styles.heroSub}>{t('staffBoardSubtitle')}</Text>
          {unread.length > 0 ? (
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>{t('staffBoardUnread', { count: unread.length })}</Text>
            </View>
          ) : null}
        </LinearGradient>

        {loading && announcements.length === 0 ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={pds.indigo} />
        ) : null}

        {unread.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('staffBoardCurrent')}</Text>
            {unread.map((row) => (
              <AnnouncementCard
                key={row.id}
                row={row}
                highlight
                busy={ackBusy === row.id}
                onAcknowledge={() => acknowledge(row)}
                onCompleteTask={() => void startCompleteFromBoard(row)}
                onOpenTasks={goTasks}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyCurrent}>
            <Ionicons name="checkmark-circle-outline" size={40} color="#22c55e" />
            <Text style={styles.emptyCurrentText}>{t('staffBoardAllRead')}</Text>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionLabel}>{t('staffBoardHistory')}</Text>
            <TouchableOpacity onPress={onRefresh} style={styles.refreshChip} activeOpacity={0.85}>
              <Ionicons name="refresh-outline" size={16} color={pds.indigo} />
              <Text style={styles.refreshChipText}>{t('refresh')}</Text>
            </TouchableOpacity>
          </View>
          {history.length === 0 ? (
            <Text style={styles.historyEmpty}>{t('staffBoardHistoryEmpty')}</Text>
          ) : (
            history.map((row) => (
              <AnnouncementCard
                key={row.id}
                row={row}
                onPress={() => {
                  if (isTaskAssignmentBoardRow(row)) {
                    goTasks();
                    return;
                  }
                  if (!row.read_at) void acknowledge(row);
                }}
              />
            ))
          )}
        </View>

        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.88}>
          <Text style={styles.backBtnText}>{t('back')}</Text>
        </TouchableOpacity>
      </ScrollView>
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
  busy,
  onAcknowledge,
  onCompleteTask,
  onOpenTasks,
  onPress,
}: {
  row: StaffAnnouncementRow;
  highlight?: boolean;
  busy?: boolean;
  onAcknowledge?: () => void;
  onCompleteTask?: () => void;
  onOpenTasks?: () => void;
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  const accent = priorityAccent(row.priority, row);
  const read = !!row.read_at;
  const isTask = isTaskAssignmentBoardRow(row);

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.9 : 1}
      onPress={onPress}
      style={[styles.card, highlight && styles.cardHighlight, read && styles.cardRead]}
    >
      <View style={styles.cardTop}>
        <View style={[styles.priorityPill, { backgroundColor: `${accent}18`, borderColor: `${accent}55` }]}>
          <Text style={[styles.priorityText, { color: accent }]}>{priorityLabel(row.priority, row)}</Text>
        </View>
        <Text style={styles.cardDate}>{formatDateTime(row.created_at)}</Text>
      </View>
      <Text style={styles.cardTitle}>{row.title}</Text>
      <Text style={styles.cardBody}>{row.content}</Text>
      {highlight && isTask && onCompleteTask ? (
        <View style={styles.taskActions}>
          <TouchableOpacity
            style={[styles.completeBtn, busy && styles.ackBtnBusy]}
            onPress={onCompleteTask}
            disabled={busy}
            activeOpacity={0.88}
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-done-outline" size={18} color="#fff" />
                <Text style={styles.completeBtnText}>{t('staffBoardCompleteTask')}</Text>
              </>
            )}
          </TouchableOpacity>
          {onOpenTasks ? (
            <TouchableOpacity style={styles.openTasksBtn} onPress={onOpenTasks} activeOpacity={0.88}>
              <Text style={styles.openTasksBtnText}>{t('staffBoardOpenTask')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : highlight && onAcknowledge ? (
        <TouchableOpacity
          style={[styles.ackBtn, busy && styles.ackBtnBusy]}
          onPress={onAcknowledge}
          disabled={busy}
          activeOpacity={0.88}
        >
          {busy ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-done-outline" size={18} color="#fff" />
              <Text style={styles.ackBtnText}>{t('staffBoardAcknowledge')}</Text>
            </>
          )}
        </TouchableOpacity>
      ) : read ? (
        <Text style={styles.readMark}>{t('staffBoardReadAt', { time: formatDateTime(row.read_at!) })}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, paddingBottom: 40 },
  hero: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    overflow: 'hidden',
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  heroSub: { marginTop: 6, fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 20 },
  heroBadge: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroBadgeText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  section: { marginBottom: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6 },
  refreshChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  refreshChipText: { fontSize: 12, fontWeight: '700', color: pds.indigo },
  emptyCurrent: {
    alignItems: 'center',
    paddingVertical: 28,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  emptyCurrentText: { marginTop: 10, fontSize: 15, fontWeight: '600', color: '#334155' },
  historyEmpty: { fontSize: 14, color: '#94a3b8', paddingVertical: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  cardHighlight: {
    borderColor: '#2563eb',
    borderWidth: 1.5,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  cardRead: { opacity: 0.92 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  priorityPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  priorityText: { fontSize: 11, fontWeight: '800' },
  cardDate: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  cardTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  cardBody: { fontSize: 15, color: '#334155', lineHeight: 22 },
  taskActions: { marginTop: 14, gap: 8 },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 12,
  },
  completeBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  openTasksBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  openTasksBtnText: { color: '#2563eb', fontWeight: '700', fontSize: 14 },
  ackBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 12,
  },
  ackBtnBusy: { opacity: 0.7 },
  ackBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  readMark: { marginTop: 10, fontSize: 12, color: '#64748b', fontWeight: '600' },
  backBtn: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 14,
  },
  backBtnText: { color: pds.indigo, fontWeight: '700', fontSize: 15 },
});
