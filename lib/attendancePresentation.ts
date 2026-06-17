import type { AttendanceDayStatus } from '@/lib/staffAttendance';
import type { Ionicons } from '@expo/vector-icons';

type IonName = keyof typeof Ionicons.glyphMap;

export type AttendanceStatusVisual = {
  labelKey: string;
  color: string;
  bg: string;
  gradient: [string, string];
  icon: IonName;
};

const STATUS_VISUAL: Record<AttendanceDayStatus, Omit<AttendanceStatusVisual, 'labelKey'>> = {
  zamaninda: {
    color: '#166534',
    bg: '#ecfdf5',
    gradient: ['#059669', '#34d399'],
    icon: 'checkmark-circle',
  },
  gec_geldi: {
    color: '#c2410c',
    bg: '#fff7ed',
    gradient: ['#ea580c', '#fb923c'],
    icon: 'time',
  },
  devamsiz: {
    color: '#b91c1c',
    bg: '#fef2f2',
    gradient: ['#dc2626', '#f87171'],
    icon: 'close-circle',
  },
  erken_cikti: {
    color: '#1d4ed8',
    bg: '#eff6ff',
    gradient: ['#2563eb', '#60a5fa'],
    icon: 'exit-outline',
  },
  eksik_kayit: {
    color: '#475569',
    bg: '#f1f5f9',
    gradient: ['#64748b', '#94a3b8'],
    icon: 'help-circle',
  },
};

export function attendanceStatusVisual(status: AttendanceDayStatus | string | undefined): AttendanceStatusVisual {
  const key = (status ?? 'eksik_kayit') as AttendanceDayStatus;
  const base = STATUS_VISUAL[key] ?? STATUS_VISUAL.eksik_kayit;
  return { ...base, labelKey: `staffAttStatus${statusToLabelKey(key)}` };
}

function statusToLabelKey(status: AttendanceDayStatus): string {
  const map: Record<AttendanceDayStatus, string> = {
    zamaninda: 'OnTime',
    gec_geldi: 'Late',
    devamsiz: 'Absent',
    erken_cikti: 'EarlyOut',
    eksik_kayit: 'Missing',
  };
  return map[status];
}

export function adminStatusLabel(
  status: AttendanceDayStatus,
  isTr: boolean
): string {
  const tr: Record<AttendanceDayStatus, string> = {
    zamaninda: 'Zamanında',
    gec_geldi: 'Geç geldi',
    devamsiz: 'Devamsız',
    erken_cikti: 'Erken çıktı',
    eksik_kayit: 'Eksik kayıt',
  };
  const en: Record<AttendanceDayStatus, string> = {
    zamaninda: 'On time',
    gec_geldi: 'Late',
    devamsiz: 'Absent',
    erken_cikti: 'Early out',
    eksik_kayit: 'Missing',
  };
  return (isTr ? tr : en)[status];
}

export function attendanceEventIcon(eventType: string): IonName {
  const map: Record<string, IonName> = {
    check_in: 'log-in-outline',
    check_out: 'log-out-outline',
    break_start: 'cafe-outline',
    break_end: 'cafe-outline',
    late_notice: 'alarm-outline',
    manual_request: 'create-outline',
  };
  return map[eventType] ?? 'ellipse-outline';
}

export function formatAttendanceTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

export function formatElapsedClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function elapsedSecondsSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const startedAt = new Date(iso).getTime();
  if (!Number.isFinite(startedAt)) return 0;
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
}

export function formatDurationFromHours(
  hours: number | null | undefined,
  isTr = true
): string {
  if (hours == null || !Number.isFinite(hours)) return '—';
  const totalMin = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (isTr) return h > 0 ? `${h} sa ${m} dk` : `${m} dk`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatDurationBetween(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  isTr = true
): string | null {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const totalMin = Math.floor((end - start) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (isTr) return h > 0 ? `${h} sa ${m} dk` : `${m} dk`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export type AttendanceTrackingPhase = 'on_shift' | 'not_started' | 'finished';

export function attendanceTrackingPhase(row: {
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_count?: number | null;
  check_out_count?: number | null;
}): AttendanceTrackingPhase {
  const inCount = row.check_in_count ?? (row.check_in_at ? 1 : 0);
  const outCount = row.check_out_count ?? (row.check_out_at ? 1 : 0);
  if (inCount > outCount) return 'on_shift';
  if (inCount === 0) return 'not_started';
  return 'finished';
}

export function attendanceTrackingLabel(phase: AttendanceTrackingPhase, isTr: boolean): string {
  const tr: Record<AttendanceTrackingPhase, string> = {
    on_shift: 'Mesaide',
    not_started: 'Başlamadı',
    finished: 'Mesai bitti',
  };
  const en: Record<AttendanceTrackingPhase, string> = {
    on_shift: 'On shift',
    not_started: 'Not started',
    finished: 'Finished',
  };
  return (isTr ? tr : en)[phase];
}

export function attendanceTrackingColor(phase: AttendanceTrackingPhase): { bg: string; color: string } {
  if (phase === 'on_shift') return { bg: '#ecfdf5', color: '#047857' };
  if (phase === 'not_started') return { bg: '#fef2f2', color: '#b91c1c' };
  return { bg: '#eff6ff', color: '#1d4ed8' };
}

export function sortAttendanceTrackingRows<T extends { check_in_at: string | null; check_out_at: string | null; full_name: string | null }>(
  rows: T[]
): T[] {
  const rank = (row: T) => {
    const phase = attendanceTrackingPhase(row);
    if (phase === 'on_shift') return 0;
    if (phase === 'not_started') return 1;
    return 2;
  };
  return [...rows].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return (a.full_name ?? '').localeCompare(b.full_name ?? '', 'tr');
  });
}
