import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Linking,
  BackHandler,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { guestDisplayName } from '@/lib/guestDisplayName';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import {
  ASSIGNMENT_TASK_LABELS,
  ASSIGNMENT_PRIORITY_LABELS,
  ASSIGNMENT_STATUS_LABELS,
  STAFF_ROLE_LABELS,
} from '@/lib/staffAssignments';
import { isAssignmentMediaVideoUrl } from '@/lib/staffAssignmentMedia';
import { completeStaffAssignment } from '@/lib/staffAssignmentComplete';
import { CachedImage } from '@/components/CachedImage';
import { TaskCompletionSheet } from '@/components/TaskCompletionSheet';
import {
  parseRoomStayHistoryRpc,
  sortRoomStayHistoryRows,
  type RoomStayHistoryGuest,
  type RoomStayHistoryRow,
} from '@/lib/roomStayHistory';
import {
  buildContractHtml,
  fetchContractPdfAppearance,
  loadGuestForPdf,
  printContractGuest,
  shareContractPdf,
} from '@/lib/contractPdf';
import { roomStatusLabel, guestStayStatusLabel, idTypeLabel, genderLabel } from '@/lib/i18nLookup';

type RoomStatus = 'available' | 'occupied' | 'cleaning' | 'maintenance' | 'out_of_order';

type Room = {
  id: string;
  room_number: string;
  floor: number | null;
  status: RoomStatus;
};

type AssignmentRow = {
  id: string;
  title: string;
  body: string | null;
  task_type: string;
  priority: string;
  status: string;
  room_ids: string[] | null;
  due_at: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_by_staff_id: string | null;
  attachment_urls?: string[] | null;
  completion_proof_urls?: string[] | null;
  completion_note?: string | null;
};

type CreatorMini = { id: string; full_name: string | null; role: string | null };

const STAFF_TASKS_ASSIGNMENTS_CACHE_KEY = 'valoria_staff_tasks_assignments_v1';
const ASSIGNMENTS_CACHE_TTL_MS = 60_000;

type AssignmentsCacheBundle = {
  staffId: string;
  assignments: AssignmentRow[];
  creatorMap: Record<string, CreatorMini>;
  roomMap: Record<string, Room>;
  updatedAt: number;
};

let assignmentsSessionCache: AssignmentsCacheBundle | null = null;
let roomsSessionCache: { rooms: Room[]; counts: Record<string, number>; updatedAt: number } | null = null;

function applyAssignmentsBundle(
  bundle: AssignmentsCacheBundle,
  setAssignments: (v: AssignmentRow[]) => void,
  setCreatorMap: (v: Record<string, CreatorMini>) => void,
  setRoomMap: (v: Record<string, Room>) => void
) {
  setAssignments(bundle.assignments);
  setCreatorMap(bundle.creatorMap);
  setRoomMap(bundle.roomMap);
}

const statusLabel = (s: RoomStatus) => roomStatusLabel(s);

const STATUS_STYLES: Record<RoomStatus, { borderColor: string; backgroundColor: string }> = {
  available: { borderColor: theme.colors.success, backgroundColor: theme.colors.success + '18' },
  occupied: { borderColor: '#ed8936', backgroundColor: '#fffaf0' },
  cleaning: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryLight + '20' },
  maintenance: { borderColor: theme.colors.error, backgroundColor: theme.colors.error + '18' },
  out_of_order: { borderColor: theme.colors.textMuted, backgroundColor: theme.colors.borderLight },
};

const STATUS_OPTIONS: RoomStatus[] = ['available', 'occupied', 'cleaning', 'maintenance', 'out_of_order'];

type TabKey = 'active' | 'completed' | 'rooms';

const PRIORITY_POINTS: Record<string, number> = { urgent: 40, high: 30, normal: 20, low: 10 };

function getLevel(points: number, t: (k: string) => string): { name: string; min: number; max: number; icon: string } {
  if (points >= 1000) return { name: t('staffTasks_levelLegend'), min: 1000, max: 1500, icon: 'trophy' };
  if (points >= 600) return { name: t('staffTasks_levelMaster'), min: 600, max: 1000, icon: 'diamond' };
  if (points >= 300) return { name: t('staffTasks_levelExpert'), min: 300, max: 600, icon: 'star' };
  if (points >= 100) return { name: t('staffTasks_levelHardworker'), min: 100, max: 300, icon: 'flame' };
  return { name: t('staffTasks_levelBeginner'), min: 0, max: 100, icon: 'leaf' };
}

const GUEST_FIELD_KEYS: (keyof RoomStayHistoryGuest)[] = [
  'full_name',
  'phone',
  'email',
  'nationality',
  'id_number',
  'id_type',
  'status',
  'check_in_at',
  'check_out_at',
  'nights_count',
  'room_type',
  'adults',
  'children',
  'date_of_birth',
  'gender',
  'address',
  'photo_url',
  'created_at',
  'total_amount_net',
  'vat_amount',
  'accommodation_tax_amount',
];

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

