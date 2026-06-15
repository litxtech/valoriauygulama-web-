import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  Modal,
} from 'react-native';
import { useFocusEffect, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { getExpoPushTokenAsync, savePushTokenForStaff, isExpoGo } from '@/lib/notificationsPush';
import ExpoNotifications from '@/lib/expoNotificationsModule';
import { useAuthStore } from '@/stores/authStore';
import { useStaffNotificationStore } from '@/stores/staffNotificationStore';
import type { StaffPersonnelWarningSeverity } from '@/lib/staffPersonnelWarnings';
import {
  isStaffMealMenuDailyNotification,
  staffMealMenuNotificationHref,
} from '@/lib/staffMealMenuNotification';
import { isSmartOpsNotificationType } from '@/lib/smartOps';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import type { PersonelDesignPalette } from '@/constants/personelDesignSystem';
import {
  acknowledgeNotificationEvent,
  eventIdFromNotificationData,
  isEmergencyNotificationPayload,
  markNotificationEventOpenedFromPayload,
} from '@/lib/notificationEventLog';
import { TaskCompletionSheet } from '@/components/TaskCompletionSheet';
import { completeStaffAssignment } from '@/lib/staffAssignmentComplete';
import { dispatchTaskCompletionNotify } from '@/lib/staffAssignmentCreate';
import {
  assignmentIdFromNotificationData,
  fetchMyStaffAssignmentBrief,
  isAssignmentOpen,
  isStaffAssignmentNotification,
  type StaffAssignmentBrief,
} from '@/lib/staffAssignmentNotification';
import { resolveNotificationHref } from '@/lib/notificationNavigation';
import { useNotificationLocalization } from '@/hooks/useNotificationLocalization';

function missingNotificationPreview(body: string | null | undefined, maxLines = 6): string | null {
  if (!body?.trim()) return null;
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('•'));
  if (lines.length === 0) return body.trim();
  const shown = lines.slice(0, maxLines);
  const rest = lines.length - shown.length;
  if (rest > 0) shown.push(`… +${rest}`);
  return shown.join('\n');
}

type NotifRow = {
  id: string;
  title: string;
  body: string | null;
  category: string | null;
  notification_type: string | null;
  read_at: string | null;
  created_at: string;
  data?: {
    postId?: string;
    url?: string;
    missingItemId?: string;
    missingItemReportId?: string;
    area?: string;
    kind?: string;
    note?: string;
    conversationId?: string;
    warningId?: string;
    screen?: string;
    mealDate?: string;
    taskInstanceId?: string;
    lostFoundItemId?: string;
    subjectStaffId?: string;
    subject_staff_id?: string;
    assignmentId?: string;
  } | null;
};

type MissingItemDetail = {
  id: string;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved';
  created_at: string;
  resolved_at: string | null;
  reminder_count: number;
  creator?: { full_name: string | null } | null;
  resolver?: { full_name: string | null } | null;
};

type MissingItemReportDetail = {
  id: string;
  area: 'kitchen' | 'hotel';
  note: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved';
  item_count: number;
  created_at: string;
  resolved_at: string | null;
  creator?: { full_name: string | null } | null;
  resolver?: { full_name: string | null } | null;
  items?: { title: string }[];
};

type PersonnelWarningDetail = {
  id: string;
  severity: StaffPersonnelWarningSeverity;
  subject_line: string | null;
  body: string;
  created_at: string;
  acknowledged_at: string | null;
  acknowledgement_note: string | null;
  image_urls: unknown;
};

function warningIdFromNotifData(data: Record<string, unknown> | NotifRow['data'] | null | undefined): string {
  if (!data || typeof data !== 'object') return '';
  const o = data as Record<string, unknown>;
  const w = o.warningId ?? o.warning_id;
  return typeof w === 'string' ? w.trim() : '';
}

