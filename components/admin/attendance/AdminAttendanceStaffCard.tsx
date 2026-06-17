import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { LiveShiftDuration } from '@/components/attendance/LiveShiftDuration';
import { adminTheme as T } from '@/constants/adminTheme';
import {
  adminStatusLabel,
  attendanceStatusVisual,
  attendanceTrackingColor,
  attendanceTrackingLabel,
  attendanceTrackingPhase,
  formatAttendanceTime,
  formatDurationFromHours,
} from '@/lib/attendancePresentation';
import type { AdminAttendanceRow } from '@/hooks/useAdminAttendanceToday';

type Props = {
  row: AdminAttendanceRow;
  localeCode: string;
  isTr: boolean;
  onPress: () => void;
};

function staffInitials(name: string | null | undefined): string {
  const parts = (name ?? '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('tr-TR');
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toLocaleUpperCase('tr-TR');
}

export const AdminAttendanceStaffCard = memo(function AdminAttendanceStaffCard({
  row,
  localeCode,
  isTr,
  onPress,
}: Props) {
  const phase = attendanceTrackingPhase(row);
  const phaseStyle = attendanceTrackingColor(phase);
  const dayVisual = attendanceStatusVisual(row.day_status);
  const isOnShift = phase === 'on_shift';
  const startedAt = row.last_check_in_at ?? row.check_in_at;
  const sessionCount = Math.max(row.check_in_count ?? 0, row.check_out_count ?? 0);
  const showSessions = sessionCount > 1;

  const phaseAccent =
    phase === 'on_shift' ? '#10b981' : phase === 'not_started' ? '#ef4444' : '#3b82f6';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      <View style={[styles.accentBar, { backgroundColor: phaseAccent }]} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <LinearGradient
            colors={isOnShift ? ['#047857', '#10b981'] : ['#334155', '#64748b']}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{staffInitials(row.full_name)}</Text>
          </LinearGradient>
          <View style={styles.nameCol}>
            <Text style={styles.name} numberOfLines={1}>
              {row.full_name ?? '—'}
            </Text>
            <View style={styles.badgeRow}>
              <View style={[styles.phasePill, { backgroundColor: phaseStyle.bg }]}>
                {isOnShift ? <View style={styles.liveDot} /> : null}
                <Text style={[styles.phaseText, { color: phaseStyle.color }]}>
                  {attendanceTrackingLabel(phase, isTr)}
                </Text>
              </View>
              <View style={[styles.dayPill, { backgroundColor: dayVisual.bg }]}>
                <Ionicons name={dayVisual.icon} size={11} color={dayVisual.color} />
                <Text style={[styles.dayText, { color: dayVisual.color }]}>
                  {adminStatusLabel(row.day_status, isTr)}
                </Text>
              </View>
            </View>
            {showSessions ? (
              <Text style={styles.sessionMeta}>
                {isTr ? `${sessionCount} oturum bugün` : `${sessionCount} sessions today`}
              </Text>
            ) : null}
            {row.day_status === 'gec_geldi' ? (
              <Text style={styles.lateMeta}>
                {row.late_minutes ?? 0} {isTr ? 'dk geç kaldı' : 'min late'}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={20} color={T.colors.textMuted} />
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <View style={styles.metricLabelRow}>
              <Ionicons name="log-in-outline" size={13} color="#16a34a" />
              <Text style={styles.metricLabel}>{isTr ? 'Giriş' : 'In'}</Text>
            </View>
            <Text style={styles.metricValue}>{formatAttendanceTime(row.check_in_at, localeCode)}</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metric}>
            <View style={styles.metricLabelRow}>
              <Ionicons name="log-out-outline" size={13} color="#d97706" />
              <Text style={styles.metricLabel}>{isTr ? 'Çıkış' : 'Out'}</Text>
            </View>
            <Text style={styles.metricValue}>{formatAttendanceTime(row.check_out_at, localeCode)}</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={[styles.metric, styles.metricDuration]}>
            <View style={styles.metricLabelRow}>
              <Ionicons name="hourglass-outline" size={13} color="#6366f1" />
              <Text style={styles.metricLabel}>{isTr ? 'Süre' : 'Duration'}</Text>
            </View>
            {isOnShift && startedAt ? (
              <View style={styles.liveWrap}>
                <View style={styles.livePulse} />
                <LiveShiftDuration startedAt={startedAt} textStyle={styles.liveText} />
              </View>
            ) : (
              <Text style={styles.metricValue}>{formatDurationFromHours(row.total_hours, isTr)}</Text>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
    overflow: 'hidden',
    ...T.shadow.sm,
  },
  accentBar: {
    width: 4,
  },
  body: {
    flex: 1,
    padding: 14,
    gap: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  nameCol: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  name: {
    fontSize: 16,
    fontWeight: '900',
    color: T.colors.text,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  phasePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: T.radius.full,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  phaseText: {
    fontSize: 11,
    fontWeight: '800',
  },
  dayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: T.radius.full,
  },
  dayText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sessionMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: T.colors.textMuted,
  },
  lateMeta: {
    fontSize: 11,
    fontWeight: '700',
    color: T.colors.warning,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: T.colors.surfaceSecondary,
    borderRadius: T.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  metricDuration: {
    flex: 1.1,
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: T.colors.border,
    marginVertical: 2,
  },
  metricLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: T.colors.textMuted,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '900',
    color: T.colors.text,
    fontVariant: ['tabular-nums'],
  },
  liveWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  livePulse: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  liveText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#047857',
    fontVariant: ['tabular-nums'],
  },
});