function formatMoney(v: number | string | null | undefined, locale: string) {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (Number.isNaN(n)) return String(v);
  return new Intl.NumberFormat(dateLocale(locale), { style: 'currency', currency: 'TRY' }).format(n);
}

export default function StaffTasksTabScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const loc = (i18n.language || 'tr').split('-')[0];

  const guestFieldList = useMemo(
    () => GUEST_FIELD_KEYS.map((key) => ({ key, label: t(`guestField_${key}`) })),
    [t, i18n.language]
  );

  const guestFieldDisplay = useCallback(
    (key: keyof RoomStayHistoryGuest, raw: unknown): string => {
      if (raw === null || raw === undefined) return '—';
      if (key === 'status') return guestStayStatusLabel(String(raw));
      if (key === 'id_type') return idTypeLabel(String(raw));
      if (key === 'gender') return genderLabel(String(raw));
      if (key === 'check_in_at' || key === 'check_out_at' || key === 'created_at')
        return formatDt(String(raw), loc);
      if (key === 'date_of_birth') {
        try {
          return new Date(String(raw)).toLocaleDateString(dateLocale(loc));
        } catch {
          return String(raw);
        }
      }
      if (key === 'total_amount_net' || key === 'vat_amount' || key === 'accommodation_tax_amount')
        return formatMoney(raw as number | string, loc);
      return String(raw);
    },
    [loc]
  );

  const roomStayListTitle = useCallback(
    (row: RoomStayHistoryRow) =>
      row.guest
        ? guestDisplayName(row.guest.full_name, t('staffTasks_guestDefault'))
        : t('staffTasks_noGuestRecord'),
    [t]
  );

  const roomStayListSubtitle = useCallback(
    (row: RoomStayHistoryRow) => {
      if (row.guest?.check_out_at)
        return t('staffTasks_checkOutLine', { date: formatDt(row.guest.check_out_at, loc) });
      if (row.guest?.check_in_at)
        return t('staffTasks_checkInLine', { date: formatDt(row.guest.check_in_at, loc) });
      return t('staffTasks_contractAcceptedLine', { date: formatDt(row.accepted_at, loc) });
    },
    [t, loc]
  );
  const { focusAssignment } = useLocalSearchParams<{ focusAssignment?: string }>();
  const staff = useAuthStore((s) => s.staff);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [tab, setTab] = useState<TabKey>('active');
  const [assignments, setAssignments] = useState<AssignmentRow[]>(
    () => assignmentsSessionCache?.assignments ?? []
  );
  const [creatorMap, setCreatorMap] = useState<Record<string, CreatorMini>>(
    () => assignmentsSessionCache?.creatorMap ?? {}
  );
  const [roomMap, setRoomMap] = useState<Record<string, Room>>(
    () => assignmentsSessionCache?.roomMap ?? {}
  );
  const [rooms, setRooms] = useState<Room[]>(() => roomsSessionCache?.rooms ?? []);
  const [loading, setLoading] = useState(() => !(assignmentsSessionCache?.assignments.length));
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const roomsTabLoadStartedRef = useRef(false);
  const [filter, setFilter] = useState<RoomStatus | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewIsVideo, setPreviewIsVideo] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<AssignmentRow | null>(null);
  const [completing, setCompleting] = useState(false);
  const [roomSheetRoom, setRoomSheetRoom] = useState<Room | null>(null);
  const [roomSheetMode, setRoomSheetMode] = useState<'menu' | 'history'>('menu');
  const [roomHistorySub, setRoomHistorySub] = useState<'list' | 'detail'>('list');
  const [roomHistoryDetailRow, setRoomHistoryDetailRow] = useState<RoomStayHistoryRow | null>(null);
  const [roomHistoryRows, setRoomHistoryRows] = useState<RoomStayHistoryRow[]>([]);
  const [roomHistoryLoading, setRoomHistoryLoading] = useState(false);
  const [roomHistoryError, setRoomHistoryError] = useState<string | null>(null);
  const [contractPreviewHtml, setContractPreviewHtml] = useState<string | null>(null);
  const [contractPreviewKey, setContractPreviewKey] = useState(0);
  const [pdfActionLoading, setPdfActionLoading] = useState(false);
  const [roomContractHistoryCounts, setRoomContractHistoryCounts] = useState<Record<string, number>>(
    () => roomsSessionCache?.counts ?? {}
  );

  const sortedRoomHistory = useMemo(() => sortRoomStayHistoryRows(roomHistoryRows), [roomHistoryRows]);

  const closeRoomSheet = useCallback(() => {
    setRoomSheetRoom(null);
    setRoomSheetMode('menu');
    setRoomHistorySub('list');
    setRoomHistoryDetailRow(null);
    setRoomHistoryRows([]);
    setRoomHistoryLoading(false);
    setRoomHistoryError(null);
    setContractPreviewHtml(null);
    setPdfActionLoading(false);
  }, []);

  const loadRoomHistory = useCallback(async (roomId: string) => {
    setRoomHistoryLoading(true);
    setRoomHistoryError(null);
    const { data, error } = await supabase.rpc('get_room_stay_history', { p_room_id: roomId });
    setRoomHistoryLoading(false);
    if (error) {
      setRoomHistoryError(error.message);
      setRoomHistoryRows([]);
      return;
    }
    setRoomHistoryRows(sortRoomStayHistoryRows(parseRoomStayHistoryRpc(data)));
  }, []);

  const openContractPdfMenu = useCallback((guestId: string) => {
    Alert.alert(t('screenDocumentManagement'), t('screenPost'), [
      {
        text: t('screenPost'),
        onPress: () => {
          void (async () => {
            setPdfActionLoading(true);
            try {
              const g = await loadGuestForPdf(supabase, guestId);
              if (!g) {
                Alert.alert(t('error'), t('recordError'));
                return;
              }
              const appearance = await fetchContractPdfAppearance(supabase);
              setContractPreviewKey((k) => k + 1);
              setContractPreviewHtml(buildContractHtml(g, appearance));
            } catch (e) {
              Alert.alert(t('error'), (e as Error)?.message ?? t('recordError'));
            } finally {
              setPdfActionLoading(false);
            }
          })();
        },
      },
      {
        text: t('save'),
        onPress: () => {
          void (async () => {
            setPdfActionLoading(true);
            try {
              const g = await loadGuestForPdf(supabase, guestId);
              if (!g) {
                Alert.alert(t('error'), t('recordError'));
                return;
              }
              await printContractGuest(g);
            } catch (e) {
              Alert.alert(t('error'), (e as Error)?.message ?? t('recordError'));
            } finally {
              setPdfActionLoading(false);
            }
          })();
        },
      },
      {
        text: t('share'),
        onPress: () => {
          void (async () => {
            setPdfActionLoading(true);
            try {
              const g = await loadGuestForPdf(supabase, guestId);
              if (!g) {
                Alert.alert(t('error'), t('recordError'));
                return;
              }
              await shareContractPdf(g);
            } catch (e) {
              Alert.alert(t('error'), (e as Error)?.message ?? t('recordError'));
            } finally {
              setPdfActionLoading(false);
            }
          })();
        },
      },
      { text: t('cancel'), style: 'cancel' },
    ]);
  }, []);

  const loadAssignments = useCallback(async () => {
    if (!staff?.id) return;
    try {
      let q = supabase
        .from('staff_assignments')
        .select(
          'id, title, body, task_type, priority, status, room_ids, due_at, created_at, started_at, completed_at, created_by_staff_id, attachment_urls, completion_proof_urls, completion_note'
        )
        .eq('assigned_staff_id', staff.id)
        .order('created_at', { ascending: false })
        .limit(80);
      let { data, error } = await q;
      if (error && (error.message?.includes('attachment_urls') || error.message?.includes('completion_') || error.code === 'PGRST204')) {
        const r2 = await supabase
          .from('staff_assignments')
          .select(
            'id, title, body, task_type, priority, status, room_ids, due_at, created_at, started_at, completed_at, created_by_staff_id, attachment_urls'
          )
          .eq('assigned_staff_id', staff.id)
          .order('created_at', { ascending: false })
          .limit(80);
        data = r2.data;
        error = r2.error;
      }
      if (error) {
        setAssignments([]);
        setRoomMap({});
        setCreatorMap({});
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
      let nextRoomMap: Record<string, Room> = {};
      const ids = [...new Set(list.flatMap((a) => a.room_ids ?? []))];
      if (ids.length) {
        const { data: rdata } = await supabase.from('rooms').select('id, room_number, floor, status').in('id', ids);
        nextRoomMap = Object.fromEntries(((rdata ?? []) as Room[]).map((r) => [r.id, r]));
      }
      setAssignments(list);
      setCreatorMap(nextCreatorMap);
      setRoomMap(nextRoomMap);
      const bundle: AssignmentsCacheBundle = {
        staffId: staff.id,
        assignments: list,
        creatorMap: nextCreatorMap,
        roomMap: nextRoomMap,
        updatedAt: Date.now(),
      };
      assignmentsSessionCache = bundle;
      void AsyncStorage.setItem(STAFF_TASKS_ASSIGNMENTS_CACHE_KEY, JSON.stringify(bundle)).catch(() => {});
    } catch {
      setAssignments([]);
      setRoomMap({});
      setCreatorMap({});
    }
  }, [staff?.id]);

  const loadRooms = useCallback(async () => {
    const { data } = await supabase
      .from('rooms')
      .select('id, room_number, floor, status')
      .order('floor', { ascending: true, nullsFirst: false })
      .order('room_number');
    const list = (data as Room[]) ?? [];
    setRooms(list);
    roomsSessionCache = {
      rooms: list,
      counts: roomsSessionCache?.counts ?? {},
      updatedAt: Date.now(),
    };
    return list;
  }, []);

  const loadRoomContractHistoryCounts = useCallback(async (): Promise<Record<string, number>> => {
    if (!staff?.id) return {};
    try {
      const { data, error } = await supabase.rpc('get_room_contract_history_counts');
      if (error || data == null) return {};
      const raw = typeof data === 'string' ? (JSON.parse(data) as unknown) : data;
      if (!raw || typeof raw !== 'object') return {};
      const next: Record<string, number> = {};
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const n = typeof v === 'number' ? v : Number(v);
        next[k] = Number.isFinite(n) ? n : 0;
      }
      return next;
    } catch {
      return {};
    }
  }, [staff?.id]);

  const loadRoomsTabData = useCallback(
    async (opts?: { showRoomsSpinner?: boolean }) => {
      if (!staff?.id) return;
      if (opts?.showRoomsSpinner) setRoomsLoading(true);
      try {
        const [roomList, counts] = await Promise.all([loadRooms(), loadRoomContractHistoryCounts()]);
        setRoomContractHistoryCounts(counts);
        roomsSessionCache = { rooms: roomList, counts, updatedAt: Date.now() };
      } finally {
        setRoomsLoading(false);
      }
    },
    [staff?.id, loadRooms, loadRoomContractHistoryCounts]
  );

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
      applyAssignmentsBundle(cached, setAssignments, setCreatorMap, setRoomMap);
      setLoading(false);
    } else {
      (async () => {
        try {
          const raw = await AsyncStorage.getItem(STAFF_TASKS_ASSIGNMENTS_CACHE_KEY);
          if (!raw || cancelled) return;
          const parsed = JSON.parse(raw) as AssignmentsCacheBundle;
          if (parsed?.staffId !== staff.id || !Array.isArray(parsed.assignments)) return;
          assignmentsSessionCache = parsed;
          applyAssignmentsBundle(parsed, setAssignments, setCreatorMap, setRoomMap);
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

  useEffect(() => {
    if (tab !== 'rooms' || !staff?.id) return;
    const roomsFresh =
      roomsSessionCache && Date.now() - roomsSessionCache.updatedAt < ASSIGNMENTS_CACHE_TTL_MS;
    if (roomsTabLoadStartedRef.current && roomsFresh && rooms.length > 0) return;
    roomsTabLoadStartedRef.current = true;
    void loadRoomsTabData({ showRoomsSpinner: rooms.length === 0 });
  }, [tab, staff?.id, loadRoomsTabData, rooms.length]);

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
    if (tab === 'rooms') {
      roomsTabLoadStartedRef.current = true;
      void loadRoomsTabData().finally(() => setRefreshing(false));
      return;
    }
    void loadAssignmentsFirst();
  };

  const activeAssignments = useMemo(
    () => assignments.filter((a) => a.status === 'pending' || a.status === 'in_progress'),
    [assignments]
  );
  const completedAssignments = useMemo(
    () => assignments.filter((a) => a.status === 'completed'),
    [assignments]
  );
  const cancelledCount = useMemo(
    () => assignments.filter((a) => a.status === 'cancelled').length,
    [assignments]
  );
  const totalPoints = useMemo(
    () => completedAssignments.reduce((sum, a) => sum + (PRIORITY_POINTS[a.priority] ?? 10), 0),
    [completedAssignments]
  );
  const level = useMemo(() => getLevel(totalPoints, t), [totalPoints, t]);
  const levelProgress = useMemo(() => {
    const range = level.max - level.min;
    if (range <= 0) return 1;
    return Math.min(1, (totalPoints - level.min) / range);
  }, [totalPoints, level]);

  const updateStatus = async (roomId: string, newStatus: RoomStatus) => {
    const { error } = await supabase.from('rooms').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', roomId);
    if (error) {
      Alert.alert(t('error'), error.message);
      return;
    }
    setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, status: newStatus } : r)));
    setRoomMap((prev) => (prev[roomId] ? { ...prev, [roomId]: { ...prev[roomId], status: newStatus } } : prev));
  };

  const showStatusMenu = (room: Room) => {
    Alert.alert(
      t('staffTasks_roomStatusAlertTitle', { number: room.room_number }),
      t('staffTasks_pickNewStatus'),
      STATUS_OPTIONS.map((s) => ({
        text: statusLabel(s),
        onPress: () => updateStatus(room.id, s),
      })).concat([{ text: t('cancel'), style: 'cancel' }])
    );
  };

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

  const submitTaskCompletion = async (payload: { note?: string; proofUris: string[] }) => {
    if (!staff?.id || !completeTarget) return;
    setCompleting(true);
    const result = await completeStaffAssignment({
      assignmentId: completeTarget.id,
      staffId: staff.id,
      note: payload.note,
      proofUris: payload.proofUris,
    });
    setCompleting(false);
    if (result.error) {
      Alert.alert(t('error'), result.error);
      return;
    }
    setCompleteTarget(null);
    await loadAssignments();
    Alert.alert(t('staffTasks_savedTitle'), t('staffTasks_taskCompletedBody'));
  };

  const openPreview = (url: string) => {
    setPreviewIsVideo(isAssignmentMediaVideoUrl(url));
    setPreviewUri(url);
  };

  const openCount = useMemo(
    () => assignments.filter((a) => a.status === 'pending' || a.status === 'in_progress').length,
    [assignments]
  );

  const filteredRooms = filter === 'all' ? rooms : rooms.filter((r) => r.status === filter);

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
    <View style={styles.screen}>
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

      <Modal
        visible={!!roomSheetRoom}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeRoomSheet}
      >
        <View style={[styles.roomSheetScreen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
          {roomSheetRoom && roomSheetMode === 'menu' ? (
            <>
              <View style={styles.roomSheetHeader}>
                <Text style={styles.roomSheetTitle}>{t('staffTasks_roomTitle', { number: roomSheetRoom.room_number })}</Text>
                <TouchableOpacity onPress={closeRoomSheet} hitSlop={12} accessibilityLabel={t('close')}>
                  <Ionicons name="close" size={26} color={theme.colors.text} />
                </TouchableOpacity>
              </View>
              {roomSheetRoom.floor != null ? (
                <Text style={styles.roomSheetMeta}>{t('staffTasks_floor', { floor: roomSheetRoom.floor })}</Text>
              ) : null}
              <Text style={styles.roomSheetStatusLine}>
                {t('roomCurrentStatus')}: <Text style={styles.roomSheetStatusEm}>{statusLabel(roomSheetRoom.status)}</Text>
              </Text>
              <Text style={styles.roomSheetIntro}>{t('staffTasks_roomSheetIntro')}</Text>
              <TouchableOpacity
                style={styles.roomSheetBtnPrimary}
                activeOpacity={0.88}
                onPress={() => {
                  setRoomSheetMode('history');
                  setRoomHistorySub('list');
                  setRoomHistoryDetailRow(null);
                  loadRoomHistory(roomSheetRoom.id);
                }}
              >
                <Ionicons name="people-outline" size={22} color={theme.colors.white} />
                <Text style={styles.roomSheetBtnPrimaryText}>{t('staffTasks_stayContractHistory')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.roomSheetBtnSecondary}
                activeOpacity={0.88}
                onPress={() => {
                  const r = roomSheetRoom;
                  closeRoomSheet();
                  if (r) showStatusMenu(r);
                }}
              >
                <Ionicons name="options-outline" size={22} color={theme.colors.primary} />
                <Text style={styles.roomSheetBtnSecondaryText}>{t('staffTasks_changeRoomStatus')}</Text>
              </TouchableOpacity>
            </>
          ) : roomSheetRoom && roomSheetMode === 'history' ? (
            <>
              <View style={styles.roomSheetHeader}>
                <TouchableOpacity
                  style={styles.roomSheetBack}
                  onPress={() => {
                    if (roomHistorySub === 'detail') {
                      setRoomHistorySub('list');
                      setRoomHistoryDetailRow(null);
                    } else {
                      setRoomSheetMode('menu');
                    }
                  }}
                  hitSlop={12}
                  accessibilityLabel={t('back')}
                >
                  <Ionicons name="chevron-back" size={26} color={theme.colors.primary} />
                </TouchableOpacity>
                <Text style={[styles.roomSheetTitle, { flex: 1 }]} numberOfLines={1}>
                  {roomHistorySub === 'detail' && roomHistoryDetailRow
                    ? roomStayListTitle(roomHistoryDetailRow)
                    : t('staffTasks_roomHistoryTitle', { number: roomSheetRoom.room_number })}
                </Text>
                <TouchableOpacity onPress={closeRoomSheet} hitSlop={12}>
                  <Ionicons name="close" size={26} color={theme.colors.text} />
                </TouchableOpacity>
              </View>
              {roomHistoryLoading ? (
                <View style={styles.roomHistoryCenter}>
                  <ActivityIndicator size="large" color={theme.colors.primary} />
                  <Text style={styles.roomHistoryLoadingText}>{t('staffTasks_recordsLoading')}</Text>
                </View>
              ) : roomHistoryError ? (
                <View style={styles.roomHistoryCenter}>
                  <Text style={styles.roomHistoryError}>{roomHistoryError}</Text>
                </View>
              ) : sortedRoomHistory.length === 0 ? (
                <View style={styles.roomHistoryCenter}>
                  <Ionicons name="document-text-outline" size={48} color={theme.colors.textMuted} />
                  <Text style={styles.roomHistoryEmptyTitle}>{t('staffTasks_noRoomRecordsTitle')}</Text>
                  <Text style={styles.roomHistoryEmptySub}>{t('staffTasks_noRoomRecordsSub')}</Text>
                </View>
              ) : roomHistorySub === 'list' ? (
                <View style={styles.roomHistoryListWrap}>
                  <Text style={styles.roomHistoryListHint}>{t('staffTasks_historyHint')}</Text>
                  <FlatList
                    data={sortedRoomHistory}
                    keyExtractor={(r) => r.acceptance_id}
                    style={styles.roomHistoryFlat}
                    contentContainerStyle={styles.roomHistoryFlatContent}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.historyListRow}
                        activeOpacity={0.82}
                        onPress={() => {
                          setRoomHistoryDetailRow(item);
                          setRoomHistorySub('detail');
                        }}
                      >
                        <View style={styles.historyListRowText}>
                          <Text style={styles.historyListName}>{roomStayListTitle(item)}</Text>
                          <Text style={styles.historyListSub}>{roomStayListSubtitle(item)}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={22} color={theme.colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  />
                </View>
              ) : roomHistoryDetailRow ? (
                <ScrollView
                  style={styles.roomHistoryScroll}
                  contentContainerStyle={styles.roomHistoryScrollContent}
                  keyboardShouldPersistTaps="handled"
                >
                  <TouchableOpacity
                    style={[
                      styles.pdfActionCard,
                      (!roomHistoryDetailRow.guest?.id || pdfActionLoading) && styles.pdfActionCardDisabled,
                    ]}
                    activeOpacity={0.88}
                    disabled={!roomHistoryDetailRow.guest?.id || pdfActionLoading}
                    onPress={() => {
                      const gid = roomHistoryDetailRow.guest?.id;
                      if (gid) openContractPdfMenu(gid);
                    }}
                  >
                    {pdfActionLoading ? (
                      <ActivityIndicator color={theme.colors.primary} />
                    ) : (
                      <>
                        <Ionicons name="document-text-outline" size={28} color={theme.colors.primary} />
                        <View style={styles.pdfActionTextCol}>
                          <Text style={styles.pdfActionTitle}>{t('staffTasks_contractPdfTitle')}</Text>
                          <Text style={styles.pdfActionSub}>{t('staffTasks_contractPdfHint')}</Text>
                        </View>
                        <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.textMuted} />
                      </>
                    )}
                  </TouchableOpacity>
                  {!roomHistoryDetailRow.guest?.id ? (
                    <Text style={styles.historyMuted}>{t('staffTasks_noPdfWithoutGuest')}</Text>
                  ) : null}

                  <Text style={[styles.historySectionLabel, { marginTop: 16 }]}>{t('staffTasks_contractSection')}</Text>
                  <View style={styles.historyCard}>
                    <View style={styles.kvRow}>
                      <Text style={styles.kvLabel}>{t('staffTasks_acceptedAt')}</Text>
                      <Text style={styles.kvValue}>{formatDt(roomHistoryDetailRow.accepted_at, loc)}</Text>
                    </View>
                    {roomHistoryDetailRow.contract_title ? (
                      <View style={styles.kvRow}>
                        <Text style={styles.kvLabel}>{t('staffTasks_template')}</Text>
                        <Text style={styles.kvValue}>{roomHistoryDetailRow.contract_title}</Text>
                      </View>
                    ) : null}
                    <View style={styles.kvRow}>
                      <Text style={styles.kvLabel}>{t('staffTasks_langVersion')}</Text>
                      <Text style={styles.kvValue}>
                        {roomHistoryDetailRow.contract_lang?.toUpperCase?.() ?? roomHistoryDetailRow.contract_lang} · v
                        {roomHistoryDetailRow.contract_version}
                      </Text>
                    </View>
                    <View style={styles.kvRow}>
                      <Text style={styles.kvLabel}>{t('staffTasks_source')}</Text>
                      <Text style={styles.kvValue}>{roomHistoryDetailRow.source}</Text>
                    </View>
                    {roomHistoryDetailRow.assigned_at ? (
                      <View style={styles.kvRow}>
                        <Text style={styles.kvLabel}>{t('staffTasks_assignedAt')}</Text>
                        <Text style={styles.kvValue}>{formatDt(roomHistoryDetailRow.assigned_at, loc)}</Text>
                      </View>
                    ) : null}
                    {roomHistoryDetailRow.assigned_staff ? (
                      <View style={styles.kvRow}>
                        <Text style={styles.kvLabel}>{t('staffTasks_assignedStaff')}</Text>
                        <Text style={styles.kvValue}>
                          {roomHistoryDetailRow.assigned_staff.full_name ?? '—'}
                          {roomHistoryDetailRow.assigned_staff.role
                            ? ` · ${STAFF_ROLE_LABELS[roomHistoryDetailRow.assigned_staff.role] ?? roomHistoryDetailRow.assigned_staff.role}`
                            : ''}
                          {roomHistoryDetailRow.assigned_staff.department
                            ? ` · ${roomHistoryDetailRow.assigned_staff.department}`
                            : ''}
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.kvRow}>
                      <Text style={styles.kvLabel}>{t('staffTasks_token')}</Text>
                      <Text style={styles.kvValue} selectable>
                        {roomHistoryDetailRow.token}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.historySectionLabel, { marginTop: 16 }]}>{t('staffTasks_guestSection')}</Text>
                  <View style={styles.historyCard}>
                    {!roomHistoryDetailRow.guest ? (
                      <Text style={styles.historyMuted}>{t('staffTasks_noGuestLinked')}</Text>
                    ) : (
                      guestFieldList.map(({ key, label }) => {
                        const raw = roomHistoryDetailRow.guest![key];
                        if (raw === null || raw === undefined || raw === '') return null;
                        return (
                          <View key={key} style={styles.kvRow}>
                            <Text style={styles.kvLabel}>{label}</Text>
                            <Text style={styles.kvValue} selectable={key === 'photo_url'}>
                              {guestFieldDisplay(key, raw)}
                            </Text>
                          </View>
                        );
                      })
                    )}
                  </View>
                </ScrollView>
              ) : null}
            </>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={!!contractPreviewHtml}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setContractPreviewHtml(null)}
      >
        <View style={[styles.contractPreviewRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.contractPreviewBar}>
            <TouchableOpacity onPress={() => setContractPreviewHtml(null)} hitSlop={12} style={styles.contractPreviewCloseBtn}>
              <Ionicons name="close" size={26} color={theme.colors.text} />
              <Text style={styles.contractPreviewCloseText}>{t('close')}</Text>
            </TouchableOpacity>
            <Text style={styles.contractPreviewBarTitle}>{t('staffTasks_contractPreview')}</Text>
            <View style={{ width: 72 }} />
          </View>
          {contractPreviewHtml ? (
            <WebView
              key={contractPreviewKey}
              originWhitelist={['*']}
              source={{ html: contractPreviewHtml, baseUrl: 'https://localhost/' }}
              style={styles.contractPreviewWeb}
              nestedScrollEnabled
              javaScriptEnabled
              domStorageEnabled
              {...(Platform.OS === 'android' ? { mixedContentMode: 'always' as const } : {})}
              startInLoadingState
              renderLoading={() => (
                <View style={styles.contractPreviewLoading}>
                  <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
              )}
              onShouldStartLoadWithRequest={(req) => {
                const u = req.url ?? '';
                if (!u || u === 'about:blank' || u === 'about:srcdoc') return true;
                if (u.startsWith('data:')) return true;
                if (u.startsWith('https://localhost') || u.startsWith('http://localhost')) return true;
                if (u.startsWith('http://') || u.startsWith('https://')) {
                  void Linking.openURL(u);
                  return false;
                }
                return true;
              }}
              onError={(e) => {
                console.warn('contract preview WebView', e.nativeEvent);
              }}
            />
          ) : null}
        </View>
      </Modal>

      <TaskCompletionSheet
        visible={!!completeTarget}
        taskTitle={completeTarget?.title ?? ''}
        saving={completing}
        onClose={() => setCompleteTarget(null)}
        onSubmit={submitTaskCompletion}
      />

      {/* ── Stats Dashboard ── */}
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
            <Text style={styles.dashLevelRange}>{level.min} / {level.max}</Text>
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
            <Text style={[styles.dashStatNum, { color: theme.colors.primary }]}>{assignments.length}</Text>
            <Text style={styles.dashStatLabel}>{t('staffTasks_statsTitle')}</Text>
          </View>
        </View>
      </View>

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

      {/* ── Tab Bar ── */}
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
          style={[styles.tab, tab === 'rooms' && styles.tabOn]}
          onPress={() => {
            setTab('rooms');
            if (staff?.id && rooms.length === 0 && !roomsLoading) {
              void loadRoomsTabData({ showRoomsSpinner: true });
            }
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="bed-outline" size={18} color={tab === 'rooms' ? theme.colors.text : theme.colors.textMuted} />
          <Text style={[styles.tabText, tab === 'rooms' && styles.tabTextOn]}>{t('staffTasks_roomsTab')}</Text>
        </TouchableOpacity>
      </View>

      {tab === 'active' ? (
        <FlatList
          data={activeAssignments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listPad}
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
            return (
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
                {isOpen ? (
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
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      ) : tab === 'completed' ? (
        <FlatList
          data={completedAssignments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listPad}
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
      ) : roomsLoading && rooms.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listPad}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        >
          <Text style={styles.roomsSectionTitle}>{t('staffTasks_allRoomsTitle')}</Text>
          <Text style={styles.roomsSectionSub}>{t('staffTasks_allRoomsSub')}</Text>
          <View style={styles.filterRow}>
            {(['all', ...STATUS_OPTIONS] as const).map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterChip, filter === f && styles.filterChipActive]}
                onPress={() => setFilter(f)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
                  {f === 'all' ? t('missingItemsFilterAll') : statusLabel(f)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.roomGrid}>
            {filteredRooms.map((item) => {
              const historyCount = roomContractHistoryCounts[item.id] ?? 0;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.roomCard, STATUS_STYLES[item.status]]}
                  onPress={() => {
                    setRoomSheetRoom(item);
                    setRoomSheetMode('menu');
                    setRoomHistorySub('list');
                    setRoomHistoryDetailRow(null);
                    setRoomHistoryRows([]);
                    setRoomHistoryError(null);
                  }}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.roomHistoryCountBadge,
                      historyCount === 0 && styles.roomHistoryCountBadgeZero,
                    ]}
                    pointerEvents="none"
                  >
                    <Text
                      style={[
                        styles.roomHistoryCountText,
                        historyCount === 0 && styles.roomHistoryCountTextZero,
                      ]}
                    >
                      {historyCount > 99 ? '99+' : historyCount}
                    </Text>
                  </View>
                  <Text style={styles.roomNumber}>{t('staffTasks_roomTitle', { number: item.room_number })}</Text>
                  {item.floor != null && <Text style={styles.floor}>{t('staffTasks_floor', { floor: item.floor })}</Text>}
                  <Text style={styles.statusLabel}>{statusLabel(item.status)}</Text>
                  <Text style={styles.tapHint}>{t('staffTasks_tapHistory')}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}
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

  /* ── Dashboard ── */
  dashboardCard: {
    marginHorizontal: 16,
    marginTop: 12,
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
  tabBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  /* ── Lists ── */
  listPad: { padding: 16, paddingBottom: 48 },
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
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
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
  roomsSectionTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 6 },
  roomsSectionSub: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 14 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14, gap: 6 },
  filterChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#e8eaed',
  },
  filterChipActive: { backgroundColor: '#1a1d21' },
  filterChipText: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  roomCard: {
    width: '47%',
    flexGrow: 1,
    padding: 14,
    paddingTop: 20,
    borderRadius: 14,
    borderWidth: 2,
    position: 'relative',
    overflow: 'visible',
  },
  roomHistoryCountBadge: {
    position: 'absolute',
    top: 4,
    right: 6,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: '#1a1d21',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#f0f2f5',
  },
  roomHistoryCountBadgeZero: {
    backgroundColor: '#e8eaed',
    borderColor: '#d1d5db',
  },
  roomHistoryCountText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  roomHistoryCountTextZero: { color: theme.colors.textMuted },
  roomNumber: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  floor: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  statusLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.text, marginTop: 6 },
  tapHint: { fontSize: 10, color: theme.colors.textMuted, marginTop: 3 },
  roomSheetScreen: { flex: 1, backgroundColor: theme.colors.background, paddingHorizontal: theme.spacing.lg },
  roomSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  roomSheetBack: { marginRight: 8, padding: 4 },
  roomSheetTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text, flex: 1 },
  roomSheetMeta: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 6 },
  roomSheetStatusLine: { fontSize: 15, color: theme.colors.textSecondary, marginBottom: 12 },
  roomSheetStatusEm: { fontWeight: '800', color: theme.colors.text },
  roomSheetIntro: { fontSize: 14, lineHeight: 21, color: theme.colors.textSecondary, marginBottom: 20 },
  roomSheetBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#1a1d21',
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 12,
  },
  roomSheetBtnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  roomSheetBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#fff',
  },
  roomSheetBtnSecondaryText: { color: theme.colors.text, fontWeight: '800', fontSize: 15 },
  roomHistoryCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  roomHistoryLoadingText: { marginTop: 12, fontSize: 14, color: theme.colors.textSecondary },
  roomHistoryError: { fontSize: 14, color: theme.colors.error, textAlign: 'center' },
  roomHistoryEmptyTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text, marginTop: 12 },
  roomHistoryEmptySub: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  roomHistoryScroll: { flex: 1 },
  roomHistoryScrollContent: { paddingBottom: 32 },
  roomHistoryListWrap: { flex: 1, minHeight: 200 },
  roomHistoryListHint: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  roomHistoryFlat: { flex: 1 },
  roomHistoryFlatContent: { paddingBottom: 24 },
  historyListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  historyListRowText: { flex: 1, paddingRight: 8 },
  historyListName: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  historyListSub: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4 },
  pdfActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight + '18',
  },
  pdfActionCardDisabled: { opacity: 0.45, borderColor: theme.colors.border },
  pdfActionTextCol: { flex: 1 },
  pdfActionTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  pdfActionSub: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 4, lineHeight: 18 },
  contractPreviewRoot: { flex: 1, backgroundColor: theme.colors.background },
  contractPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  contractPreviewCloseBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 72 },
  contractPreviewCloseText: { fontSize: 16, fontWeight: '700', color: theme.colors.primary },
  contractPreviewBarTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text, flex: 1, textAlign: 'center' },
  contractPreviewWeb: { flex: 1, backgroundColor: theme.colors.background },
  contractPreviewLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  historyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  historyCardTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.primary, marginBottom: 10 },
  historySectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  historyMuted: { fontSize: 14, color: theme.colors.textMuted, fontStyle: 'italic' },
  kvRow: { marginBottom: 8 },
  kvLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, marginBottom: 2 },
  kvValue: { fontSize: 14, color: theme.colors.text, lineHeight: 20 },
});