function createStaffNotifStyles(p: PersonelDesignPalette) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: p.pageBg },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: p.pageBg },
  message: { fontSize: 16, color: p.muted },
  title: { fontSize: 20, fontWeight: '700', color: p.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: p.muted, marginBottom: 20 },
  pushCard: {
    backgroundColor: p.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: p.cardBorder,
    padding: 14,
    marginBottom: 14,
  },
  pushCardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  pushCardTitle: { fontSize: 15, fontWeight: '700', color: p.text },
  pushCardDesc: { fontSize: 13, color: p.subtext, lineHeight: 18 },
  pushCardBtnRow: { marginTop: 12, gap: 10 },
  pushCardBtn: {
    backgroundColor: '#2b6cb0',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  pushCardBtnDisabled: { opacity: 0.7 },
  pushCardBtnText: { color: '#fff', fontWeight: '700' },
  pushCardBtnSecondary: {
    marginTop: 6,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2b6cb0',
  },
  pushCardBtnSecondaryText: { color: '#2b6cb0', fontWeight: '600' },
  deleteAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 12,
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  deleteAllBtnDisabled: { opacity: 0.6 },
  deleteAllBtnText: { fontSize: 12, fontWeight: '500', color: '#e53e3e' },
  empty: { color: p.muted, fontSize: 14 },
  row: {
    backgroundColor: p.cardBg,
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: p.cardBorder,
  },
  rowRead: { opacity: 0.85 },
  rowCategory: { fontSize: 12, color: '#b8860b', fontWeight: '600', marginBottom: 4 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: p.text, marginBottom: 4 },
  rowBody: { fontSize: 14, color: p.subtext, marginBottom: 8 },
  rowTime: { fontSize: 12, color: p.muted },
  detailBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 20 },
  detailCard: {
    backgroundColor: p.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: p.cardBorder,
    padding: 16,
  },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
  detailTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: p.text },
  detailBody: { fontSize: 14, lineHeight: 20, color: p.subtext, marginBottom: 8 },
  detailMeta: { fontSize: 12, color: p.muted, marginBottom: 4 },
  detailBox: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: p.cardBorder,
    paddingTop: 10,
    gap: 4,
  },
  detailSectionTitle: { marginTop: 6, marginBottom: 2, fontSize: 13, fontWeight: '700', color: p.text },
  detailLine: { fontSize: 13, color: p.subtext },
  detailNote: { fontSize: 13, color: p.text, lineHeight: 20 },
  detailWarn: { marginTop: 10, fontSize: 13, color: '#b45309' },
  warningDetailBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#991b1b',
    paddingVertical: 12,
    borderRadius: 10,
  },
  warningDetailBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  emergencyBanner: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  emergencyBannerText: { color: '#991b1b', fontSize: 14, fontWeight: '600', lineHeight: 20 },
  emergencyAckBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    borderRadius: 10,
  },
  emergencyAckBtnDone: { backgroundColor: '#16a34a' },
  emergencyAckBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  detailLinkBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#2b6cb0',
  },
  detailLinkBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  detailLinkBtnSecondary: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2b6cb0',
  },
  detailLinkBtnSecondaryText: { color: '#2b6cb0', fontWeight: '700', fontSize: 14 },
  taskCompleteBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#16a34a',
  },
  taskCompleteBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  taskCompleteDetailBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 10,
  },
  taskCompleteDetailBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  taskCompletedBadge: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  taskCompletedBadgeText: { color: '#16a34a', fontWeight: '700', fontSize: 14 },
  });
}

