import { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { adminTheme as T } from '@/constants/adminTheme';
import {
  adminStatusLabel,
  attendanceStatusVisual,
  attendanceTrackingPhase,
  formatAttendanceTime,
  formatDurationFromHours,
} from '@/lib/attendancePresentation';
import type { AttendanceDayStatus } from '@/lib/staffAttendance';

type AttendanceRow = {
  work_date: string;
  staff_id: string;
  full_name: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_count?: number | null;
  check_out_count?: number | null;
  late_minutes: number | null;
  total_hours: number | null;
  day_status: AttendanceDayStatus;
};

function staffInitials(name: string | null | undefined): string {
  const parts = (name ?? '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('tr-TR');
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toLocaleUpperCase('tr-TR');
}

export default function AdminAttendanceStaffDetailScreen() {
  const { staffId } = useLocalSearchParams<{ staffId: string }>();
  const { i18n } = useTranslation();
  const isTr = i18n.language?.toLowerCase().startsWith('tr');
  const localeCode = isTr ? 'tr-TR' : 'en-US';
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 8)}01`;

  const query = useQuery({
    queryKey: ['admin-attendance', 'detail', staffId, monthStart, today],
    enabled: typeof staffId === 'string' && staffId.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_attendance_daily_report')
        .select('*')
        .eq('staff_id', staffId)
        .gte('work_date', monthStart)
        .lte('work_date', today)
        .order('work_date', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as AttendanceRow[];
    },
  });

  const summary = useMemo(() => {
    const rows = query.data ?? [];
    const first = rows[0];
    const totalDays = rows.length;
    const onTime = rows.filter((r) => r.day_status === 'zamaninda').length;
    const lateDays = rows.filter((r) => r.day_status === 'gec_geldi').length;
    const checkInDays = rows.filter((r) => !!r.check_in_at).length;
    const avgLate =
      lateDays > 0
        ? rows.filter((r) => r.day_status === 'gec_geldi').reduce((acc, r) => acc + (r.late_minutes ?? 0), 0) / lateDays
        : 0;
    const punctualityRate = totalDays > 0 ? (onTime / totalDays) * 100 : 0;
    const todayRow = rows.find((r) => r.work_date === today);
    return {
      fullName: first?.full_name ?? '—',
      totalDays,
      onTime,
      lateDays,
      checkInDays,
      avgLate,
      punctualityRate,
      todayRow,
    };
  }, [query.data, today]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={query.isFetching} onRefresh={() => query.refetch()} tintColor={T.colors.accent} />
      }
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={['#0f172a', '#1e3b82', '#2563eb']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{staffInitials(summary.fullName)}</Text>
          </View>
          <View style={styles.heroTextCol}>
            <Text style={styles.heroName}>{summary.fullName}</Text>
            <Text style={styles.heroSub}>
              {isTr ? 'Aylık mesai özeti' : 'Monthly attendance summary'}
            </Text>
          </View>
        </View>
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>%{summary.punctualityRate.toFixed(0)}</Text>
            <Text style={styles.heroStatLabel}>{isTr ? 'Zamanında' : 'On time'}</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{summary.checkInDays}</Text>
            <Text style={styles.heroStatLabel}>{isTr ? 'Giriş günü' : 'Check-in days'}</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{summary.lateDays}</Text>
            <Text style={styles.heroStatLabel}>{isTr ? 'Geç kalma' : 'Late days'}</Text>
          </View>
        </View>
      </LinearGradient>

      {summary.todayRow ? (
        <View style={styles.todayCard}>
          <Text style={styles.todayLabel}>{isTr ? 'Bugün' : 'Today'}</Text>
          <View style={styles.todayMetrics}>
            <View style={styles.todayMetric}>
              <Text style={styles.todayMetricLabel}>{isTr ? 'Giriş' : 'In'}</Text>
              <Text style={styles.todayMetricValue}>
                {formatAttendanceTime(summary.todayRow.check_in_at, localeCode)}
              </Text>
            </View>
            <View style={styles.todayMetric}>
              <Text style={styles.todayMetricLabel}>{isTr ? 'Çıkış' : 'Out'}</Text>
              <Text style={styles.todayMetricValue}>
                {formatAttendanceTime(summary.todayRow.check_out_at, localeCode)}
              </Text>
            </View>
            <View style={styles.todayMetric}>
              <Text style={styles.todayMetricLabel}>{isTr ? 'Süre' : 'Duration'}</Text>
              <Text style={styles.todayMetricValue}>
                {formatDurationFromHours(summary.todayRow.total_hours, isTr)}
              </Text>
            </View>
          </View>
          <View style={styles.todayPhasePill}>
            <Text style={styles.todayPhaseText}>
              {attendanceTrackingPhase(summary.todayRow) === 'on_shift'
                ? isTr
                  ? 'Mesaide'
                  : 'On shift'
                : attendanceTrackingPhase(summary.todayRow) === 'not_started'
                  ? isTr
                    ? 'Başlamadı'
                    : 'Not started'
                  : isTr
                    ? 'Mesai bitti'
                    : 'Finished'}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{summary.totalDays}</Text>
          <Text style={styles.kpiLabel}>{isTr ? 'Kayıtlı gün' : 'Recorded days'}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{summary.avgLate.toFixed(0)}</Text>
          <Text style={styles.kpiLabel}>{isTr ? 'Ort. geç (dk)' : 'Avg late (min)'}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>{isTr ? 'Günlük geçmiş' : 'Daily history'}</Text>

      {(query.data ?? []).map((row) => {
        const visual = attendanceStatusVisual(row.day_status);
        const sessions = Math.max(row.check_in_count ?? 0, row.check_out_count ?? 0);

        return (
          <View key={`${row.staff_id}-${row.work_date}`} style={styles.dayCard}>
            <View style={[styles.dayAccent, { backgroundColor: visual.color }]} />
            <View style={styles.dayBody}>
              <View style={styles.dayHead}>
                <View style={styles.datePill}>
                  <Ionicons name="calendar-outline" size={14} color={T.colors.info} />
                  <Text style={styles.dateText}>
                    {new Date(`${row.work_date}T12:00:00`).toLocaleDateString(localeCode, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: visual.bg }]}>
                  <Ionicons name={visual.icon} size={13} color={visual.color} />
                  <Text style={[styles.statusBadgeText, { color: visual.color }]}>
                    {adminStatusLabel(row.day_status, isTr)}
                  </Text>
                </View>
              </View>

              <View style={styles.dayMetrics}>
                <View style={styles.dayMetric}>
                  <Ionicons name="log-in-outline" size={14} color="#16a34a" />
                  <Text style={styles.dayMetricText}>
                    {formatAttendanceTime(row.check_in_at, localeCode)}
                  </Text>
                </View>
                <View style={styles.dayMetric}>
                  <Ionicons name="log-out-outline" size={14} color="#d97706" />
                  <Text style={styles.dayMetricText}>
                    {formatAttendanceTime(row.check_out_at, localeCode)}
                  </Text>
                </View>
                <View style={styles.dayMetric}>
                  <Ionicons name="hourglass-outline" size={14} color="#6366f1" />
                  <Text style={styles.dayMetricText}>{formatDurationFromHours(row.total_hours, isTr)}</Text>
                </View>
              </View>

              {(row.late_minutes ?? 0) > 0 ? (
                <Text style={styles.lateLine}>
                  {isTr ? 'Geç kalma' : 'Late'}: {row.late_minutes} {isTr ? 'dk' : 'min'}
                </Text>
              ) : null}
              {sessions > 1 ? (
                <Text style={styles.sessionLine}>
                  {isTr ? `${sessions} mesai oturumu` : `${sessions} work sessions`}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}

      {(query.data ?? []).length === 0 && !query.isLoading ? (
        <Text style={styles.emptyText}>{isTr ? 'Bu ay için kayıt yok' : 'No records this month'}</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.surfaceSecondary },
  content: { padding: T.spacing.lg, paddingBottom: 32, gap: T.spacing.md },
  hero: {
    borderRadius: T.radius.xl,
    padding: T.spacing.lg,
    gap: T.spacing.lg,
    ...T.shadow.md,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  heroTextCol: { flex: 1 },
  heroName: { color: '#fff', fontSize: 22, fontWeight: '900' },
  heroSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4, fontWeight: '600' },
  heroStats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: T.radius.md,
    paddingVertical: 12,
  },
  heroStat: { flex: 1, alignItems: 'center', gap: 2 },
  heroStatDivider: { width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.2)' },
  heroStatValue: { color: '#fff', fontSize: 20, fontWeight: '900' },
  heroStatLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600' },
  todayCard: {
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
    padding: 14,
    gap: 10,
    ...T.shadow.sm,
  },
  todayLabel: { fontSize: 12, fontWeight: '800', color: T.colors.textMuted, textTransform: 'uppercase' },
  todayMetrics: { flexDirection: 'row', gap: 8 },
  todayMetric: {
    flex: 1,
    backgroundColor: T.colors.surfaceSecondary,
    borderRadius: T.radius.md,
    padding: 10,
    alignItems: 'center',
    gap: 4,
  },
  todayMetricLabel: { fontSize: 10, fontWeight: '700', color: T.colors.textMuted },
  todayMetricValue: { fontSize: 15, fontWeight: '900', color: T.colors.text, fontVariant: ['tabular-nums'] },
  todayPhasePill: {
    alignSelf: 'flex-start',
    backgroundColor: T.colors.infoLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: T.radius.full,
  },
  todayPhaseText: { fontSize: 12, fontWeight: '800', color: T.colors.info },
  kpiRow: { flexDirection: 'row', gap: 10 },
  kpiCard: {
    flex: 1,
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
    padding: 14,
    ...T.shadow.sm,
  },
  kpiValue: { fontSize: 22, fontWeight: '900', color: T.colors.text },
  kpiLabel: { fontSize: 12, color: T.colors.textMuted, marginTop: 4, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: T.colors.text, marginTop: 4 },
  dayCard: {
    flexDirection: 'row',
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
    overflow: 'hidden',
    ...T.shadow.sm,
  },
  dayAccent: { width: 4 },
  dayBody: { flex: 1, padding: 14, gap: 10 },
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: T.radius.full,
    backgroundColor: T.colors.surfaceSecondary,
  },
  dateText: { fontSize: 13, fontWeight: '800', color: T.colors.text },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: T.radius.full,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '800' },
  dayMetrics: { flexDirection: 'row', gap: 12 },
  dayMetric: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dayMetricText: { fontSize: 13, fontWeight: '700', color: T.colors.textSecondary, fontVariant: ['tabular-nums'] },
  lateLine: { fontSize: 12, fontWeight: '700', color: T.colors.warning },
  sessionLine: { fontSize: 11, fontWeight: '600', color: T.colors.textMuted },
  emptyText: {
    textAlign: 'center',
    color: T.colors.textMuted,
    fontSize: 14,
    padding: 24,
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
});
