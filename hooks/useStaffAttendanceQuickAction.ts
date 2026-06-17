import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { resolveAttendanceTodayUiState } from '@/lib/attendanceTodayState';
import {
  notifyAllStaffForAttendanceAction,
  type StaffAttendanceNotifyEvent,
} from '@/lib/staffAttendanceNotifications';
import {
  checkInStaffAttendance,
  checkOutStaffAttendance,
  getMyAttendanceToday,
} from '@/lib/staffAttendance';
import { useAuthStore } from '@/stores/authStore';

const OFFLINE_QUEUE_KEY = 'staff_attendance_offline_queue_v1';

type OfflineQueuedAction =
  | { type: 'check_in'; payload: Record<string, unknown> }
  | { type: 'check_out'; payload: Record<string, unknown> };

async function loadQueue(): Promise<OfflineQueuedAction[]> {
  const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as OfflineQueuedAction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveQueue(items: OfflineQueuedAction[]) {
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
}

type Options = {
  queryEnabled?: boolean;
  refreshOnMount?: boolean;
};

export function useStaffAttendanceQuickAction(options?: Options) {
  const { t } = useTranslation();
  const staff = useAuthStore((s) => s.staff);
  const [busy, setBusy] = useState(false);
  const [optimisticCheckInAt, setOptimisticCheckInAt] = useState<string | null>(null);
  const queryEnabled = options?.queryEnabled ?? true;

  const q = useQuery({
    queryKey: ['staff-attendance', 'today'],
    queryFn: getMyAttendanceToday,
    enabled: queryEnabled,
    staleTime: 60_000,
    refetchOnMount: 'always',
  });

  const refetchAttendance = q.refetch;

  useEffect(() => {
    if (!queryEnabled || !options?.refreshOnMount) return;
    void refetchAttendance();
  }, [queryEnabled, options?.refreshOnMount, refetchAttendance]);

  const ui = resolveAttendanceTodayUiState(q.data, optimisticCheckInAt);

  useEffect(() => {
    if (!optimisticCheckInAt) return;
    const serverUi = resolveAttendanceTodayUiState(q.data, null);
    if (serverUi.isOnShift) {
      setOptimisticCheckInAt(null);
    }
  }, [q.data, optimisticCheckInAt]);

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
        }
      } catch {
        remaining.push(item);
      }
    }
    await saveQueue(remaining);
  }, []);

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
    async (event: StaffAttendanceNotifyEvent) => {
      await notifyAllStaffForAttendanceAction(staff, event, t);
    },
    [staff, t]
  );

  const handleAction = useCallback(
    async (type: 'check_in' | 'check_out') => {
      const current = resolveAttendanceTodayUiState(q.data, optimisticCheckInAt);
      if (type === 'check_in' && !current.canStart) return;
      if (type === 'check_out' && !current.canEnd) return;

      try {
        setBusy(true);
        if (type === 'check_in') {
          setOptimisticCheckInAt(new Date().toISOString());
        } else {
          setOptimisticCheckInAt(null);
        }
        await flushOfflineQueue();
        const loc = await getLocationPayload();
        const payload = {
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracyM: loc.accuracyM,
          note: loc.note,
          source: 'mobile' as const,
          eventTime: new Date().toISOString(),
          deviceInfo: {
            platform: Constants.platform?.ios ? 'ios' : Constants.platform?.android ? 'android' : 'unknown',
            appVersion: Constants.expoConfig?.version ?? 'unknown',
          },
        };
        if (type === 'check_in') {
          setOptimisticCheckInAt(payload.eventTime);
          await checkInStaffAttendance(payload);
          void notifyStaffForAttendanceAction('check_in');
          Alert.alert(t('staffAttSuccess'), t('staffAttCheckInRecorded'));
        } else {
          await checkOutStaffAttendance(payload);
          void notifyStaffForAttendanceAction('check_out');
          Alert.alert(t('staffAttSuccess'), t('staffAttCheckOutRecorded'));
        }
        await q.refetch();
      } catch (error) {
        if (type === 'check_in') {
          setOptimisticCheckInAt(null);
        }
        const message = error instanceof Error ? error.message : t('staffAttUnknownError');
        if (/zaten giris|already checked|already.*check/i.test(message)) {
          await q.refetch();
        }
        if (/Halen mesaidesiniz|Acik mesai kaydi yok/i.test(message)) {
          await q.refetch();
        }
        if (/network|fetch|connection/i.test(message)) {
          const currentQueue = await loadQueue();
          currentQueue.push({ type, payload: { eventTime: new Date().toISOString(), source: 'offline_sync' } });
          await saveQueue(currentQueue);
          if (type === 'check_in') {
            setOptimisticCheckInAt(new Date().toISOString());
          }
          Alert.alert(t('staffAttSavedOffline'), t('staffAttOfflineSync'));
        } else {
          Alert.alert(t('staffAttActionFailed'), message);
        }
      } finally {
        setBusy(false);
      }
    },
    [flushOfflineQueue, getLocationPayload, notifyStaffForAttendanceAction, optimisticCheckInAt, q, t]
  );

  return {
    busy,
    checkInAt: ui.checkInAt,
    isOnShift: ui.isOnShift,
    canStart: ui.canStart,
    canEnd: ui.canEnd,
    sessionCount: ui.sessionCount,
    isReady: ui.isReady,
    onCheckIn: () => handleAction('check_in'),
    onCheckOut: () => handleAction('check_out'),
  };
}