export default function StaffNotificationsScreen() {
  const { t, i18n } = useTranslation();
  const palette = usePersonelDesign();
  const styles = useMemo(() => createStaffNotifStyles(palette), [palette]);
  const dateLoc = i18n.language?.startsWith('ar') ? 'ar-SA' : i18n.language?.startsWith('tr') ? 'tr-TR' : 'en-US';
  const fmtDate = (iso: string) => new Date(iso).toLocaleString(dateLoc);
  const router = useRouter();
  const pathname = usePathname();
  const missingItemsBase = pathname?.startsWith('/admin') ? '/admin/missing-items' : '/staff/missing-items';
  const { staff } = useAuthStore();
  const scrollRef = useRef<ScrollView>(null);
  const lastLoadAtRef = useRef(0);
  const reloadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const NOTIF_LIST_TTL_MS = 60_000;
  const [list, setList] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingAll, setDeletingAll] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<NotifRow | null>(null);
  const [missingItemDetail, setMissingItemDetail] = useState<MissingItemDetail | null>(null);
  const [missingReportDetail, setMissingReportDetail] = useState<MissingItemReportDetail | null>(null);
  const [personnelWarningDetail, setPersonnelWarningDetail] = useState<PersonnelWarningDetail | null>(null);
  const [pushPerm, setPushPerm] = useState<'granted' | 'denied' | 'undetermined' | 'unknown'>('unknown');
  const [enablingPush, setEnablingPush] = useState(false);
  const [emergencyAckSubmitting, setEmergencyAckSubmitting] = useState(false);
  const [emergencyAcknowledged, setEmergencyAcknowledged] = useState(false);
  const [assignmentDetail, setAssignmentDetail] = useState<StaffAssignmentBrief | null>(null);
  const [completeTarget, setCompleteTarget] = useState<StaffAssignmentBrief | null>(null);
  const [completing, setCompleting] = useState(false);
  const { refresh: refreshBadge, setUnreadCount, setNotificationsScreenFocused } = useStaffNotificationStore();
  const { displayFor } = useNotificationLocalization(list, {
    staffPersist: Boolean(staff?.id),
    enabled: Boolean(staff?.id),
  });

  const markAllAsRead = useCallback(async () => {
    if (!staff?.id) return;
    const now = new Date().toISOString();
    await supabase
      .from('notifications')
      .update({ read_at: now })
      .eq('staff_id', staff.id)
      .is('read_at', null);
    setList((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    setUnreadCount(0);
    refreshBadge();
  }, [staff?.id, refreshBadge, setUnreadCount]);

  const load = useCallback(async (opts?: { scrollToTop?: boolean }) => {
    if (!staff?.id) {
      setLoading(false);
      return;
    }
    // Push iznini otomatik isteme: sadece durum kontrol et.
    if (!isExpoGo) {
      try {
        const { status } = await ExpoNotifications.getPermissionsAsync();
        setPushPerm(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined');
      } catch {
        setPushPerm('unknown');
      }
    }
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, category, notification_type, read_at, created_at, data')
      .eq('staff_id', staff.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setList((data as NotifRow[]) ?? []);
    lastLoadAtRef.current = Date.now();
    setLoading(false);
    if (opts?.scrollToTop) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      });
    }
  }, [staff?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Yeni bildirim gelince listeyi güncelle (beğeni/yorum push’u anında görünsün)
  useEffect(() => {
    if (!staff?.id) return;
    const channel = supabase
      .channel('staff_notifications_list')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `staff_id=eq.${staff.id}` },
        () => {
          if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
          reloadDebounceRef.current = setTimeout(() => {
            reloadDebounceRef.current = null;
            load({ scrollToTop: true });
          }, 450);
        }
      )
      .subscribe();
    return () => {
      if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [staff?.id, load]);

  useFocusEffect(
    useCallback(() => {
      setUnreadCount(0);
      setNotificationsScreenFocused(true);
      const stale = list.length === 0 || Date.now() - lastLoadAtRef.current >= NOTIF_LIST_TTL_MS;
      if (stale) {
        load().then(() => markAllAsRead());
      } else {
        void markAllAsRead();
      }
      return () => setNotificationsScreenFocused(false);
    }, [list.length, setUnreadCount, setNotificationsScreenFocused, load, markAllAsRead])
  );

  const enablePush = useCallback(async () => {
    if (enablingPush) return;
    if (isExpoGo) {
      Alert.alert(t('staffNotifPushUnsupportedTitle'), t('staffNotifPushUnsupportedBody'), [{ text: t('ok') }]);
      return;
    }
    if (!staff?.id) return;
    setEnablingPush(true);
    try {
      const token = await getExpoPushTokenAsync();
      if (token) {
        await savePushTokenForStaff(staff.id);
        setPushPerm('granted');
      } else {
        try {
          const { status } = await ExpoNotifications.getPermissionsAsync();
          setPushPerm(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined');
          if (status === 'denied') {
            Alert.alert(t('staffNotifPermDeniedTitle'), t('staffNotifPermDeniedBody'), [
              { text: t('cancel'), style: 'cancel' },
              { text: t('staffNotifOpenSettings'), onPress: () => Linking.openSettings() },
            ]);
          }
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      Alert.alert(t('error'), t('notificationPermissionFetchFailed'));
    } finally {
      setEnablingPush(false);
    }
  }, [staff?.id, enablingPush, t]);

  const markRead = async (id: string) => {
    if (!staff?.id) return;
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).eq('staff_id', staff.id);
    setList((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    refreshBadge();
  };

  const isMissingNotification = (n: NotifRow) =>
    (n.notification_type ?? '').startsWith('missing_item_') || (n.data?.kind ?? '').startsWith('missing_item_');

  const formatMissingPriority = (priority?: MissingItemDetail['priority']) => {
    if (!priority) return '-';
    if (priority === 'high') return t('missingItemsPriorityHigh');
    if (priority === 'medium') return t('missingItemsPriorityMedium');
    return t('missingItemsPriorityLow');
  };

  const formatMissingStatus = (status?: MissingItemDetail['status']) => {
    if (!status) return '-';
    return status === 'resolved' ? t('staffNotifMissingStatusResolved') : t('staffNotifMissingStatusOpen');
  };

  const fetchMissingItemDetail = async (missingItemId: string) => {
    setDetailLoading(true);
    const { data, error } = await supabase
      .from('missing_items')
      .select(
        `
        id,
        title,
        description,
        priority,
        status,
        created_at,
        resolved_at,
        reminder_count,
        creator:staff!missing_items_created_by_staff_id_fkey(full_name),
        resolver:staff!missing_items_resolved_by_staff_id_fkey(full_name)
      `
      )
      .eq('id', missingItemId)
      .maybeSingle();
    setDetailLoading(false);
    if (error) {
      setMissingItemDetail(null);
      return;
    }
    setMissingItemDetail((data as MissingItemDetail | null) ?? null);
  };

  const fetchMissingReportDetail = async (reportId: string) => {
    setDetailLoading(true);
    const { data, error } = await supabase
      .from('missing_item_reports')
      .select(
        `
        id,
        area,
        note,
        priority,
        status,
        item_count,
        created_at,
        resolved_at,
        creator:staff!missing_item_reports_created_by_staff_id_fkey(full_name),
        resolver:staff!missing_item_reports_resolved_by_staff_id_fkey(full_name),
        items:missing_items(title)
      `
      )
      .eq('id', reportId)
      .maybeSingle();
    setDetailLoading(false);
    if (error) {
      setMissingReportDetail(null);
      return;
    }
    setMissingReportDetail((data as MissingItemReportDetail | null) ?? null);
  };

  const openNotificationDetail = async (n: NotifRow) => {
    setSelectedNotification(n);
    setMissingItemDetail(null);
    setMissingReportDetail(null);
    setPersonnelWarningDetail(null);
    setAssignmentDetail(null);
    setDetailVisible(true);
    const reportId =
      typeof n.data?.missingItemReportId === 'string' ? n.data.missingItemReportId.trim() : '';
    if (reportId) {
      await fetchMissingReportDetail(reportId);
    } else if (n.data?.missingItemId) {
      await fetchMissingItemDetail(n.data.missingItemId);
    } else {
      setDetailLoading(false);
    }
  };

  const fetchPersonnelWarningDetail = async (warningId: string) => {
    if (!staff?.id || !warningId) {
      setPersonnelWarningDetail(null);
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    const { data, error } = await supabase
      .from('staff_personnel_warnings')
      .select('id, severity, subject_line, body, created_at, acknowledged_at, acknowledgement_note, image_urls')
      .eq('id', warningId)
      .eq('subject_staff_id', staff.id)
      .maybeSingle();
    setDetailLoading(false);
    if (error || !data) {
      setPersonnelWarningDetail(null);
      return;
    }
    setPersonnelWarningDetail(data as PersonnelWarningDetail);
  };

  const loadAssignmentForNotification = async (assignmentId: string) => {
    if (!staff?.id) {
      setAssignmentDetail(null);
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    const row = await fetchMyStaffAssignmentBrief(assignmentId, staff.id);
    setAssignmentDetail(row);
    setDetailLoading(false);
  };

  const openTaskCompleteFromNotif = async (n: NotifRow) => {
    if (!staff?.id) return;
    if (!n.read_at) markRead(n.id);
    const assignmentId = assignmentIdFromNotificationData(n.data);
    if (!assignmentId) {
      router.push('/staff/tasks');
      return;
    }
    const row = await fetchMyStaffAssignmentBrief(assignmentId, staff.id);
    if (!row) {
      Alert.alert(t('error'), t('staffNotifTaskCompleteFailed'));
      return;
    }
    if (!isAssignmentOpen(row.status)) {
      Alert.alert(t('staffTasks_savedTitle'), t('staffNotifTaskCompleted'));
      return;
    }
    setCompleteTarget(row);
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
    setCompleteTarget(null);
    setAssignmentDetail((prev) =>
      prev?.id === target.id ? { ...prev, status: 'completed' } : prev
    );
    Alert.alert(t('staffTasks_savedTitle'), t('staffTasks_taskCompletedBody'));
  };

  const openPersonnelWarningsFromDetail = () => {
    const wid =
      personnelWarningDetail?.id?.trim() ||
      (selectedNotification ? warningIdFromNotifData(selectedNotification.data) : '');
    setDetailVisible(false);
    setSelectedNotification(null);
    setMissingItemDetail(null);
    setPersonnelWarningDetail(null);
    if (wid) {
      router.push({ pathname: '/staff/warnings', params: { focus: wid } });
    } else {
      router.push('/staff/warnings');
    }
  };

  const displayTitle = (n: NotifRow) => {
    const shown = displayFor(n);
    if (isMissingNotification(n)) return shown.title?.trim() || t('staffNotifMissingReport');
    return shown.title;
  };

  const displayBody = (n: NotifRow) => {
    const shown = displayFor(n);
    if (isMissingNotification(n)) return missingNotificationPreview(shown.body);
    return shown.body?.trim() || null;
  };

  const onNotificationPress = (n: NotifRow) => {
    if (!n.read_at) markRead(n.id);
    if (
      isEmergencyNotificationPayload(
        (n.data ?? {}) as Record<string, unknown>,
        n.notification_type
      )
    ) {
      setSelectedNotification(n);
      setMissingItemDetail(null);
      setMissingReportDetail(null);
      setPersonnelWarningDetail(null);
      setEmergencyAcknowledged(false);
      setDetailVisible(true);
      void markNotificationEventOpenedFromPayload((n.data ?? {}) as Record<string, unknown>);
      return;
    }
    if (n.notification_type === 'staff_personnel_warning') {
      setSelectedNotification(n);
      setMissingItemDetail(null);
      setPersonnelWarningDetail(null);
      setDetailVisible(true);
      setDetailLoading(true);
      const wid = warningIdFromNotifData(n.data);
      if (wid) {
        void fetchPersonnelWarningDetail(wid);
      } else {
        setDetailLoading(false);
      }
      return;
    }
    if (n.notification_type === 'staff_personnel_warning_ack') {
      const raw = n.data as Record<string, unknown> | undefined;
      const sid =
        typeof raw?.subjectStaffId === 'string'
          ? raw.subjectStaffId.trim()
          : typeof raw?.subject_staff_id === 'string'
            ? raw.subject_staff_id.trim()
            : '';
      if (sid) {
        router.push({ pathname: '/admin/staff/[id]', params: { id: sid } } as never);
      }
      return;
    }
    if (isStaffMealMenuDailyNotification((n.data ?? {}) as Record<string, unknown>)) {
      router.push(staffMealMenuNotificationHref((n.data ?? {}) as Record<string, unknown>));
      return;
    }
    if (isStaffAssignmentNotification(n.notification_type, n.data)) {
      setSelectedNotification(n);
      setMissingItemDetail(null);
      setMissingReportDetail(null);
      setPersonnelWarningDetail(null);
      setAssignmentDetail(null);
      setDetailVisible(true);
      const assignmentId = assignmentIdFromNotificationData(n.data);
      if (assignmentId) {
        void loadAssignmentForNotification(assignmentId);
      } else {
        setDetailLoading(false);
      }
      return;
    }
    if (isSmartOpsNotificationType(n.notification_type)) {
      const taskId =
        typeof n.data?.taskInstanceId === 'string'
          ? n.data.taskInstanceId.trim()
          : typeof n.data?.url === 'string'
            ? n.data.url.replace(/.*\/staff\/smart-ops\//, '').split(/[?#]/)[0]
            : '';
      if (taskId) {
        router.push(`/staff/smart-ops/${taskId}` as never);
        return;
      }
      router.push('/staff/operations');
      return;
    }
    if (n.data?.postId) {
      router.push({ pathname: '/staff/feed', params: { openPostId: n.data.postId } });
      return;
    }
    const cid = typeof n.data?.conversationId === 'string' ? n.data.conversationId.trim() : '';
    if (cid) {
      const u = n.data?.url;
      if (typeof u === 'string' && u.includes('/admin/messages/chat/')) {
        const m = u.match(/\/admin\/messages\/chat\/([^/?#]+)/);
        if (m?.[1]) {
          router.push({ pathname: '/admin/messages/chat/[id]', params: { id: m[1] } });
          return;
        }
      }
      router.push({ pathname: '/staff/chat/[id]', params: { id: cid } });
      return;
    }
    const lostFoundId =
      typeof n.data?.lostFoundItemId === 'string' ? n.data.lostFoundItemId.trim() : '';
    const lostFoundBase = pathname?.startsWith('/admin') ? '/admin/lost-found' : '/staff/lost-found';
    if (lostFoundId) {
      router.push(`${lostFoundBase}/${lostFoundId}` as never);
      return;
    }
    const missingUrl = typeof n.data?.url === 'string' ? n.data.url : '';
    const lostFoundUrlMatch = missingUrl.match(/\/lost-found\/([0-9a-f-]{36})/i);
    if (lostFoundUrlMatch?.[1]) {
      router.push(`${lostFoundBase}/${lostFoundUrlMatch[1]}` as never);
      return;
    }
    if (isMissingNotification(n)) {
      const href = resolveNotificationHref((n.data ?? {}) as Record<string, unknown>, {
        pathnameIsAdmin: !!pathname?.startsWith('/admin'),
        isStaff: true,
      });
      if (href && href !== '/staff/notifications' && href !== '/admin/notifications') {
        router.push(href as never);
        return;
      }
      openNotificationDetail(n);
      return;
    }
    openNotificationDetail(n);
  };

  const deleteAllNotifications = () => {
    if (!staff?.id || list.length === 0) return;
    Alert.alert(t('staffNotifDeleteAllTitle'), t('staffNotifDeleteAllBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('staffNotifDeleteBtn'),
          style: 'destructive',
          onPress: async () => {
            setDeletingAll(true);
            await supabase.from('notifications').delete().eq('staff_id', staff.id);
            setList([]);
            setUnreadCount(0);
            refreshBadge();
            setDeletingAll(false);
          },
        },
      ]
    );
  };

  const categoryLabel = (c: string | null) => {
    const m: Record<string, string> = {
      emergency: t('staffNotifCatEmergency'),
      guest: t('staffNotifCatGuest'),
      staff: t('staffNotifCatStaff'),
      admin: t('staffNotifCatAdmin'),
      bulk: t('staffNotifCatBulk'),
    };
    return c ? m[c] ?? c : '';
  };

  if (!staff) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>{t('staffNotifSessionRequired')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: palette.pageBg }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} />}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={styles.title}>{t('staffNotifTitle')}</Text>
      <Text style={styles.subtitle}>{t('staffNotifSubtitle')}</Text>
      {!isExpoGo && (pushPerm === 'denied' || pushPerm === 'undetermined') && (
        <View style={styles.pushCard}>
          <View style={styles.pushCardRow}>
            <Ionicons name="notifications-outline" size={20} color="#2b6cb0" />
            <Text style={styles.pushCardTitle}>{t('staffNotifPermCardTitle')}</Text>
          </View>
          <Text style={styles.pushCardDesc}>
            {pushPerm === 'denied' ? t('staffNotifPermDeniedHint') : t('staffNotifPermUndeterminedHint')}
          </Text>
          <View style={styles.pushCardBtnRow}>
            <TouchableOpacity
              style={[styles.pushCardBtn, enablingPush && styles.pushCardBtnDisabled]}
              onPress={enablePush}
              disabled={enablingPush}
              activeOpacity={0.8}
            >
              {enablingPush ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.pushCardBtnText}>
                  {pushPerm === 'denied' ? t('staffNotifPermRetry') : t('staffNotifPermGrant')}
                </Text>
              )}
            </TouchableOpacity>
            {pushPerm === 'denied' && (
              <TouchableOpacity
                style={styles.pushCardBtnSecondary}
                onPress={() => Linking.openSettings()}
                activeOpacity={0.8}
              >
                <Text style={styles.pushCardBtnSecondaryText}>{t('staffNotifOpenSettings')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      {list.length > 0 && (
        <TouchableOpacity
          style={[styles.deleteAllBtn, deletingAll && styles.deleteAllBtnDisabled]}
          onPress={deleteAllNotifications}
          disabled={deletingAll}
          activeOpacity={0.7}
        >
          {deletingAll ? (
            <ActivityIndicator size="small" color="#e53e3e" />
          ) : (
            <>
              <Ionicons name="trash-outline" size={14} color="#e53e3e" />
              <Text style={styles.deleteAllBtnText}>{t('staffNotifDeleteAllBtn')}</Text>
            </>
          )}
        </TouchableOpacity>
      )}
      {list.length === 0 && !loading ? (
        <Text style={styles.empty}>{t('staffNotifEmpty')}</Text>
      ) : (
        list.map((n) => {
          const isTaskNotif = isStaffAssignmentNotification(n.notification_type, n.data);
          return (
          <View key={n.id} style={[styles.row, n.read_at ? styles.rowRead : null]}>
            <TouchableOpacity
              onPress={() => onNotificationPress(n)}
              activeOpacity={0.8}
            >
              {categoryLabel(n.category) ? (
                <Text style={styles.rowCategory}>{categoryLabel(n.category)}</Text>
              ) : null}
              <Text style={styles.rowTitle}>{displayTitle(n)}</Text>
              {displayBody(n) ? (
                <Text style={styles.rowBody} numberOfLines={isMissingNotification(n) ? 8 : 4}>
                  {displayBody(n)}
                </Text>
              ) : null}
              <Text style={styles.rowTime}>{fmtDate(n.created_at)}</Text>
            </TouchableOpacity>
            {isTaskNotif ? (
              <TouchableOpacity
                style={styles.taskCompleteBtn}
                onPress={() => void openTaskCompleteFromNotif(n)}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark-done-outline" size={16} color="#fff" />
                <Text style={styles.taskCompleteBtnText}>{t('staffTasks_completeBtn')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          );
        })
      )}
      <Modal
        visible={detailVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setDetailVisible(false);
          setPersonnelWarningDetail(null);
          setEmergencyAcknowledged(false);
        }}
      >
        <View style={styles.detailBackdrop}>
          <View style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>
                {selectedNotification ? displayTitle(selectedNotification) : t('staffNotifDetailDefault')}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setDetailVisible(false);
                  setPersonnelWarningDetail(null);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color="#718096" />
              </TouchableOpacity>
            </View>
            {!!selectedNotification?.body &&
              !(
                selectedNotification.notification_type === 'staff_personnel_warning' &&
                personnelWarningDetail
              ) && (
                <Text style={styles.detailBody}>{displayFor(selectedNotification).body}</Text>
              )}
            {!!selectedNotification && (
              <Text style={styles.detailMeta}>
                {t('staffNotifDate', { date: fmtDate(selectedNotification.created_at) })}
              </Text>
            )}
            {!!selectedNotification && categoryLabel(selectedNotification.category) ? (
              <Text style={styles.detailMeta}>
                {t('staffNotifCategory', { category: categoryLabel(selectedNotification.category) })}
              </Text>
            ) : null}

            {detailLoading ? (
              <ActivityIndicator size="small" color="#2b6cb0" style={{ marginTop: 10 }} />
            ) : missingReportDetail ? (
              <View style={styles.detailBox}>
                <Text style={styles.detailSectionTitle}>{t('staffNotifMissingReport')}</Text>
                <Text style={styles.detailLine}>
                  {t('staffNotifArea', {
                    area:
                      missingReportDetail.area === 'kitchen'
                        ? t('missArea_kitchen_title')
                        : t('missArea_hotel_title'),
                  })}
                </Text>
                <Text style={styles.detailLine}>
                  {t('staffNotifItemCount', { count: missingReportDetail.item_count })}
                </Text>
                <Text style={styles.detailLine}>
                  {t('staffNotifStatus', { status: formatMissingStatus(missingReportDetail.status) })}
                </Text>
                <Text style={styles.detailLine}>
                  {t('staffNotifPriority', { priority: formatMissingPriority(missingReportDetail.priority) })}
                </Text>
                <Text style={styles.detailLine}>
                  {t('staffNotifAddedBy', { name: missingReportDetail.creator?.full_name || '—' })}
                </Text>
                <Text style={styles.detailSectionTitle}>{t('staffNotifMissingItems')}</Text>
                {(missingReportDetail.items ?? []).map((it, idx) => (
                  <Text key={idx} style={styles.detailLine}>
                    • {it.title}
                  </Text>
                ))}
                {missingReportDetail.note?.trim() ? (
                  <>
                    <Text style={styles.detailSectionTitle}>{t('missingItemsSectionNote')}</Text>
                    <Text style={styles.detailNote}>{missingReportDetail.note}</Text>
                  </>
                ) : null}
                <TouchableOpacity
                  style={styles.detailLinkBtn}
                  onPress={() => {
                    setDetailVisible(false);
                    router.push(`${missingItemsBase}/report/${missingReportDetail.id}` as never);
                  }}
                >
                  <Text style={styles.detailLinkBtnText}>{t('staffNotifOpenFullDetail')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.detailLinkBtnSecondary}
                  onPress={() => {
                    setDetailVisible(false);
                    router.push(`${missingItemsBase}/${missingReportDetail.area}` as never);
                  }}
                >
                  <Text style={styles.detailLinkBtnSecondaryText}>{t('staffNotifGoToList')}</Text>
                </TouchableOpacity>
              </View>
            ) : missingItemDetail ? (
              <View style={styles.detailBox}>
                <Text style={styles.detailSectionTitle}>{t('staffNotifMissingDetail')}</Text>
                <Text style={styles.detailLine}>{t('staffNotifTitleLine', { title: missingItemDetail.title })}</Text>
                <Text style={styles.detailLine}>
                  {t('staffNotifStatus', { status: formatMissingStatus(missingItemDetail.status) })}
                </Text>
                <Text style={styles.detailLine}>
                  {t('staffNotifPriority', { priority: formatMissingPriority(missingItemDetail.priority) })}
                </Text>
                <Text style={styles.detailLine}>
                  {t('staffNotifReminderCount', { count: missingItemDetail.reminder_count })}
                </Text>
                <Text style={styles.detailLine}>
                  {t('staffNotifAddedBy', { name: missingItemDetail.creator?.full_name || '—' })}
                </Text>
                <Text style={styles.detailLine}>
                  {t('staffNotifAddedAt', { date: fmtDate(missingItemDetail.created_at) })}
                </Text>
                {missingItemDetail.status === 'resolved' ? (
                  <Text style={styles.detailLine}>
                    {t('staffNotifResolvedBy', {
                      name: missingItemDetail.resolver?.full_name || '—',
                      date: missingItemDetail.resolved_at ? fmtDate(missingItemDetail.resolved_at) : '—',
                    })}
                  </Text>
                ) : null}
                <Text style={styles.detailSectionTitle}>{t('missingItemsSectionNote')}</Text>
                <Text style={styles.detailNote}>{missingItemDetail.description?.trim() || t('staffNotifNoNote')}</Text>
              </View>
            ) : selectedNotification?.notification_type === 'staff_personnel_warning' ? (
              <View style={{ marginTop: 8 }}>
                {personnelWarningDetail ? (
                  <View style={styles.detailBox}>
                    <Text style={styles.detailSectionTitle}>{t('staffNotifWarningRecord')}</Text>
                    <Text style={styles.detailLine}>
                      {t('staffNotifSeverity', {
                        level:
                          t(`warningSeverity_${personnelWarningDetail.severity}` as 'warningSeverity_severe') ||
                          personnelWarningDetail.severity,
                      })}
                    </Text>
                    {personnelWarningDetail.subject_line?.trim() ? (
                      <Text style={styles.detailLine}>
                        {t('staffNotifSubject', { subject: personnelWarningDetail.subject_line.trim() })}
                      </Text>
                    ) : null}
                    <Text style={styles.detailSectionTitle}>{t('staffNotifBodySection')}</Text>
                    <Text style={styles.detailNote}>{personnelWarningDetail.body.trim()}</Text>
                    <Text style={styles.detailMeta}>
                      {fmtDate(personnelWarningDetail.created_at)}
                      {personnelWarningDetail.acknowledged_at
                        ? t('staffNotifReadAt', { date: fmtDate(personnelWarningDetail.acknowledged_at) })
                        : t('staffNotifAwaitingRead')}
                    </Text>
                    {personnelWarningDetail.acknowledgement_note?.trim() ? (
                      <Text style={[styles.detailLine, { marginTop: 8 }]}>
                        {t('staffNotifYourNote', { note: personnelWarningDetail.acknowledgement_note.trim() })}
                      </Text>
                    ) : null}
                  </View>
                ) : selectedNotification.body?.trim() ? (
                  <Text style={styles.detailMeta}>{t('staffNotifWarningPartialSummary')}</Text>
                ) : (
                  <Text style={styles.detailWarn}>{t('staffNotifWarningPartialBody')}</Text>
                )}
                <TouchableOpacity
                  style={styles.warningDetailBtn}
                  onPress={openPersonnelWarningsFromDetail}
                  activeOpacity={0.85}
                >
                  <Ionicons name="document-text-outline" size={18} color="#fff" />
                  <Text style={styles.warningDetailBtnText}>{t('staffNotifOpenWarningsPage')}</Text>
                </TouchableOpacity>
              </View>
            ) : selectedNotification &&
              isEmergencyNotificationPayload(
                (selectedNotification.data ?? {}) as Record<string, unknown>,
                selectedNotification.notification_type
              ) ? (
              <View style={styles.emergencyBanner}>
                <Text style={styles.emergencyBannerText}>{t('staffEmergencyAckBanner')}</Text>
                {eventIdFromNotificationData(
                  (selectedNotification.data ?? {}) as Record<string, unknown>
                ) ? (
                  <TouchableOpacity
                    style={[
                      styles.emergencyAckBtn,
                      emergencyAcknowledged && styles.emergencyAckBtnDone,
                    ]}
                    disabled={emergencyAckSubmitting || emergencyAcknowledged}
                    onPress={async () => {
                      const eid = eventIdFromNotificationData(
                        (selectedNotification.data ?? {}) as Record<string, unknown>
                      );
                      if (!eid) return;
                      setEmergencyAckSubmitting(true);
                      const { ok, error } = await acknowledgeNotificationEvent(eid);
                      setEmergencyAckSubmitting(false);
                      if (!ok) {
                        Alert.alert(t('error'), error ?? t('unknownError'));
                        return;
                      }
                      setEmergencyAcknowledged(true);
                      Alert.alert(t('staffEmergencyAckDoneTitle'), t('staffEmergencyAckDoneBody'));
                    }}
                    activeOpacity={0.88}
                  >
                    {emergencyAckSubmitting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons
                          name={emergencyAcknowledged ? 'checkmark-circle' : 'alert-circle'}
                          size={22}
                          color="#fff"
                        />
                        <Text style={styles.emergencyAckBtnText}>
                          {emergencyAcknowledged
                            ? t('staffEmergencyAckDoneBtn')
                            : t('staffEmergencyAckBtn')}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.detailMeta, { marginTop: 8 }]}>{t('staffEmergencyAckNoEventId')}</Text>
                )}
              </View>
            ) : selectedNotification && isMissingNotification(selectedNotification) ? (
              <Text style={styles.detailWarn}>{t('staffNotifMissingLoadFailed')}</Text>
            ) : assignmentDetail ? (
              <View style={styles.detailBox}>
                <Text style={styles.detailSectionTitle}>{assignmentDetail.title}</Text>
                {assignmentDetail.body?.trim() ? (
                  <Text style={styles.detailNote}>{assignmentDetail.body.trim()}</Text>
                ) : null}
                {isAssignmentOpen(assignmentDetail.status) ? (
                  <TouchableOpacity
                    style={styles.taskCompleteDetailBtn}
                    onPress={() => {
                      setDetailVisible(false);
                      setCompleteTarget(assignmentDetail);
                    }}
                    activeOpacity={0.88}
                  >
                    <Ionicons name="checkmark-done-outline" size={18} color="#fff" />
                    <Text style={styles.taskCompleteDetailBtnText}>{t('staffTasks_completeBtn')}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.taskCompletedBadge}>
                    <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                    <Text style={styles.taskCompletedBadgeText}>{t('staffNotifTaskCompleted')}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.detailLinkBtnSecondary}
                  onPress={() => {
                    setDetailVisible(false);
                    router.push({
                      pathname: '/staff/tasks',
                      params: { focusAssignment: assignmentDetail.id },
                    } as never);
                  }}
                >
                  <Text style={styles.detailLinkBtnSecondaryText}>{t('staffNotifOpenTasksPage')}</Text>
                </TouchableOpacity>
              </View>
            ) : selectedNotification &&
              isStaffAssignmentNotification(selectedNotification.notification_type, selectedNotification.data) &&
              !detailLoading ? (
              <View style={styles.detailBox}>
                <Text style={styles.detailWarn}>{t('staffNotifTaskCompleteFailed')}</Text>
                <TouchableOpacity
                  style={styles.detailLinkBtn}
                  onPress={() => {
                    setDetailVisible(false);
                    router.push('/staff/tasks');
                  }}
                >
                  <Text style={styles.detailLinkBtnText}>{t('staffNotifOpenTasksPage')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
      <TaskCompletionSheet
        visible={!!completeTarget}
        taskTitle={completeTarget?.title ?? ''}
        saving={completing}
        onClose={() => setCompleteTarget(null)}
        onSubmit={submitTaskCompletion}
      />
    </ScrollView>
  );
}

