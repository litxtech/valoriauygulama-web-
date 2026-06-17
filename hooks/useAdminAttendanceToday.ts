import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { sendNotification } from '@/lib/notificationService';
import {
  attendanceTrackingPhase,
  sortAttendanceTrackingRows,
} from '@/lib/attendancePresentation';
import type { AttendanceDayStatus } from '@/lib/staffAttendance';
import { useAuthStore } from '@/stores/authStore';

export type AdminAttendanceRow = {
  work_date: string;
  staff_id: string;
  full_name: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  last_check_in_at?: string | null;
  check_in_count?: number | null;
  check_out_count?: number | null;
  late_minutes: number | null;
  total_hours: number | null;
  day_status: AttendanceDayStatus;
};

export type AdminAttendanceFilter = 'all' | 'on_shift' | 'finished' | 'not_started';

function todayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

type Options = {
  enabled?: boolean;
  previewLimit?: number;
};

export function useAdminAttendanceToday(options?: Options) {
  const { i18n } = useTranslation();
  const staff = useAuthStore((s) => s.staff);
  const enabled = options?.enabled ?? true;
  const previewLimit = options?.previewLimit ?? 5;
  const [sendingNoCheckIn, setSendingNoCheckIn] = useState(false);

  const today = todayKey();
  const isTr = i18n.language?.toLowerCase().startsWith('tr');
  const localeCode = isTr ? 'tr-TR' : 'en-US';

  const dailyQuery = useQuery({
    queryKey: ['admin-attendance', 'day', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_attendance_daily_report')
        .select('*')
        .eq('work_date', today)
        .order('full_name', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as AdminAttendanceRow[];
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: enabled ? 30_000 : false,
    refetchOnMount: 'always',
  });

  const trackingStats = useMemo(() => {
    const data = dailyQuery.data ?? [];
    return {
      total: data.length,
      onShift: data.filter((r) => attendanceTrackingPhase(r) === 'on_shift').length,
      finished: data.filter((r) => attendanceTrackingPhase(r) === 'finished').length,
      notStarted: data.filter((r) => attendanceTrackingPhase(r) === 'not_started').length,
      late: data.filter((r) => r.day_status === 'gec_geldi').length,
    };
  }, [dailyQuery.data]);

  const sortedRows = useMemo(
    () => sortAttendanceTrackingRows(dailyQuery.data ?? []),
    [dailyQuery.data]
  );

  const previewRows = useMemo(() => sortedRows.slice(0, previewLimit), [previewLimit, sortedRows]);

  const noCheckInRows = useMemo(
    () => (dailyQuery.data ?? []).filter((r) => attendanceTrackingPhase(r) === 'not_started'),
    [dailyQuery.data]
  );

  const refresh = useCallback(async () => {
    await dailyQuery.refetch();
  }, [dailyQuery]);

  const sendNoCheckInNotification = useCallback(
    async (manualNote?: string) => {
      if (noCheckInRows.length === 0) {
        Alert.alert(
          isTr ? 'Bilgi' : 'Info',
          isTr ? 'Bugün giriş yapmayan personel yok.' : 'No staff without check-in today.'
        );
        return;
      }
      if (!staff?.id) {
        Alert.alert(
          isTr ? 'Hata' : 'Error',
          isTr ? 'Oturum bilgisi bulunamadı.' : 'Session information is missing.'
        );
        return;
      }

      try {
        setSendingNoCheckIn(true);
        const bodyText =
          manualNote?.trim() ||
          (isTr
            ? 'Bugün neden giriş yapmadınız? Lütfen mesai ekranından bilgi notu bırakın.'
            : 'Why did you not check in today? Please leave a note on the attendance screen.');
        const titleText = isTr ? 'Mesai Giriş Hatırlatması' : 'Attendance Check-in Reminder';

        const results = await Promise.all(
          noCheckInRows.map((row) =>
            sendNotification({
              staffId: row.staff_id,
              title: titleText,
              body: bodyText,
              notificationType: 'attendance_missing_checkin',
              category: 'staff',
              createdByStaffId: staff.id,
              data: { screen: 'staff/attendance/index', date: today },
            })
          )
        );
        const failedCount = results.filter((r) => !!r.error).length;
        const okCount = results.length - failedCount;
        Alert.alert(
          isTr ? 'Bildirim gönderildi' : 'Notification sent',
          isTr
            ? `${okCount} personele gönderildi${failedCount > 0 ? `, ${failedCount} kişide hata var.` : '.'}`
            : `Sent to ${okCount} staff${failedCount > 0 ? `, ${failedCount} failed.` : '.'}`
        );
      } catch (error) {
        Alert.alert(
          isTr ? 'Hata' : 'Error',
          error instanceof Error ? error.message : isTr ? 'Bilinmeyen hata' : 'Unknown error'
        );
      } finally {
        setSendingNoCheckIn(false);
      }
    },
    [isTr, noCheckInRows, staff?.id, today]
  );

  return {
    today,
    isTr,
    localeCode,
    dailyQuery,
    trackingStats,
    sortedRows,
    previewRows,
    noCheckInRows,
    sendingNoCheckIn,
    refresh,
    sendNoCheckInNotification,
  };
}
