import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  notifyAllStaffForAttendanceAction,
  type StaffAttendanceNotifyEvent,
} from '@/lib/staffAttendanceNotifications';
import { useAuthStore } from '@/stores/authStore';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { PressableScale } from '@/components/premium/PressableScale';
import { LiveShiftDuration } from '@/components/attendance/LiveShiftDuration';
import {
  attendanceEventIcon,
  attendanceStatusVisual,
  attendanceTrackingLabel,
  formatAttendanceTime,
  formatDurationBetween,
  formatDurationFromHours,
} from '@/lib/attendancePresentation';
import { resolveAttendanceTodayUiState } from '@/lib/attendanceTodayState';
import {
  addStaffAttendanceEvent,
  checkInStaffAttendance,
  checkOutStaffAttendance,
  getMyAttendanceToday,
  type AttendanceDayStatus,
  type AttendanceEvent,
} from '@/lib/staffAttendance';

const OFFLINE_QUEUE_KEY = 'staff_attendance_offline_queue_v1';

type OfflineQueuedAction =
  | { type: 'check_in'; payload: Record<string, unknown> }
  | { type: 'check_out'; payload: Record<string, unknown> }
  | { type: 'event'; eventType: 'late_notice' | 'manual_request'; note?: string };

export default function StaffAttendanceScreen() {
  const { t, i18n } = useTranslation();
  const palette = usePersonelDesign();
  const insets = useSafeAreaInsets();
  const staff = useAuthStore((s) => s.staff);
  const [busy, setBusy] = useState(false);
  const [actionNote, setActionNote] = useState('');

  const q = useQuery({
    queryKey: ['staff-attendance', 'today'],
    queryFn: getMyAttendanceToday,
  });

  const lang = (i18n.language || 'en').split('-')[0];
  const localeCode =
    lang === 'tr' ? 'tr-TR' : lang === 'ar' ? 'ar-SA' : lang === 'de' ? 'de-DE' : 'en-US';

  const report = q.data?.report ?? {};
  const dayStatus = (report.day_status ?? 'eksik_kayit') as AttendanceDayStatus;
  const statusVisual = attendanceStatusVisual(dayStatus);

  const statusLabel = useMemo(() => {
    const keys: Record<AttendanceDayStatus, string> = {
      zamaninda: 'staffAttStatusOnTime',
      gec_geldi: 'staffAttStatusLate',
      devamsiz: 'staffAttStatusAbsent',
      erken_cikti: 'staffAttStatusEarlyOut',
      eksik_kayit: 'staffAttStatusMissing',
    };
    return t(keys[dayStatus]);
  }, [dayStatus, t]);

  const todayLabel = useMemo(() => {
    const d = q.data?.today ? new Date(`${q.data.today}T12:00:00`) : new Date();
    return d.toLocaleDateString(localeCode, { weekday: 'long', day: 'numeric', month: 'long' });
  }, [localeCode, q.data?.today]);

  const eventTypeLabel = useCallback(
    (eventType: string) => {
      const labels: Record<string, string> = {
        check_in: t('staffAttEventCheckIn'),
        check_out: t('staffAttEventCheckOut'),
        break_start: t('staffAttEventBreakStart'),
        break_end: t('staffAttEventBreakEnd'),
        late_notice: t('staffAttEventLateNotice'),
        manual_request: t('staffAttEventManualRequest'),
      };
      return labels[eventType] ?? eventType;
    },
    [t]
  );

  const loadQueue = useCallback(async (): Promise<OfflineQueuedAction[]> => {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as OfflineQueuedAction[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, []);

  const saveQueue = useCallback(async (items: OfflineQueuedAction[]) => {
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
  }, []);

  const appendQueue = useCallback(
    async (item: OfflineQueuedAction) => {
      const current = await loadQueue();
      current.push(item);
      await saveQueue(current);
    },
    [loadQueue, saveQueue]
  );

  const flushOfflineQueue = useCallback(async () => {
    const current = await loadQueue();
    if (!current.length) return;
    const remaining: OfflineQueuedAction[] = [];
    for (const item of current) {
      try {
        if (item.type === 'check_in') {
          await checkInStaffAttendance(item.payload);
        } else if (item.type === 'check_out') {
          await checkOutStaffAttendance(item.payload);
        } else {
          await addStaffAttendanceEvent(item.eventType, item.note);
        }
      } catch {
        remaining.push(item);
      }
    }
    await saveQueue(remaining);
  }, [loadQueue, saveQueue]);

  const getLocationPayload = useCallback(async () => {
    const p = await Location.requestForegroundPermissionsAsync();
    if (p.status !== 'granted') {
      return { latitude: null, longitude: null, accuracyM: null, note: t('staffAttLocPermDenied') };
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracyM: pos.coords.accuracy,
      note: null as string | null,
    };
  }, [t]);

  const notifyStaffForAttendanceAction = useCallback(
    async (event: StaffAttendanceNotifyEvent, note?: string) => {
      await notifyAllStaffForAttendanceAction(staff, event, t, note);
    },
    [staff, t]
  );

  const handleAction = useCallback(
    async (type: 'check_in' | 'check_out') => {
      try {
        setBusy(true);
        await flushOfflineQueue();
        const loc = await getLocationPayload();
        const noteText = actionNote.trim();
        const payload = {
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracyM: loc.accuracyM,
          note: noteText || loc.note,
          source: 'mobile' as const,
          eventTime: new Date().toISOString(),
          deviceInfo: {
            platform: Constants.platform?.ios ? 'ios' : Constants.platform?.android ? 'android' : 'unknown',
            appVersion: Constants.expoConfig?.version ?? 'unknown',
          },
        };
        if (type === 'check_in') {
          await checkInStaffAttendance(payload);
          void notifyStaffForAttendanceAction('check_in', noteText || undefined);
          Alert.alert(t('staffAttSuccess'), t('staffAttCheckInRecorded'));
        } else {
          await checkOutStaffAttendance(payload);
          void notifyStaffForAttendanceAction('check_out', noteText || undefined);
          Alert.alert(t('staffAttSuccess'), t('staffAttCheckOutRecorded'));
        }
        setActionNote('');
        await q.refetch();
      } catch (error) {
        const message = error instanceof Error ? error.message : t('staffAttUnknownError');
        if (/network|fetch|connection/i.test(message)) {
          await appendQueue({ type, payload: { eventTime: new Date().toISOString(), source: 'offline_sync' } });
          Alert.alert(t('staffAttSavedOffline'), t('staffAttOfflineSync'));
        } else {
          Alert.alert(t('staffAttActionFailed'), message);
        }
      } finally {
        setBusy(false);
      }
    },
    [actionNote, appendQueue, flushOfflineQueue, getLocationPayload, notifyStaffForAttendanceAction, q, t]
  );

  const addQuickEvent = useCallback(
    async (eventType: 'late_notice' | 'manual_request') => {
      const note =
        actionNote.trim() ||
        (eventType === 'late_notice' ? t('staffAttRunningLateNotice') : t('staffAttManualRequest'));
      try {
        setBusy(true);
        await addStaffAttendanceEvent(eventType, note);
        void notifyStaffForAttendanceAction(
          eventType === 'late_notice' ? 'late_notice' : 'manual_request',
          note
        );
        setActionNote('');
        await q.refetch();
        Alert.alert(t('staffAttSuccess'), t('staffAttNotifyTitle'));
      } catch (error) {
        const message = error instanceof Error ? error.message : t('staffAttUnknownError');
        if (/network|fetch|connection/i.test(message)) {
          await appendQueue({ type: 'event', eventType, note });
          Alert.alert(t('staffAttSavedOffline'), t('staffAttRequestOffline'));
        } else {
          Alert.alert(t('staffAttCouldNotSave'), message);
        }
      } finally {
        setBusy(false);
      }
    },
    [actionNote, appendQueue, notifyStaffForAttendanceAction, q, t]
  );

  const events = q.data?.events ?? [];
  const ui = resolveAttendanceTodayUiState(q.data);
  const checkInAt = ui.checkInAt;
  const checkOutAt = ui.checkOutAt;
  const summaryCheckInAt = checkInAt ?? ui.firstCheckInAt;
  const isOnShift = ui.isOnShift;
  const canStart = ui.canStart;
  const canEnd = ui.canEnd;
  const trackingLabel = attendanceTrackingLabel(
    isOnShift ? 'on_shift' : canStart ? 'not_started' : 'finished',
    lang === 'tr'
  );

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: palette.pageBg }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
      refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} tintColor={palette.indigo} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Durum hero */}
      <LinearGradient colors={statusVisual.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroDecor} pointerEvents="none" />
        <View style={styles.heroTop}>
          <View style={styles.heroDateCol}>
            <Text style={styles.heroDateLabel}>{t('staffAttTodayDate')}</Text>
            <Text style={styles.heroDate}>{todayLabel}</Text>
          </View>
          <PressableScale onPress={() => q.refetch()} disabled={q.isFetching} style={styles.refreshChip}>
            {q.isFetching ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="refresh" size={18} color="#fff" />
            )}
          </PressableScale>
        </View>
        <View style={styles.heroStatusRow}>
          <View style={styles.heroIconBubble}>
            <Ionicons name={statusVisual.icon} size={28} color="#fff" />
          </View>
          <View style={styles.heroStatusCol}>
            <Text style={styles.heroStatusLabel}>{trackingLabel}</Text>
            <Text style={styles.heroStatusValue}>{statusLabel}</Text>
            {isOnShift && checkInAt ? (
              <View style={styles.heroLiveRow}>
                <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.9)" />
                <LiveShiftDuration startedAt={checkInAt} textStyle={styles.heroLiveText} />
              </View>
            ) : null}
          </View>
        </View>
      </LinearGradient>

      {/* Özet */}
      <View style={[styles.summaryCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: palette.muted }]}>{t('staffAttCheckIn')}</Text>
          <Text style={[styles.summaryValue, { color: palette.text }]}>
            {formatAttendanceTime(summaryCheckInAt, localeCode)}
          </Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: palette.cardBorder }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: palette.muted }]}>{t('staffAttCheckOut')}</Text>
          <Text style={[styles.summaryValue, { color: palette.text }]}>
            {formatAttendanceTime(checkOutAt, localeCode)}
          </Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: palette.cardBorder }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: palette.muted }]}>{t('staffAttTotalHours')}</Text>
          {isOnShift && checkInAt ? (
            <LiveShiftDuration
              startedAt={checkInAt}
              textStyle={[styles.summaryValue, { color: palette.text }]}
            />
          ) : (
            <Text style={[styles.summaryValue, { color: palette.text }]}>
              {formatDurationFromHours(report.total_hours, lang === 'tr')}
            </Text>
          )}
        </View>
      </View>

      {/* Ana aksiyonlar */}
      <View style={styles.actionRow}>
        <PressableScale
          style={[styles.actionHalf, !canStart ? styles.actionDimmed : undefined]}
          onPress={() => handleAction('check_in')}
          disabled={busy || !canStart}
        >
          <LinearGradient colors={['#2563eb', '#6366f1']} style={styles.actionBtn}>
            <Ionicons name="play-circle" size={26} color="#fff" />
            <Text style={styles.actionBtnText}>{t('staffAttStartWork')}</Text>
          </LinearGradient>
        </PressableScale>
        <PressableScale
          style={[styles.actionHalf, !canEnd ? styles.actionDimmed : undefined]}
          onPress={() => handleAction('check_out')}
          disabled={busy || !canEnd}
        >
          <LinearGradient colors={['#0f766e', '#14b8a6']} style={styles.actionBtn}>
            <Ionicons name="stop-circle" size={26} color="#fff" />
            <Text style={styles.actionBtnText}>{t('staffAttEndWork')}</Text>
          </LinearGradient>
        </PressableScale>
      </View>

      {/* Not */}
      <View style={[styles.noteCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
        <Text style={[styles.sectionLabel, { color: palette.text }]}>{t('staffAttNoteLabel')}</Text>
        <TextInput
          value={actionNote}
          onChangeText={setActionNote}
          placeholder={t('staffAttNotePlaceholder')}
          placeholderTextColor={palette.muted}
          style={[styles.noteInput, { color: palette.text, borderColor: palette.cardBorder, backgroundColor: palette.pageBg }]}
          multiline
          editable={!busy}
        />
      </View>

      {/* Hızlı işlemler */}
      <View style={styles.quickRow}>
        <PressableScale style={styles.quickHalf} onPress={() => addQuickEvent('late_notice')} disabled={busy}>
          <View style={[styles.quickCard, { backgroundColor: '#fff7ed', borderColor: '#fed7aa' }]}>
            <Ionicons name="alarm-outline" size={22} color="#ea580c" />
            <Text style={styles.quickLabel}>{t('staffAttRunningLate')}</Text>
          </View>
        </PressableScale>
        <PressableScale style={styles.quickHalf} onPress={() => addQuickEvent('manual_request')} disabled={busy}>
          <View style={[styles.quickCard, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
            <Ionicons name="create-outline" size={22} color="#2563eb" />
            <Text style={styles.quickLabel}>{t('staffAttManualRequest')}</Text>
          </View>
        </PressableScale>
      </View>

      {/* Zaman çizelgesi */}
      <Text style={[styles.sectionLabel, { color: palette.text, marginTop: 4 }]}>{t('staffAttTimelineTitle')}</Text>
      {events.length === 0 ? (
        <View style={[styles.emptyBox, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
          <Ionicons name="time-outline" size={32} color={palette.muted} />
          <Text style={[styles.emptyText, { color: palette.muted }]}>{t('staffAttNoRecordsToday')}</Text>
        </View>
      ) : (
        events.map((item, idx) => (
          <TimelineRow
            key={item.id}
            item={item}
            previousTime={idx > 0 ? events[idx - 1]?.event_time ?? null : null}
            isLast={idx === events.length - 1}
            localeCode={localeCode}
            isTr={lang === 'tr'}
            eventTypeLabel={eventTypeLabel}
            palette={palette}
          />
        ))
      )}
    </ScrollView>
  );
}

function TimelineRow({
  item,
  previousTime,
  isLast,
  localeCode,
  isTr,
  eventTypeLabel,
  palette,
}: {
  item: AttendanceEvent;
  previousTime: string | null;
  isLast: boolean;
  localeCode: string;
  isTr: boolean;
  eventTypeLabel: (t: string) => string;
  palette: ReturnType<typeof usePersonelDesign>;
}) {
  const icon = attendanceEventIcon(item.event_type);
  const isCheckIn = item.event_type === 'check_in';
  const gapLabel = formatDurationBetween(previousTime, item.event_time, isTr);

  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineRail}>
        <View style={[styles.timelineDot, { backgroundColor: isCheckIn ? '#16a34a' : palette.indigo }]} />
        {!isLast ? <View style={[styles.timelineLine, { backgroundColor: palette.cardBorder }]} /> : null}
      </View>
      <View style={[styles.timelineCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
        <View style={styles.timelineHead}>
          <View style={[styles.timelineIcon, { backgroundColor: `${isCheckIn ? '#16a34a' : palette.indigo}18` }]}>
            <Ionicons name={icon} size={18} color={isCheckIn ? '#16a34a' : palette.indigo} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.timelineTitle, { color: palette.text }]}>{eventTypeLabel(item.event_type)}</Text>
            <Text style={[styles.timelineMeta, { color: palette.muted }]}>
              {formatAttendanceTime(item.event_time, localeCode)}
              {gapLabel ? ` · +${gapLabel}` : ''}
            </Text>
          </View>
        </View>
        {item.note ? (
          <Text style={[styles.timelineNote, { color: palette.subtext, borderTopColor: palette.cardBorder }]}>
            {item.note}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, gap: 14 },
  hero: {
    borderRadius: 22,
    padding: 18,
    overflow: 'hidden',
    minHeight: 140,
  },
  heroDecor: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroDateCol: { flex: 1 },
  heroDateLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  heroDate: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 2 },
  refreshChip: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 18 },
  heroIconBubble: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStatusCol: { flex: 1 },
  heroStatusLabel: { color: 'rgba(255,255,255,0.88)', fontSize: 13, fontWeight: '600' },
  heroStatusValue: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 2 },
  heroLiveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  heroLiveText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  summaryCard: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryLabel: { fontSize: 11, fontWeight: '600' },
  summaryValue: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  summaryDivider: { width: 1, alignSelf: 'stretch' },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionHalf: { flex: 1 },
  actionDimmed: { opacity: 0.42 },
  actionBtn: {
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 88,
  },
  actionBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  noteCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  sectionLabel: { fontSize: 14, fontWeight: '800' },
  noteInput: {
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  quickRow: { flexDirection: 'row', gap: 10 },
  quickHalf: { flex: 1 },
  quickCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
    gap: 8,
    minHeight: 88,
    justifyContent: 'center',
  },
  quickLabel: { fontSize: 13, fontWeight: '700', color: '#334155', textAlign: 'center' },
  emptyBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  timelineRow: { flexDirection: 'row', gap: 10 },
  timelineRail: { width: 16, alignItems: 'center' },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 18 },
  timelineLine: { flex: 1, width: 2, marginTop: 4, marginBottom: -8, borderRadius: 1 },
  timelineCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  timelineHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timelineIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  timelineTitle: { fontSize: 14, fontWeight: '700' },
  timelineMeta: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  timelineNote: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    fontSize: 13,
    lineHeight: 18,
  },
});
