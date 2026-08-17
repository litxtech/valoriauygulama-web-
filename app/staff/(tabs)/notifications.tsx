import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  type ListRenderItem,
} from 'react-native';
import { useFocusEffect, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { getExpoPushTokenAsync, savePushTokenForStaff, isExpoGo } from '@/lib/notificationsPush';
import ExpoNotifications from '@/lib/expoNotificationsModule';
import { useAuthStore } from '@/stores/authStore';
import { useStaffNotificationStore } from '@/stores/staffNotificationStore';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import type { PersonelDesignPalette } from '@/constants/personelDesignSystem';
import {
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
import {
  isLongNotificationBody,
  resolveNotificationModuleHref,
} from '@/lib/notificationListInteraction';
import { useNotificationLocalization } from '@/hooks/useNotificationLocalization';
import { breakfastBriefingFromNotification } from '@/lib/breakfastMorningBriefing';
import { BreakfastBriefingNotifCard } from '@/components/breakfast/BreakfastBriefingNotifCard';
import { StaffEmergencyNotifCard } from '@/components/emergency/StaffEmergencyNotifCard';
import { CounterpartyAgreementNotifCard } from '@/components/finance/CounterpartyAgreementNotifCard';
import {
  counterpartyAgreementNotifFromData,
  isCounterpartyAgreementNotification,
} from '@/lib/financeCounterpartyAgreementNotify';
import {
  isStaffEmergencyAlertNotification,
  staffEmergencyAlertFromData,
} from '@/lib/staffEmergency';
import {
  getListCacheAgeMs,
  getListCacheRaw,
  hydrateListCache,
  setListCache,
} from '@/lib/listCache';
import { NotificationActorAvatar } from '@/components/notifications/NotificationActorAvatar';
import { useNotificationActorProfiles } from '@/hooks/useNotificationActorProfiles';

const NOTIF_LIST_TTL_MS = 60_000;

function isBreakfastBriefingNotification(n: { notification_type: string | null }): boolean {
  return n.notification_type === 'breakfast_morning_briefing';
}

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
  created_by?: string | null;
  data?: Record<string, unknown> | null;
};

function hasRichNotificationCard(n: NotifRow): boolean {
  return (
    isBreakfastBriefingNotification(n) ||
    isStaffEmergencyAlertNotification(n.notification_type) ||
    isCounterpartyAgreementNotification(n.notification_type)
  );
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
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: p.cardBorder,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  rowUnread: {
    borderColor: '#93c5fd',
    backgroundColor: p.cardBg,
  },
  rowRead: { opacity: 0.88 },
  rowContent: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  rowTextWrap: { flex: 1, minWidth: 0 },
  rowActorName: { fontSize: 12, fontWeight: '700', color: p.muted, marginBottom: 2 },
  rowChevron: { marginTop: 14 },
  rowCategory: { fontSize: 12, color: '#b8860b', fontWeight: '600', marginBottom: 4 },
  briefingTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  briefingTypePillText: { fontSize: 10, fontWeight: '800', color: '#b45309', letterSpacing: 0.4 },
  emergencyTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  emergencyTypePillText: { fontSize: 10, fontWeight: '800', color: '#dc2626', letterSpacing: 0.4 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: p.text, marginBottom: 4 },
  rowBody: { fontSize: 14, color: p.subtext, marginBottom: 8 },
  rowTime: { fontSize: 12, color: p.muted },
  expandHint: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
    marginTop: 2,
    marginBottom: 4,
  },
  rowExpanded: {
    borderColor: '#93c5fd',
  },
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
  const { staff } = useAuthStore();
  const scrollRef = useRef<FlatList<NotifRow>>(null);
  const listRef = useRef<NotifRow[]>([]);
  const lastLoadAtRef = useRef(0);
  const pushPermCheckedRef = useRef(false);
  const reloadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifCacheKeyRef = useRef('staff-notifications:pending');
  const [list, setList] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingAll, setDeletingAll] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [pushPerm, setPushPerm] = useState<'granted' | 'denied' | 'undetermined' | 'unknown'>('unknown');
  const [enablingPush, setEnablingPush] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<StaffAssignmentBrief | null>(null);
  const [completing, setCompleting] = useState(false);
  const { refresh: refreshBadge, setUnreadCount, setNotificationsScreenFocused } = useStaffNotificationStore();
  const { displayFor } = useNotificationLocalization(list, {
    staffPersist: Boolean(staff?.id),
    enabled: Boolean(staff?.id),
  });
  const { actorFor } = useNotificationActorProfiles(list);

  useEffect(() => {
    listRef.current = list;
  }, [list]);

  useEffect(() => {
    if (!staff?.id) return;
    let cancelled = false;
    const cacheKey = `staff-notifications:${staff.id}`;
    notifCacheKeyRef.current = cacheKey;
    void hydrateListCache<NotifRow>(cacheKey).then((cached) => {
      if (cancelled || !cached?.length) return;
      setList(cached);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [staff?.id]);

  const markAllAsRead = useCallback(async () => {
    if (!staff?.id) return;
    const now = new Date().toISOString();
    setList((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    setUnreadCount(0);
    await supabase
      .from('notifications')
      .update({ read_at: now })
      .eq('staff_id', staff.id)
      .is('read_at', null);
    refreshBadge();
  }, [staff?.id, refreshBadge, setUnreadCount]);

  const refreshPushPerm = useCallback(async () => {
    if (isExpoGo) return;
    try {
      const { status } = await ExpoNotifications.getPermissionsAsync();
      setPushPerm(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined');
    } catch {
      setPushPerm('unknown');
    }
  }, []);

  const load = useCallback(async (opts?: { scrollToTop?: boolean; background?: boolean; force?: boolean }) => {
    if (!staff?.id) {
      setLoading(false);
      return;
    }
    const force = opts?.force === true;
    const cacheKey = `staff-notifications:${staff.id}`;
    notifCacheKeyRef.current = cacheKey;

    const memCached = getListCacheRaw<NotifRow>(cacheKey);
    if (memCached?.length && !force) {
      setList(memCached);
      setLoading(false);
    }

    const cached = listRef.current.length ? listRef.current : memCached ?? [];
    const hadList = cached.length > 0;

    if (!opts?.background && !hadList && !force) {
      setLoading(true);
    }

    if (!force && hadList) {
      const age = getListCacheAgeMs(cacheKey);
      if (age != null && age < NOTIF_LIST_TTL_MS) {
        setLoading(false);
        if (opts?.scrollToTop) {
          requestAnimationFrame(() => {
            scrollRef.current?.scrollToOffset({ offset: 0, animated: true });
          });
        }
        return;
      }
    }

    if (!pushPermCheckedRef.current) {
      pushPermCheckedRef.current = true;
      void refreshPushPerm();
    }
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, category, notification_type, read_at, created_at, created_by, data')
      .eq('staff_id', staff.id)
      .order('created_at', { ascending: false })
      .limit(100);
    const rows = (data as NotifRow[]) ?? [];
    setList(rows);
    setListCache(cacheKey, rows);
    lastLoadAtRef.current = Date.now();
    setLoading(false);
    if (opts?.scrollToTop) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToOffset({ offset: 0, animated: true });
      });
    }
  }, [staff?.id, refreshPushPerm]);

  // Yeni bildirim gelince listeyi güncelle (beğeni/yorum push'u anında görünsün)
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
            load({ scrollToTop: true, force: true });
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
      void markAllAsRead();
      const hadList = listRef.current.length > 0;
      const cacheKey = notifCacheKeyRef.current;
      const age = getListCacheAgeMs(cacheKey);
      const stale =
        !hadList ||
        age == null ||
        age >= NOTIF_LIST_TTL_MS ||
        Date.now() - lastLoadAtRef.current >= NOTIF_LIST_TTL_MS;
      if (stale) {
        void load({ background: hadList });
      } else if (hadList) {
        setLoading(false);
      }
      return () => setNotificationsScreenFocused(false);
    }, [setUnreadCount, setNotificationsScreenFocused, load, markAllAsRead])
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
    Alert.alert(t('staffTasks_savedTitle'), t('staffTasks_taskCompletedBody'));
  };

  const staffEmergencySnapshot = (n: NotifRow) =>
    staffEmergencyAlertFromData((n.data ?? {}) as Record<string, unknown>, n.body);

  const displayTitle = (n: NotifRow) => {
    const shown = displayFor(n);
    if (isMissingNotification(n)) return shown.title?.trim() || t('staffNotifMissingReport');
    return shown.title;
  };

  const displayBody = (n: NotifRow) => {
    if (isBreakfastBriefingNotification(n)) return null;
    if (isStaffEmergencyAlertNotification(n.notification_type)) return null;
    const shown = displayFor(n);
    if (isMissingNotification(n)) return missingNotificationPreview(shown.body);
    return shown.body?.trim() || null;
  };

  const breakfastBriefingSnapshot = (n: NotifRow) =>
    breakfastBriefingFromNotification(
      (n.data ?? {}) as Record<string, unknown>,
      displayFor(n).body ?? n.body
    );

  const navCtx = useMemo(
    () => ({
      pathnameIsAdmin: !!pathname?.startsWith('/admin'),
      isStaff: true as const,
    }),
    [pathname]
  );

  const navigateNotificationModule = useCallback(
    (n: NotifRow) => {
      const payload = (n.data ?? {}) as Record<string, unknown>;
      if (isEmergencyNotificationPayload(payload, n.notification_type)) {
        void markNotificationEventOpenedFromPayload(payload);
      }
      const href = resolveNotificationModuleHref(n, navCtx);
      if (href) {
        router.push(href as never);
      }
    },
    [navCtx, router]
  );

  const shouldExpandBeforeNavigate = useCallback((n: NotifRow, body: string | null, expanded: boolean) => {
    if (expanded) return false;
    if (hasRichNotificationCard(n)) return true;
    return isLongNotificationBody(body);
  }, []);

  const onNotificationPress = useCallback(
    (n: NotifRow) => {
      if (!n.read_at) markRead(n.id);

      const body = displayBody(n);
      const expanded = expandedIds.has(n.id);
      const moduleHref = resolveNotificationModuleHref(n, navCtx);

      if (shouldExpandBeforeNavigate(n, body, expanded)) {
        setExpandedIds((prev) => {
          const next = new Set(prev);
          next.add(n.id);
          return next;
        });
        return;
      }

      if (moduleHref) {
        navigateNotificationModule(n);
        return;
      }

      if (!expanded && body && isLongNotificationBody(body)) {
        setExpandedIds((prev) => {
          const next = new Set(prev);
          next.add(n.id);
          return next;
        });
      }
    },
    [displayBody, expandedIds, markRead, navCtx, navigateNotificationModule, shouldExpandBeforeNavigate]
  );

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

  const renderItem: ListRenderItem<NotifRow> = ({ item: n }) => {
    const isTaskNotif = isStaffAssignmentNotification(n.notification_type, n.data);
    const expanded = expandedIds.has(n.id);
    const bodyText = displayBody(n);
    const collapsible = hasRichNotificationCard(n) || isLongNotificationBody(bodyText);
    const moduleHref = resolveNotificationModuleHref(n, navCtx);
    const briefingSnap = isBreakfastBriefingNotification(n) ? breakfastBriefingSnapshot(n) : null;
    const emergencySnap = isStaffEmergencyAlertNotification(n.notification_type)
      ? staffEmergencySnapshot(n)
      : null;
    const agreementSnap = isCounterpartyAgreementNotification(n.notification_type)
      ? counterpartyAgreementNotifFromData((n.data ?? {}) as Record<string, unknown>)
      : null;
    const actor = actorFor(n);
    return (
      <View
        style={[
          styles.row,
          !n.read_at ? styles.rowUnread : null,
          expanded ? styles.rowExpanded : null,
          n.read_at ? styles.rowRead : null,
        ]}
      >
        <TouchableOpacity onPress={() => onNotificationPress(n)} activeOpacity={0.8}>
          <View style={styles.rowContent}>
            <NotificationActorAvatar
              kind={actor.kind}
              name={actor.name}
              avatarUrl={actor.avatarUrl}
              unread={!n.read_at}
              size={48}
            />
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowActorName} numberOfLines={1}>
                {actor.name}
                {actor.subtitle ? ` · ${actor.subtitle}` : ''}
              </Text>
              {isBreakfastBriefingNotification(n) ? (
                <View style={styles.briefingTypePill}>
                  <Ionicons name="cafe-outline" size={12} color="#b45309" />
                  <Text style={styles.briefingTypePillText}>KAHVALTI BRİFİNGİ</Text>
                </View>
              ) : emergencySnap ? (
                <View style={styles.emergencyTypePill}>
                  <Ionicons name="warning" size={12} color="#dc2626" />
                  <Text style={styles.emergencyTypePillText}>{t('staffNotifCatEmergency').toUpperCase()}</Text>
                </View>
              ) : agreementSnap ? (
                <View style={styles.briefingTypePill}>
                  <Ionicons name="wallet-outline" size={12} color="#7c3aed" />
                  <Text style={[styles.briefingTypePillText, { color: '#5b21b6' }]}>BORÇ / ALACAK</Text>
                </View>
              ) : categoryLabel(n.category) ? (
                <Text style={styles.rowCategory}>{categoryLabel(n.category)}</Text>
              ) : null}
              <Text style={styles.rowTitle}>{displayTitle(n)}</Text>
              {briefingSnap ? (
                <BreakfastBriefingNotifCard snapshot={briefingSnap} compact={!expanded} />
              ) : emergencySnap ? (
                <StaffEmergencyNotifCard payload={emergencySnap} compact={!expanded} />
              ) : agreementSnap ? (
                <CounterpartyAgreementNotifCard snapshot={agreementSnap} compact={!expanded} />
              ) : bodyText ? (
                <Text style={styles.rowBody} numberOfLines={expanded ? undefined : isMissingNotification(n) ? 6 : 3}>
                  {bodyText}
                </Text>
              ) : null}
              {collapsible && !expanded ? (
                <Text style={styles.expandHint}>{t('staffNotifTapToExpand')}</Text>
              ) : collapsible && expanded && moduleHref ? (
                <Text style={styles.expandHint}>{t('staffNotifTapToOpenModule')}</Text>
              ) : null}
              <Text style={styles.rowTime}>{fmtDate(n.created_at)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.muted} style={styles.rowChevron} />
          </View>
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
  };

  const ListHeader = (
    <>
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
    </>
  );

  return (
    <>
      <FlatList
        ref={scrollRef}
        data={list}
        keyExtractor={(n) => n.id}
        renderItem={renderItem}
        style={[styles.container, { backgroundColor: palette.pageBg }]}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load({ force: true })} />}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color="#2b6cb0" style={{ marginVertical: 32 }} />
          ) : (
            <Text style={styles.empty}>{t('staffNotifEmpty')}</Text>
          )
        }
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
      />
      <TaskCompletionSheet
        visible={!!completeTarget}
        taskTitle={completeTarget?.title ?? ''}
        saving={completing}
        onClose={() => setCompleteTarget(null)}
        onSubmit={submitTaskCompletion}
      />
    </>
  );
}

