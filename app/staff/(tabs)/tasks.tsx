import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ScrollView,
  ActivityIndicator,
  Modal,
  Pressable,
  useWindowDimensions,
  Platform,
  BackHandler,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import {
  ASSIGNMENT_TASK_LABELS,
  ASSIGNMENT_PRIORITY_LABELS,
  ASSIGNMENT_STATUS_LABELS,
  STAFF_ROLE_LABELS,
} from '@/lib/staffAssignments';
import { isAssignmentMediaVideoUrl } from '@/lib/staffAssignmentMedia';
import { completeStaffAssignment, failStaffAssignment } from '@/lib/staffAssignmentComplete';
import { dispatchTaskCompletionNotify, dispatchTaskFailureNotify } from '@/lib/staffAssignmentCreate';
import { CachedImage } from '@/components/CachedImage';
import { TaskCompletionSheet } from '@/components/TaskCompletionSheet';
import { TaskFailureSheet } from '@/components/TaskFailureSheet';
import { PremiumTaskProgress } from '@/components/premium/PremiumTaskProgress';
import { PressableScale } from '@/components/premium/PressableScale';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { getFloatingTabBarTotalHeight } from '@/constants/floatingTabBarMetrics';
import { useStaffNewAssignmentHintStore } from '@/stores/staffNewAssignmentHintStore';
import { recordStaffAssignmentView, recordStaffTasksTabOpen } from '@/lib/staffAssignmentViews';

type Room = {
  id: string;
  room_number: string;
  floor: number | null;
  status: string;
};

type AssignmentRow = {
  id: string;
  title: string;
  body: string | null;
  task_type: string;
  priority: string;
  status: string;
  assigned_staff_id: string;
  room_ids: string[] | null;
  due_at: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  created_by_staff_id: string | null;
  attachment_urls?: string[] | null;
  completion_proof_urls?: string[] | null;
  completion_note?: string | null;
};

type CreatorMini = { id: string; full_name: string | null; role: string | null };
type AssigneeMini = { id: string; full_name: string | null; role: string | null; department: string | null };

const STAFF_TASKS_ASSIGNMENTS_CACHE_KEY = 'valoria_staff_tasks_assignments_v2';
const ASSIGNMENTS_CACHE_TTL_MS = 60_000;

type AssignmentsCacheBundle = {
  staffId: string;
  assignments: AssignmentRow[];
  creatorMap: Record<string, CreatorMini>;
  assigneeMap: Record<string, AssigneeMini>;
  roomMap: Record<string, Room>;
  updatedAt: number;
};

let assignmentsSessionCache: AssignmentsCacheBundle | null = null;

function applyAssignmentsBundle(
  bundle: AssignmentsCacheBundle,
  setAssignments: (v: AssignmentRow[]) => void,
  setCreatorMap: (v: Record<string, CreatorMini>) => void,
  setAssigneeMap: (v: Record<string, AssigneeMini>) => void,
  setRoomMap: (v: Record<string, Room>) => void
) {
  setAssignments(bundle.assignments);
  setCreatorMap(bundle.creatorMap);
  setAssigneeMap(bundle.assigneeMap);
  setRoomMap(bundle.roomMap);
}

type ScopeKey = 'mine' | 'all';
type TabKey = 'active' | 'completed' | 'failed';

const PRIORITY_POINTS: Record<string, number> = { urgent: 40, high: 30, normal: 20, low: 10 };

function getLevel(points: number, t: (k: string) => string): { name: string; min: number; max: number; icon: string } {
  if (points >= 1000) return { name: t('staffTasks_levelLegend'), min: 1000, max: 1500, icon: 'trophy' };
  if (points >= 600) return { name: t('staffTasks_levelMaster'), min: 600, max: 1000, icon: 'diamond' };
  if (points >= 300) return { name: t('staffTasks_levelExpert'), min: 300, max: 600, icon: 'star' };
  if (points >= 100) return { name: t('staffTasks_levelHardworker'), min: 100, max: 300, icon: 'flame' };
  return { name: t('staffTasks_levelBeginner'), min: 0, max: 100, icon: 'leaf' };
}

function dateLocale(lang: string): string {
  if (lang.startsWith('ar')) return 'ar-SA';
  if (lang.startsWith('tr')) return 'tr-TR';
  return 'en-US';
}

