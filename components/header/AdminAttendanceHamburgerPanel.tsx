import { memo, useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LiveShiftDuration } from '@/components/attendance/LiveShiftDuration';
import { useAdminAttendanceToday } from '@/hooks/useAdminAttendanceToday';
import {
  attendanceTrackingColor,
  attendanceTrackingLabel,
  attendanceTrackingPhase,
  formatAttendanceTime,
  formatDurationFromHours,
} from '@/lib/attendancePresentation';
import { hapticImpactLight } from '@/lib/hapticsSafe';

type Props = {
  menuOpen?: boolean;
  onNavigate?: () => void;
};

function StatChip({
  label,
  value,
  color,
  active,
  onPress,
}: {
  label: string;
  value: number;
  color: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.statChip, active && { borderColor: color, backgroundColor: `${color}14` }]}
    >
      <Text style={[styles.statValue, active && { color }]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export const AdminAttendanceHamburgerPanel = memo(function AdminAttendanceHamburgerPanel({
  menuOpen = false,
  onNavigate,
}: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    localeCode,
    isTr,
    dailyQuery,
    trackingStats,
    previewRows,
    noCheckInRows,
    sendingNoCheckIn,
    refresh,
    sendNoCheckInNotification,
  } = useAdminAttendanceToday({
    enabled: menuOpen,
    previewLimit: 5,
  });

  const openFull = useCallback(() => {
    hapticImpactLight();
    onNavigate?.();
    router.push('/admin/attendance');
  }, [onNavigate, router]);

  const openStaff = useCallback(
    (staffId: string) => {
      hapticImpactLight();
      onNavigate?.();
      router.push({ pathname: '/admin/attendance/[staffId]', params: { staffId } });
    },
    [onNavigate, router]
  );

  const handleRefresh = useCallback(() => {
    hapticImpactLight();
    void refresh();
  }, [refresh]);

  const handleNotify = useCallback(() => {
    hapticImpactLight();
    void sendNoCheckInNotification();
  }, [sendNoCheckInNotification]);

  return (
    <View style={styles.block} collapsable={false}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleCol}>
          <View style={styles.titleRow}>
            <Ionicons name="time-outline" size={16} color="#1d4ed8" />
            <Text style={styles.title}>{t('adminAttHamburgerTitle')}</Text>
          </View>
          <Text style={styles.subtitle}>{t('adminAttHamburgerSubtitle')}</Text>
        </View>
        <TouchableOpacity style={styles.viewAllBtn} onPress={openFull} activeOpacity={0.85}>
          <Text style={styles.viewAllText}>{t('adminAttViewAll')}</Text>
          <Ionicons name="chevron-forward" size={14} color="#1d4ed8" />
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <StatChip label={t('adminAttOnShift')} value={trackingStats.onShift} color="#047857" />
        <StatChip label={t('adminAttNotStarted')} value={trackingStats.notStarted} color="#dc2626" />
        <StatChip label={t('adminAttFinished')} value={trackingStats.finished} color="#1d4ed8" />
      </View>

      <View style={styles.listCard}>
        {dailyQuery.isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color="#6366f1" />
          </View>
        ) : previewRows.length === 0 ? (
          <Text style={styles.emptyText}>{t('adminAttNoRecordsToday')}</Text>
        ) : (
          previewRows.map((row, idx) => {
            const phase = attendanceTrackingPhase(row);
            const phaseStyle = attendanceTrackingColor(phase);
            const isOnShift = phase === 'on_shift';
            const startedAt = row.last_check_in_at ?? row.check_in_at;

            return (
              <TouchableOpacity
                key={`${row.staff_id}-${row.work_date}`}
                style={[styles.listRow, idx === previewRows.length - 1 && styles.listRowLast]}
                onPress={() => openStaff(row.staff_id)}
                activeOpacity={0.88}
              >
                <View style={styles.nameCol}>
                  <Text style={styles.nameText} numberOfLines={1}>
                    {row.full_name ?? '—'}
                  </Text>
                  <View style={[styles.phasePill, { backgroundColor: phaseStyle.bg }]}>
                    <Text style={[styles.phaseText, { color: phaseStyle.color }]}>
                      {attendanceTrackingLabel(phase, isTr)}
                    </Text>
                  </View>
                </View>
                <View style={styles.timesCol}>
                  <Text style={styles.timeText}>{formatAttendanceTime(row.check_in_at, localeCode)}</Text>
                  <Text style={styles.timeMuted}>{formatAttendanceTime(row.check_out_at, localeCode)}</Text>
                </View>
                <View style={styles.durationCol}>
                  {isOnShift && startedAt ? (
                    <View style={styles.liveWrap}>
                      <View style={styles.liveDot} />
                      <LiveShiftDuration startedAt={startedAt} textStyle={styles.liveText} />
                    </View>
                  ) : (
                    <Text style={styles.durationText}>{formatDurationFromHours(row.total_hours, isTr)}</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnSecondary]}
          onPress={handleRefresh}
          disabled={dailyQuery.isFetching}
          activeOpacity={0.85}
        >
          {dailyQuery.isFetching ? (
            <ActivityIndicator size="small" color="#475569" />
          ) : (
            <Ionicons name="refresh" size={16} color="#475569" />
          )}
          <Text style={styles.actionBtnSecondaryText}>{t('staffAttRefresh')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.actionBtn,
            styles.actionBtnPrimary,
            (sendingNoCheckIn || noCheckInRows.length === 0) && styles.actionBtnDisabled,
          ]}
          onPress={handleNotify}
          disabled={sendingNoCheckIn || noCheckInRows.length === 0}
          activeOpacity={0.85}
        >
          {sendingNoCheckIn ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="notifications-outline" size={16} color="#fff" />
          )}
          <Text style={styles.actionBtnPrimaryText} numberOfLines={1}>
            {t('adminAttNotifyMissing', { count: noCheckInRows.length })}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  block: {
    gap: 8,
    zIndex: 20,
    elevation: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  headerTitleCol: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '900',
  },
  subtitle: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(37,99,235,0.08)',
  },
  viewAllText: {
    color: '#1d4ed8',
    fontSize: 11,
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statChip: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    backgroundColor: 'rgba(248,250,252,0.95)',
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  statValue: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
  },
  listCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.3)',
    backgroundColor: 'rgba(255,255,255,0.96)',
    overflow: 'hidden',
  },
  loadingWrap: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.25)',
  },
  listRowLast: {
    borderBottomWidth: 0,
  },
  nameCol: {
    flex: 1.2,
    minWidth: 0,
    gap: 3,
  },
  nameText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
  },
  phasePill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  phaseText: {
    fontSize: 9,
    fontWeight: '800',
  },
  timesCol: {
    width: 52,
    alignItems: 'flex-end',
    gap: 2,
  },
  timeText: {
    color: '#0f172a',
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  timeMuted: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  durationCol: {
    width: 54,
    alignItems: 'flex-end',
  },
  durationText: {
    color: '#334155',
    fontSize: 10,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  liveWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#047857',
  },
  liveText: {
    color: '#047857',
    fontSize: 10,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionBtnSecondary: {
    backgroundColor: 'rgba(241,245,249,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
  },
  actionBtnSecondaryText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '800',
  },
  actionBtnPrimary: {
    backgroundColor: '#2563eb',
  },
  actionBtnPrimaryText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    flexShrink: 1,
  },
  actionBtnDisabled: {
    opacity: 0.45,
  },
});
