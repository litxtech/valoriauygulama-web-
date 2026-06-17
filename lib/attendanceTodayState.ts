import type { AttendanceEvent, AttendanceTodayResponse } from '@/lib/staffAttendance';

export type AttendanceTodayUiState = {
  today: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  firstCheckInAt: string | null;
  sessionCount: number;
  isOnShift: boolean;
  canStart: boolean;
  canEnd: boolean;
  isReady: boolean;
};

function istanbulDateKey(iso: string): string | null {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

function todayWorkEvents(
  events: AttendanceEvent[],
  today: string
): AttendanceEvent[] {
  return events
    .filter(
      (event) =>
        (event.event_type === 'check_in' || event.event_type === 'check_out') &&
        istanbulDateKey(event.event_time) === today
    )
    .sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime());
}

function resolveFromWorkEvents(
  workEvents: AttendanceEvent[],
  today: string,
  optimisticCheckInAt?: string | null
): AttendanceTodayUiState {
  let events = [...workEvents];

  if (
    optimisticCheckInAt &&
    istanbulDateKey(optimisticCheckInAt) === today &&
    (events.length === 0 || events[events.length - 1]?.event_type === 'check_out')
  ) {
    events = [
      ...events,
      {
        id: 'optimistic-check-in',
        staff_id: '',
        event_type: 'check_in',
        event_time: optimisticCheckInAt,
        source: 'mobile',
        latitude: null,
        longitude: null,
        accuracy_m: null,
        distance_to_hotel_m: null,
        location_status: 'missing',
        note: null,
        metadata: {},
      },
    ];
  }

  const lastEvent = events[events.length - 1];
  const isOnShift = lastEvent?.event_type === 'check_in';
  const checkIns = events.filter((event) => event.event_type === 'check_in');
  const checkOuts = events.filter((event) => event.event_type === 'check_out');

  return {
    today,
    checkInAt: isOnShift ? lastEvent?.event_time ?? null : null,
    checkOutAt: checkOuts[checkOuts.length - 1]?.event_time ?? null,
    firstCheckInAt: checkIns[0]?.event_time ?? null,
    sessionCount: Math.min(checkIns.length, checkOuts.length),
    isOnShift,
    canStart: !isOnShift,
    canEnd: isOnShift,
    isReady: true,
  };
}

export function resolveAttendanceTodayUiState(
  data: AttendanceTodayResponse | undefined,
  optimisticCheckInAt?: string | null
): AttendanceTodayUiState {
  const today =
    data?.today ??
    new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });

  if (!data) {
    if (
      optimisticCheckInAt &&
      istanbulDateKey(optimisticCheckInAt) === today
    ) {
      return resolveFromWorkEvents([], today, optimisticCheckInAt);
    }
    return {
      today,
      checkInAt: null,
      checkOutAt: null,
      firstCheckInAt: null,
      sessionCount: 0,
      isOnShift: false,
      canStart: true,
      canEnd: false,
      isReady: false,
    };
  }

  return resolveFromWorkEvents(todayWorkEvents(data.events ?? [], today), today, optimisticCheckInAt);
}