function formatDt(iso: string | null | undefined, locale: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(dateLocale(locale), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function StaffTasksTabScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const palette = usePersonelDesign();
  const loc = (i18n.language || 'tr').split('-')[0];
  const { focusAssignment } = useLocalSearchParams<{ focusAssignment?: string }>();
  const staff = useAuthStore((s) => s.staff);
  const markTasksTabOpened = useStaffNewAssignmentHintStore((s) => s.markTasksTabOpened);
  const newTasksCount = useStaffNewAssignmentHintStore((s) => s.pendingTasksTabCount);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [tab, setTab] = useState<TabKey>('active');
  const [scope, setScope] = useState<ScopeKey>('mine');
  const [assignments, setAssignments] = useState<AssignmentRow[]>(
    () => assignmentsSessionCache?.assignments ?? []
  );
  const [creatorMap, setCreatorMap] = useState<Record<string, CreatorMini>>(
    () => assignmentsSessionCache?.creatorMap ?? {}
  );
  const [assigneeMap, setAssigneeMap] = useState<Record<string, AssigneeMini>>(
    () => assignmentsSessionCache?.assigneeMap ?? {}
  );
  const [roomMap, setRoomMap] = useState<Record<string, Room>>(
    () => assignmentsSessionCache?.roomMap ?? {}
  );
  const [loading, setLoading] = useState(() => !(assignmentsSessionCache?.assignments.length));
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewIsVideo, setPreviewIsVideo] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<AssignmentRow | null>(null);
  const [completing, setCompleting] = useState(false);
  const [failTarget, setFailTarget] = useState<AssignmentRow | null>(null);
  const [failing, setFailing] = useState(false);

  const loadAssignments = useCallback(async () => {
    if (!staff?.id) return;
    try {
      const selectCols =
        'id, title, body, task_type, priority, status, assigned_staff_id, room_ids, due_at, created_at, started_at, completed_at, failed_at, failure_reason, created_by_staff_id, attachment_urls, completion_proof_urls, completion_note';
      let { data, error } = await supabase
        .from('staff_assignments')
        .select(selectCols)
        .order('created_at', { ascending: false })
        .limit(120);
      if (error && (error.message?.includes('attachment_urls') || error.message?.includes('completion_') || error.message?.includes('failure_') || error.code === 'PGRST204')) {
        const r2 = await supabase
          .from('staff_assignments')
          .select(
            'id, title, body, task_type, priority, status, assigned_staff_id, room_ids, due_at, created_at, started_at, completed_at, created_by_staff_id, attachment_urls'
          )
          .order('created_at', { ascending: false })
          .limit(120);
        data = r2.data;
        error = r2.error;
      }
      if (error) {
        setAssignments([]);
        setRoomMap({});
        setCreatorMap({});
        setAssigneeMap({});
        return;
      }
      const list = (data ?? []) as AssignmentRow[];
      let nextCreatorMap: Record<string, CreatorMini> = {};
      const creatorIds = [...new Set(list.map((a) => a.created_by_staff_id).filter(Boolean))] as string[];
      if (creatorIds.length) {
        const { data: creators } = await supabase
          .from('staff')
          .select('id, full_name, role')
          .in('id', creatorIds);
        nextCreatorMap = Object.fromEntries((creators ?? []).map((c: CreatorMini) => [c.id, c]));
      }
      let nextAssigneeMap: Record<string, AssigneeMini> = {};
      const assigneeIds = [...new Set(list.map((a) => a.assigned_staff_id).filter(Boolean))] as string[];
      if (assigneeIds.length) {
        const { data: assignees } = await supabase
          .from('staff')
          .select('id, full_name, role, department')
          .in('id', assigneeIds);
        nextAssigneeMap = Object.fromEntries((assignees ?? []).map((a: AssigneeMini) => [a.id, a]));
      }
      let nextRoomMap: Record<string, Room> = {};
      const ids = [...new Set(list.flatMap((a) => a.room_ids ?? []))];
      if (ids.length) {
        const { data: rdata } = await supabase.from('rooms').select('id, room_number, floor, status').in('id', ids);
        nextRoomMap = Object.fromEntries(((rdata ?? []) as Room[]).map((r) => [r.id, r]));
      }
      setAssignments(list);
      setCreatorMap(nextCreatorMap);
      setAssigneeMap(nextAssigneeMap);
      setRoomMap(nextRoomMap);
      const bundle: AssignmentsCacheBundle = {
        staffId: staff.id,
        assignments: list,
        creatorMap: nextCreatorMap,
        assigneeMap: nextAssigneeMap,
        roomMap: nextRoomMap,
        updatedAt: Date.now(),
      };
      assignmentsSessionCache = bundle;
      void AsyncStorage.setItem(STAFF_TASKS_ASSIGNMENTS_CACHE_KEY, JSON.stringify(bundle)).catch(() => {});
    } catch {
      setAssignments([]);
      setRoomMap({});
      setCreatorMap({});
      setAssigneeMap({});
    }
  }, [staff?.id]);

  const loadAssignmentsFirst = useCallback(async () => {
    await loadAssignments();
    setLoading(false);
    setRefreshing(false);
  }, [loadAssignments]);

  useEffect(() => {
    if (!staff?.id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const cached = assignmentsSessionCache;
    if (cached?.staffId === staff.id && cached.assignments.length > 0) {
      applyAssignmentsBundle(cached, setAssignments, setCreatorMap, setAssigneeMap, setRoomMap);
      setLoading(false);
    } else {
      (async () => {
        try {
          const raw = await AsyncStorage.getItem(STAFF_TASKS_ASSIGNMENTS_CACHE_KEY);
          if (!raw || cancelled) return;
          const parsed = JSON.parse(raw) as AssignmentsCacheBundle;
          if (parsed?.staffId !== staff.id || !Array.isArray(parsed.assignments)) return;
          assignmentsSessionCache = parsed;
          applyAssignmentsBundle(parsed, setAssignments, setCreatorMap, setAssigneeMap, setRoomMap);
        } catch {
          // bozuk cache açılışı engellemesin
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }
    const stale =
      !cached ||
      cached.staffId !== staff.id ||
      Date.now() - cached.updatedAt > ASSIGNMENTS_CACHE_TTL_MS;
    if (stale) {
      void loadAssignmentsFirst();
    } else {
      setLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [staff?.id, loadAssignmentsFirst]);

  useFocusEffect(
    useCallback(() => {
      if (!staff?.id) return;
      void markTasksTabOpened(staff.id);
      void recordStaffTasksTabOpen(staff.id, staff.organization_id);
    }, [staff?.id, staff?.organization_id, markTasksTabOpened])
  );

  useEffect(() => {
    if (!staff?.id || !expandedId) return;
    void recordStaffAssignmentView(expandedId, staff.id);
  }, [expandedId, staff?.id]);

  /** Sekmeye her dönüşte tam yenileme flicker üretir; cache + TTL yeterli */

  const focusId = Array.isArray(focusAssignment) ? focusAssignment[0] : focusAssignment;

  useEffect(() => {
    if (focusId && typeof focusId === 'string') {
      setTab('active');
      setExpandedId(focusId);
    }
  }, [focusId]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab !== 'active') {
        setTab('active');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [tab]);

  const onRefresh = () => {
    setRefreshing(true);
    void loadAssignmentsFirst();
  };

  const myAssignments = useMemo(
    () => assignments.filter((a) => a.assigned_staff_id === staff?.id),
    [assignments, staff?.id]
  );

  const scopedAssignments = useMemo(
    () => (scope === 'mine' ? myAssignments : assignments),
    [scope, myAssignments, assignments]
  );

  const activeAssignments = useMemo(
    () => scopedAssignments.filter((a) => a.status === 'pending' || a.status === 'in_progress'),
    [scopedAssignments]
  );
  const completedAssignments = useMemo(
    () => scopedAssignments.filter((a) => a.status === 'completed'),
    [scopedAssignments]
  );
  const failedAssignments = useMemo(
    () => scopedAssignments.filter((a) => a.status === 'failed'),
    [scopedAssignments]
  );
  const cancelledCount = useMemo(
    () => myAssignments.filter((a) => a.status === 'cancelled').length,
    [myAssignments]
  );
  const totalPoints = useMemo(
    () => myAssignments.filter((a) => a.status === 'completed').reduce((sum, a) => sum + (PRIORITY_POINTS[a.priority] ?? 10), 0),
    [myAssignments]
  );
  const level = useMemo(() => getLevel(totalPoints, t), [totalPoints, t]);
  const levelProgress = useMemo(() => {
    const range = level.max - level.min;
    if (range <= 0) return 1;
    return Math.min(1, (totalPoints - level.min) / range);
  }, [totalPoints, level]);

  const setAssignmentInProgress = async (row: AssignmentRow) => {
    if (!staff?.id) return;
    const { error } = await supabase
      .from('staff_assignments')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('assigned_staff_id', staff.id);
    if (error) Alert.alert(t('error'), error.message);
    else loadAssignments();
  };

  const submitTaskFailure = async (reason: string) => {
    if (!staff?.id || !failTarget) return;
    const failedAssignment = failTarget;
    setFailing(true);
    const result = await failStaffAssignment({
      assignmentId: failedAssignment.id,
      staffId: staff.id,
      reason,
    });
    setFailing(false);
    if (result.error) {
      Alert.alert(t('error'), result.error);
      return;
    }
    dispatchTaskFailureNotify({
      assignmentId: failedAssignment.id,
      title: failedAssignment.title,
      createdByStaffId: failedAssignment.created_by_staff_id,
      failedByStaffId: staff.id,
      failedByStaffName: staff.full_name ?? '',
      reason,
    });
    setFailTarget(null);
    await loadAssignments();
    Alert.alert(t('staffTasks_savedTitle'), t('staffTasks_taskFailedBody'));
  };

  const submitTaskCompletion = async (payload: { note?: string; proofUris: string[] }) => {
    if (!staff?.id || !completeTarget) return;
    const completedAssignment = completeTarget;
    setCompleting(true);
    const result = await completeStaffAssignment({
      assignmentId: completedAssignment.id,
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
      assignmentId: completedAssignment.id,
      title: completedAssignment.title,
      createdByStaffId: completedAssignment.created_by_staff_id,
      completedByStaffId: staff.id,
      completedByStaffName: staff.full_name ?? '',
    });
    setCompleteTarget(null);
    await loadAssignments();
    Alert.alert(t('staffTasks_savedTitle'), t('staffTasks_taskCompletedBody'));
  };

  const openPreview = (url: string) => {
    setPreviewIsVideo(isAssignmentMediaVideoUrl(url));
    setPreviewUri(url);
  };

  const openCount = useMemo(
    () => myAssignments.filter((a) => a.status === 'pending' || a.status === 'in_progress').length,
    [myAssignments]
  );

  const isMyTask = useCallback(
    (row: AssignmentRow) => row.assigned_staff_id === staff?.id,
    [staff?.id]
  );

  const listBottomPad = insets.bottom + getFloatingTabBarTotalHeight(insets) + 24;

  const tasksListHeader = useMemo(
    () => (
      <View style={styles.listHeader}>
        <View style={styles.dashboardCard}>
          <View style={styles.dashRow}>
            <View style={styles.dashPointsCol}>
              <View style={styles.dashPointsCircle}>
                <Ionicons name={level.icon as any} size={22} color="#fff" />
              </View>
              <View>
                <Text style={styles.dashPointsValue}>{totalPoints}</Text>
                <Text style={styles.dashPointsLabel}>{t('staffTasks_totalPoints')}</Text>
              </View>
            </View>
            <View style={styles.dashLevelCol}>
              <Text style={styles.dashLevelName}>{level.name}</Text>
              <View style={styles.dashLevelBarBg}>
                <View style={[styles.dashLevelBarFill, { width: `${Math.round(levelProgress * 100)}%` }]} />
              </View>
              <Text style={styles.dashLevelRange}>
                {level.min} / {level.max}
              </Text>
            </View>
          </View>
          <View style={styles.dashStatsRow}>
            <View style={styles.dashStatItem}>
              <Text style={styles.dashStatNum}>{activeAssignments.length}</Text>
              <Text style={styles.dashStatLabel}>{t('staffTasks_active')}</Text>
            </View>
            <View style={styles.dashStatDivider} />
            <View style={styles.dashStatItem}>
              <Text style={[styles.dashStatNum, { color: theme.colors.success }]}>{completedAssignments.length}</Text>
              <Text style={styles.dashStatLabel}>{t('staffTasks_completed')}</Text>
            </View>
            <View style={styles.dashStatDivider} />
            <View style={styles.dashStatItem}>
              <Text style={[styles.dashStatNum, { color: theme.colors.textMuted }]}>{cancelledCount}</Text>
              <Text style={styles.dashStatLabel}>{t('staffTasks_cancelledCount')}</Text>
            </View>
            <View style={styles.dashStatDivider} />
            <View style={styles.dashStatItem}>
              <Text style={[styles.dashStatNum, { color: theme.colors.primary }]}>{myAssignments.length}</Text>
              <Text style={styles.dashStatLabel}>{t('staffTasks_statsTitle')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.scopeBar}>
          <TouchableOpacity
            style={[styles.scopeChip, scope === 'mine' && styles.scopeChipOn]}
            onPress={() => setScope('mine')}
            activeOpacity={0.85}
          >
            <Ionicons name="person-outline" size={16} color={scope === 'mine' ? theme.colors.primary : theme.colors.textMuted} />
            <Text style={[styles.scopeChipText, scope === 'mine' && styles.scopeChipTextOn]}>{t('staffTasks_scopeMine')}</Text>
            {openCount > 0 ? (
              <View style={styles.scopeBadge}>
                <Text style={styles.scopeBadgeText}>{openCount > 9 ? '9+' : openCount}</Text>
              </View>
            ) : null}
            {newTasksCount > 0 ? <View style={styles.scopeNewDot} /> : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scopeChip, scope === 'all' && styles.scopeChipOn]}
            onPress={() => setScope('all')}
            activeOpacity={0.85}
          >
            <Ionicons name="people-outline" size={16} color={scope === 'all' ? theme.colors.primary : theme.colors.textMuted} />
            <Text style={[styles.scopeChipText, scope === 'all' && styles.scopeChipTextOn]}>{t('staffTasks_scopeAll')}</Text>
          </TouchableOpacity>
        </View>
        {scope === 'all' ? <Text style={styles.scopeHint}>{t('staffTasks_allScopeHint')}</Text> : null}

        <TouchableOpacity
          style={styles.opsBanner}
          activeOpacity={0.88}
          onPress={() => router.push('/staff/operations')}
        >
          <Ionicons name="pulse-outline" size={22} color={theme.colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.opsBannerTitle}>Operasyon görevleri</Text>
            <Text style={styles.opsBannerSub}>Zamanlı checklist ve teyit (mutfak, HK, resepsiyon)</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, tab === 'active' && styles.tabOn]}
            onPress={() => setTab('active')}
            activeOpacity={0.85}
          >
            <Ionicons name="flash-outline" size={18} color={tab === 'active' ? theme.colors.text : theme.colors.textMuted} />
            <Text style={[styles.tabText, tab === 'active' && styles.tabTextOn]}>{t('staffTasks_activeTab')}</Text>
            {openCount > 0 ? (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{openCount > 9 ? '9+' : openCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'completed' && styles.tabOn]}
            onPress={() => setTab('completed')}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-done-outline" size={18} color={tab === 'completed' ? theme.colors.text : theme.colors.textMuted} />
            <Text style={[styles.tabText, tab === 'completed' && styles.tabTextOn]}>{t('staffTasks_completedTab')}</Text>
            {completedAssignments.length > 0 ? (
              <View style={[styles.tabBadge, styles.tabBadgeSuccess]}>
                <Text style={styles.tabBadgeText}>{completedAssignments.length > 99 ? '99+' : completedAssignments.length}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'failed' && styles.tabOn]}
            onPress={() => setTab('failed')}
            activeOpacity={0.85}
          >
            <Ionicons name="alert-circle-outline" size={18} color={tab === 'failed' ? theme.colors.text : theme.colors.textMuted} />
            <Text style={[styles.tabText, tab === 'failed' && styles.tabTextOn]}>{t('staffTasks_failedTab')}</Text>
            {failedAssignments.length > 0 ? (
              <View style={[styles.tabBadge, styles.tabBadgeFailed]}>
                <Text style={styles.tabBadgeText}>{failedAssignments.length > 99 ? '99+' : failedAssignments.length}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
      </View>
    ),
    [
      activeAssignments.length,
      cancelledCount,
      completedAssignments.length,
      failedAssignments.length,
      level,
      levelProgress,
      myAssignments.length,
      openCount,
      newTasksCount,
      router,
      scope,
      t,
      tab,
      totalPoints,
    ]
  );

  if (!staff?.id) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Oturum gerekli.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.pageBg }]}>
      <Modal visible={!!previewUri} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)} statusBarTranslucent>
        <Pressable style={styles.previewOverlay} onPress={() => setPreviewUri(null)}>
          <Pressable
            style={[styles.previewInner, { paddingTop: insets.top + 8, maxHeight: height - insets.top - insets.bottom }]}
            onPress={(e) => e.stopPropagation()}
          >
            <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewUri(null)} hitSlop={12}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            {previewUri && previewIsVideo ? (
              <Video
                source={{ uri: previewUri }}
                style={{ width: width - 24, height: (height - insets.top - insets.bottom) * 0.55 }}
                resizeMode={ResizeMode.CONTAIN}
                useNativeControls
                shouldPlay
              />
            ) : previewUri ? (
              <CachedImage uri={previewUri} style={{ width: width - 24, height: (height - insets.top - insets.bottom) * 0.62 }} contentFit="contain" />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <TaskCompletionSheet
        visible={!!completeTarget}
        taskTitle={completeTarget?.title ?? ''}
        saving={completing}
        onClose={() => setCompleteTarget(null)}
        onSubmit={submitTaskCompletion}
      />

      <TaskFailureSheet
        visible={!!failTarget}
        taskTitle={failTarget?.title ?? ''}
        saving={failing}
        onClose={() => setFailTarget(null)}
        onSubmit={submitTaskFailure}
      />

      {tab === 'active' ? (
        <FlatList
          style={styles.list}
          data={activeAssignments}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={tasksListHeader}
          contentContainerStyle={[styles.listPad, { paddingBottom: listBottomPad }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="checkmark-done-outline" size={36} color={theme.colors.success} />
              </View>
              <Text style={styles.emptyTitle}>{t('staffTasks_emptyTitle')}</Text>
              <Text style={styles.emptySub}>{t('staffTasks_emptySub')}</Text>
            </View>
          }
          renderItem={({ item: r }) => {
            const isOpen = r.status === 'pending' || r.status === 'in_progress';
            const expanded = expandedId === r.id || focusId === r.id;
            const roomsFor = (r.room_ids ?? []).map((id) => roomMap[id]).filter(Boolean) as Room[];
            const creator = r.created_by_staff_id ? creatorMap[r.created_by_staff_id] : null;
            const assignee = assigneeMap[r.assigned_staff_id];
            const canAct = isMyTask(r);
            const urls = (r.attachment_urls ?? []).filter(Boolean);
            const prioColor =
              r.priority === 'urgent'
                ? theme.colors.error
                : r.priority === 'high'
                  ? '#c05621'
                  : r.priority === 'normal'
                    ? theme.colors.primary
                    : theme.colors.textMuted;
            const statusAccent = r.status === 'in_progress' ? '#3b82f6' : '#f59e0b';
            const progressPct =
              r.status === 'in_progress' ? (r.started_at ? 70 : 40) : r.status === 'pending' ? 15 : 100;
            const assigneeLabel =
              r.status === 'in_progress' ? staff?.full_name ?? 'Siz' : null;

            return (
              <PressableScale>
              <View style={[styles.card, { borderLeftColor: statusAccent, borderLeftWidth: 4 }, expanded && styles.cardHighlight]}>
                <TouchableOpacity activeOpacity={0.9} onPress={() => setExpandedId((x) => (x === r.id ? null : r.id))}>
                  <View style={styles.cardTop}>
                    <View style={[styles.typePill, { borderColor: prioColor, backgroundColor: prioColor + '12' }]}>
                      <Text style={[styles.typePillText, { color: prioColor }]}>
                        {ASSIGNMENT_TASK_LABELS[r.task_type] ?? r.task_type}
                      </Text>
                    </View>
                    <View style={[styles.statePill, { backgroundColor: statusAccent + '18' }]}>
                      <View style={[styles.statusDot, { backgroundColor: statusAccent }]} />
                      <Text style={[styles.statePillText, { color: statusAccent }]}>{ASSIGNMENT_STATUS_LABELS[r.status] ?? r.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle}>{r.title}</Text>
                  {isOpen ? (
                    <PremiumTaskProgress
                      percent={progressPct}
                      accentColor={statusAccent}
                      assigneeLabel={assigneeLabel}
                    />
                  ) : null}
                  {creator ? (
                    <View style={styles.assignerRow}>
                      <View style={styles.assignerAvatar}>
                        <Ionicons name="person" size={14} color={theme.colors.primary} />
                      </View>
                      <Text style={styles.assignerText}>
                        <Text style={styles.assignerLabel}>{t('staffTasks_assigner')} </Text>
                        {creator.full_name ?? t('staffTasks_managerDefault')}
                        {creator.role ? ` · ${STAFF_ROLE_LABELS[creator.role] ?? creator.role}` : ''}
                      </Text>
                    </View>
                  ) : null}
                  {scope === 'all' && assignee ? (
                    <View style={styles.assignerRow}>
                      <View style={[styles.assignerAvatar, { backgroundColor: theme.colors.primary + '18' }]}>
                        <Ionicons name="person-circle-outline" size={14} color={theme.colors.primary} />
                      </View>
                      <Text style={styles.assignerText}>
                        <Text style={styles.assignerLabel}>{t('staffTasks_assignedStaff')}: </Text>
                        {assignee.full_name ?? '—'}
                        {assignee.department ? ` · ${assignee.department}` : ''}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.timeline}>
                    <View style={styles.tlRow}>
                      <Ionicons name="calendar-outline" size={14} color={theme.colors.textMuted} />
                      <Text style={styles.tlText}>{t('staffTasks_createdAt', { date: formatDt(r.created_at, loc) })}</Text>
                    </View>
                    {r.due_at ? (
                      <View style={styles.tlRow}>
                        <Ionicons name="alarm-outline" size={14} color={theme.colors.error} />
                        <Text style={[styles.tlText, styles.tlDue]}>{t('staffTasks_dueAt', { date: formatDt(r.due_at, loc) })}</Text>
                      </View>
                    ) : null}
                    {r.started_at ? (
                      <View style={styles.tlRow}>
                        <Ionicons name="play-outline" size={14} color="#3b82f6" />
                        <Text style={styles.tlText}>{t('staffTasks_startedAt', { date: formatDt(r.started_at, loc) })}</Text>
                      </View>
                    ) : null}
                  </View>
                  {roomsFor.length > 0 && (
                    <View style={styles.roomChips}>
                      <Ionicons name="bed-outline" size={16} color={theme.colors.primary} style={{ marginRight: 6 }} />
                      {roomsFor.map((rm) => (
                        <View key={rm.id} style={styles.roomChip}>
                          <Text style={styles.roomChipText}>{rm.room_number}</Text>
                          {rm.floor != null && (
                            <Text style={styles.roomChipFloor}>{t('staffTasks_roomFloorShort', { floor: rm.floor })}</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                  {urls.length > 0 && (
                    <View style={styles.mediaRow}>
                      <Text style={styles.mediaLabel}>{t('staffTasks_taskAttachments')}</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {urls.map((url) => {
                          const vid = isAssignmentMediaVideoUrl(url);
                          return (
                            <TouchableOpacity key={url} style={styles.mediaThumbOuter} onPress={() => openPreview(url)} activeOpacity={0.88}>
                              {vid ? (
                                <View>
                                  <Video source={{ uri: url }} style={styles.mediaThumb} resizeMode={ResizeMode.COVER} shouldPlay={false} isMuted />
                                  <View style={styles.playBadge}>
                                    <Ionicons name="play-circle" size={32} color="rgba(255,255,255,0.95)" />
                                  </View>
                                </View>
                              ) : (
                                <CachedImage uri={url} style={styles.mediaThumb} contentFit="cover" />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}
                  {r.body ? (
                    <Text style={styles.cardBody} numberOfLines={expanded ? undefined : 3}>{r.body}</Text>
                  ) : null}
                  <View style={styles.cardMetaRow}>
                    <View style={[styles.prioChip, { backgroundColor: prioColor + '15' }]}>
                      <Ionicons name="flag" size={12} color={prioColor} />
                      <Text style={[styles.prioChipText, { color: prioColor }]}>
                        {ASSIGNMENT_PRIORITY_LABELS[r.priority] ?? r.priority}
                      </Text>
                    </View>
                    <View style={styles.pointsPreviewChip}>
                      <Ionicons name="star" size={12} color="#f59e0b" />
                      <Text style={styles.pointsPreviewText}>
                        {t('staffTasks_pointsEarned', { points: PRIORITY_POINTS[r.priority] ?? 10 })}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
                {isOpen && canAct ? (
                  <View style={styles.actions}>
                    {r.status === 'pending' ? (
                      <TouchableOpacity style={styles.btnPrimary} onPress={() => setAssignmentInProgress(r)} activeOpacity={0.85}>
                        <Ionicons name="play" size={16} color="#fff" />
                        <Text style={styles.btnPrimaryText}>{t('staffTasks_startedBtn')}</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity style={styles.btnSuccess} onPress={() => setCompleteTarget(r)} activeOpacity={0.85}>
                      <Ionicons name="checkmark-done-outline" size={18} color="#fff" />
                      <Text style={styles.btnSuccessText}>{t('staffTasks_completeBtn')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.btnFail} onPress={() => setFailTarget(r)} activeOpacity={0.85}>
                      <Ionicons name="close-circle-outline" size={18} color={theme.colors.error} />
                      <Text style={styles.btnFailText}>{t('staffTasks_couldNotBtn')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
              </PressableScale>
            );
          }}
        />
      ) : tab === 'completed' ? (
        <FlatList
          style={styles.list}
          data={completedAssignments}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={tasksListHeader}
          contentContainerStyle={[styles.listPad, { paddingBottom: listBottomPad }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <View style={[styles.emptyIconCircle, { backgroundColor: theme.colors.primary + '15' }]}>
                <Ionicons name="trophy-outline" size={36} color={theme.colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>{t('staffTasks_completedEmptyTitle')}</Text>
              <Text style={styles.emptySub}>{t('staffTasks_completedEmptySub')}</Text>
            </View>
          }
          renderItem={({ item: r }) => {
            const expanded = expandedId === r.id;
            const roomsFor = (r.room_ids ?? []).map((id) => roomMap[id]).filter(Boolean) as Room[];
            const creator = r.created_by_staff_id ? creatorMap[r.created_by_staff_id] : null;
            const urls = (r.attachment_urls ?? []).filter(Boolean);
            const proofUrls = (r.completion_proof_urls ?? []).filter(Boolean);
            const pts = PRIORITY_POINTS[r.priority] ?? 10;
            return (
              <View style={[styles.card, styles.cardCompleted]}>
                <TouchableOpacity activeOpacity={0.9} onPress={() => setExpandedId((x) => (x === r.id ? null : r.id))}>
                  <View style={styles.cardTop}>
                    <View style={styles.completedTypePill}>
                      <Text style={styles.completedTypePillText}>
                        {ASSIGNMENT_TASK_LABELS[r.task_type] ?? r.task_type}
                      </Text>
                    </View>
                    <View style={styles.earnedPointsBadge}>
                      <Ionicons name="star" size={14} color="#f59e0b" />
                      <Text style={styles.earnedPointsText}>{t('staffTasks_pointsEarned', { points: pts })}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle}>{r.title}</Text>
                  {creator ? (
                    <View style={styles.assignerRow}>
                      <View style={styles.assignerAvatar}>
                        <Ionicons name="person" size={14} color={theme.colors.primary} />
                      </View>
                      <Text style={styles.assignerText}>
                        <Text style={styles.assignerLabel}>{t('staffTasks_assigner')} </Text>
                        {creator.full_name ?? t('staffTasks_managerDefault')}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.timeline}>
                    <View style={styles.tlRow}>
                      <Ionicons name="calendar-outline" size={14} color={theme.colors.textMuted} />
                      <Text style={styles.tlText}>{t('staffTasks_createdAt', { date: formatDt(r.created_at, loc) })}</Text>
                    </View>
                    {r.completed_at ? (
                      <View style={styles.tlRow}>
                        <Ionicons name="checkmark-circle" size={14} color={theme.colors.success} />
                        <Text style={[styles.tlText, { color: theme.colors.success, fontWeight: '600' }]}>
                          {t('staffTasks_completedAt', { date: formatDt(r.completed_at, loc) })}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {roomsFor.length > 0 && (
                    <View style={styles.roomChips}>
                      <Ionicons name="bed-outline" size={16} color={theme.colors.primary} style={{ marginRight: 6 }} />
                      {roomsFor.map((rm) => (
                        <View key={rm.id} style={styles.roomChip}>
                          <Text style={styles.roomChipText}>{rm.room_number}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {proofUrls.length > 0 && (
                    <View style={styles.mediaRow}>
                      <Text style={styles.mediaLabel}>{t('staffTasks_completionProof')}</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {proofUrls.map((url) => (
                          <TouchableOpacity key={url} style={styles.mediaThumbOuter} onPress={() => openPreview(url)} activeOpacity={0.88}>
                            <CachedImage uri={url} style={styles.mediaThumb} contentFit="cover" />
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                  {r.completion_note?.trim() ? (
                    <View style={styles.completionNoteBox}>
                      <Text style={styles.completionNoteLabel}>{t('staffTasks_staffNote')}</Text>
                      <Text style={styles.completionNoteText}>{r.completion_note.trim()}</Text>
                    </View>
                  ) : null}
                  {expanded && urls.length > 0 ? (
                    <View style={styles.mediaRow}>
                      <Text style={styles.mediaLabel}>{t('staffTasks_taskAttachments')}</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {urls.map((url) => {
                          const vid = isAssignmentMediaVideoUrl(url);
                          return (
                            <TouchableOpacity key={url} style={styles.mediaThumbOuter} onPress={() => openPreview(url)} activeOpacity={0.88}>
                              {vid ? (
                                <View>
                                  <Video source={{ uri: url }} style={styles.mediaThumb} resizeMode={ResizeMode.COVER} shouldPlay={false} isMuted />
                                  <View style={styles.playBadge}>
                                    <Ionicons name="play-circle" size={32} color="rgba(255,255,255,0.95)" />
                                  </View>
                                </View>
                              ) : (
                                <CachedImage uri={url} style={styles.mediaThumb} contentFit="cover" />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  ) : null}
                  {expanded && r.body ? (
                    <Text style={styles.cardBody}>{r.body}</Text>
                  ) : null}
                </TouchableOpacity>
              </View>
            );
          }}
        />
      ) : tab === 'failed' ? (
        <FlatList
          style={styles.list}
          data={failedAssignments}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={tasksListHeader}
          contentContainerStyle={[styles.listPad, { paddingBottom: listBottomPad }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <View style={[styles.emptyIconCircle, { backgroundColor: theme.colors.error + '15' }]}>
                <Ionicons name="alert-circle-outline" size={36} color={theme.colors.error} />
              </View>
              <Text style={styles.emptyTitle}>{t('staffTasks_failedEmptyTitle')}</Text>
              <Text style={styles.emptySub}>{t('staffTasks_failedEmptySub')}</Text>
            </View>
          }
          renderItem={({ item: r }) => {
            const expanded = expandedId === r.id;
            const assignee = assigneeMap[r.assigned_staff_id];
            return (
              <View style={[styles.card, styles.cardFailed]}>
                <TouchableOpacity activeOpacity={0.9} onPress={() => setExpandedId((x) => (x === r.id ? null : r.id))}>
                  <View style={styles.cardTop}>
                    <View style={styles.failedTypePill}>
                      <Text style={styles.failedTypePillText}>
                        {ASSIGNMENT_TASK_LABELS[r.task_type] ?? r.task_type}
                      </Text>
                    </View>
                    <View style={[styles.statePill, { backgroundColor: theme.colors.error + '18' }]}>
                      <Text style={[styles.statePillText, { color: theme.colors.error }]}>
                        {ASSIGNMENT_STATUS_LABELS.failed}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle}>{r.title}</Text>
                  {scope === 'all' && assignee ? (
                    <Text style={styles.assignerText}>
                      {t('staffTasks_assignedStaff')}: {assignee.full_name ?? '—'}
                    </Text>
                  ) : null}
                  {r.failed_at ? (
                    <Text style={styles.tlText}>
                      {t('staffTasks_failedAt', { date: formatDt(r.failed_at, loc) })}
                    </Text>
                  ) : null}
                  {r.failure_reason?.trim() ? (
                    <View style={styles.failureReasonBox}>
                      <Text style={styles.failureReasonLabel}>{t('staffTasks_failureReason')}</Text>
                      <Text style={styles.failureReasonText}>{r.failure_reason.trim()}</Text>
                    </View>
                  ) : null}
                  {expanded && r.body ? <Text style={styles.cardBody}>{r.body}</Text> : null}
                </TouchableOpacity>
              </View>
            );
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f0f2f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { color: theme.colors.textMuted, fontSize: 16 },
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  previewInner: { alignItems: 'center', width: '100%' },
  previewClose: { alignSelf: 'flex-end', marginRight: 16, marginBottom: 12, padding: 8 },

  list: { flex: 1 },
  listHeader: { paddingBottom: 4 },

  /* ── Dashboard ── */
  dashboardCard: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#1a1d21',
    borderRadius: 20,
    padding: 18,
    ...theme.shadows.md,
  },
  dashRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  dashPointsCol: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dashPointsCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#b8860b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashPointsValue: { fontSize: 28, fontWeight: '900', color: '#fff' },
  dashPointsLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.55)', marginTop: 1 },
  dashLevelCol: { flex: 1, alignItems: 'flex-end' },
  dashLevelName: { fontSize: 14, fontWeight: '800', color: '#d4a84b', marginBottom: 6 },
  dashLevelBarBg: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  dashLevelBarFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#d4a84b',
  },
  dashLevelRange: { fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 4, alignSelf: 'flex-end' },
  dashStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  dashStatItem: { alignItems: 'center' },
  dashStatNum: { fontSize: 20, fontWeight: '800', color: '#fff' },
  dashStatLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  dashStatDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.1)' },

  opsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#ebf8ff',
    borderWidth: 1,
    borderColor: '#bee3f8',
  },
  opsBannerTitle: { fontSize: 15, fontWeight: '700', color: '#1a365d' },
  opsBannerSub: { fontSize: 12, color: '#4a5568', marginTop: 2 },

  /* ── Tab Bar ── */
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#e8eaed',
    borderRadius: 14,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 11,
  },
  tabOn: {
    backgroundColor: '#fff',
    ...theme.shadows.sm,
  },
  tabText: { fontSize: 13, fontWeight: '700', color: theme.colors.textMuted },
  tabTextOn: { color: theme.colors.text },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabBadgeSuccess: { backgroundColor: theme.colors.success },
  tabBadgeFailed: { backgroundColor: theme.colors.error },
  tabBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  scopeBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 8,
    gap: 8,
  },
  scopeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    position: 'relative',
  },
  scopeChipOn: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '12',
  },
  scopeChipText: { fontSize: 13, fontWeight: '700', color: theme.colors.textMuted },
  scopeChipTextOn: { color: theme.colors.primary },
  scopeBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  scopeBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  scopeNewDot: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.error,
    borderWidth: 2,
    borderColor: '#fff',
  },
  scopeHint: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginHorizontal: 16,
    marginBottom: 8,
    lineHeight: 17,
  },

  /* ── Lists ── */
  listPad: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 16 },
  emptyBox: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24 },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.success + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginTop: 16 },
  emptySub: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },

  /* ── Task Card ── */
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    ...theme.shadows.sm,
    overflow: 'hidden',
  },
  cardHighlight: { borderColor: theme.colors.primary, borderWidth: 2 },
  cardCompleted: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.success,
    backgroundColor: '#fafffe',
  },
  cardFailed: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.error,
    backgroundColor: '#fffafa',
  },
  failedTypePill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: theme.colors.error + '15',
  },
  failedTypePillText: { fontSize: 11, fontWeight: '800', color: theme.colors.error },
  failureReasonBox: {
    marginTop: 10,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.error + '0a',
    borderWidth: 1,
    borderColor: theme.colors.error + '25',
  },
  failureReasonLabel: { fontSize: 11, fontWeight: '800', color: theme.colors.error, marginBottom: 4 },
  failureReasonText: { fontSize: 13, color: theme.colors.text, lineHeight: 19 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  typePill: {
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  typePillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  completedTypePill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: theme.colors.success + '15',
  },
  completedTypePillText: { fontSize: 11, fontWeight: '800', color: theme.colors.success },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statePillText: { fontSize: 11, fontWeight: '800' },
  earnedPointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  earnedPointsText: { fontSize: 12, fontWeight: '800', color: '#92400e' },
  cardTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text, marginBottom: 8, lineHeight: 23 },
  assignerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  assignerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignerText: { flex: 1, fontSize: 13, color: theme.colors.textSecondary, lineHeight: 18 },
  assignerLabel: { fontWeight: '700', color: theme.colors.text },
  timeline: { gap: 5, marginBottom: 10 },
  tlRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tlText: { fontSize: 12, color: theme.colors.textSecondary },
  tlDue: { color: theme.colors.error, fontWeight: '700' },
  roomChips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 10, gap: 6 },
  roomChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary + '12',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  roomChipText: { fontSize: 13, fontWeight: '800', color: theme.colors.primaryDark },
  roomChipFloor: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: '600' },
  mediaRow: { marginBottom: 12 },
  mediaLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  mediaThumbOuter: { marginRight: 8, borderRadius: 10, overflow: 'hidden' },
  mediaThumb: { width: 80, height: 80, backgroundColor: theme.colors.borderLight, borderRadius: 10 },
  playBadge: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  cardBody: { fontSize: 14, lineHeight: 20, color: theme.colors.textSecondary, marginBottom: 10 },
  cardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  prioChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  prioChipText: { fontSize: 11, fontWeight: '700' },
  pointsPreviewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#fef3c7',
  },
  pointsPreviewText: { fontSize: 11, fontWeight: '700', color: '#92400e' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  btnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnSuccess: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.colors.success,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  btnSuccessText: { color: '#fff', fontWeight: '800', fontSize: 13, flexShrink: 1, textAlign: 'center' },
  btnFail: {
    flexBasis: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: theme.colors.error,
    paddingVertical: 11,
    borderRadius: 12,
  },
  btnFailText: { color: theme.colors.error, fontWeight: '800', fontSize: 13 },
  completionNoteBox: {
    marginBottom: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.success + '0a',
    borderWidth: 1,
    borderColor: theme.colors.success + '25',
  },
  completionNoteLabel: { fontSize: 11, fontWeight: '800', color: theme.colors.success, marginBottom: 4 },
  completionNoteText: { fontSize: 13, color: theme.colors.text, lineHeight: 19 },
});
