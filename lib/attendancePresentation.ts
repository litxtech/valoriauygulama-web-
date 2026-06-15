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
