import { memo, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useStaffAttendanceQuickAction } from '@/hooks/useStaffAttendanceQuickAction';
import { hapticImpactLight } from '@/lib/hapticsSafe';

const IS_ANDROID = Platform.OS === 'android';

type Props = {
  menuOpen?: boolean;
};

function formatElapsedSeconds(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function useShiftElapsedSeconds(checkInAt: string | null, isOnShift: boolean): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isOnShift || !checkInAt) {
      setElapsed(0);
      return;
    }

    const startedAt = new Date(checkInAt).getTime();
    if (!Number.isFinite(startedAt)) {
      setElapsed(0);
      return;
    }

    const tick = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [checkInAt, isOnShift]);

  return elapsed;
}

function ShortcutButton({
  label,
  icon,
  colors,
  active,
  busy,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  colors: readonly [string, string];
  active: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const onButtonPress = () => {
    if (busy) return;
    if (!active) return;
    hapticImpactLight();
    onPress();
  };

  const body = (
    <>
      {busy ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Ionicons name={icon} size={20} color="#fff" />
      )}
      <Text style={[styles.btnLabel, active && styles.btnLabelActive]} numberOfLines={2}>
        {label}
      </Text>
    </>
  );

  const wrapStyle = [styles.btnWrap, active ? styles.btnWrapActive : styles.btnWrapDimmed];

  if (IS_ANDROID) {
    return (
      <Pressable
        onPress={onButtonPress}
        android_ripple={active && !busy ? { color: 'rgba(255,255,255,0.25)' } : undefined}
        style={wrapStyle}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !active || busy }}
      >
        <View style={[styles.btn, { backgroundColor: colors[0] }]} pointerEvents="none">
          {body}
        </View>
      </Pressable>
    );
  }

  return (
    <TouchableOpacity
      onPress={onButtonPress}
      activeOpacity={active ? 0.88 : 1}
      style={wrapStyle}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !active || busy }}
    >
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btn}>
        {body}
      </LinearGradient>
    </TouchableOpacity>
  );
}

export const StaffAttendanceHamburgerShortcuts = memo(function StaffAttendanceHamburgerShortcuts({
  menuOpen = false,
}: Props) {
  const { t } = useTranslation();
  const { busy, checkInAt, isOnShift, canStart, canEnd, onCheckIn, onCheckOut } =
    useStaffAttendanceQuickAction({
      queryEnabled: true,
      refreshOnMount: menuOpen,
    });
  const elapsedSeconds = useShiftElapsedSeconds(checkInAt, isOnShift);

  return (
    <View style={styles.block} collapsable={false}>
      <View style={styles.row}>
        <ShortcutButton
          label={t('staffAttStartWork')}
          icon="play-circle"
          colors={['#2563eb', '#6366f1']}
          active={canStart}
          busy={busy && !canEnd}
          onPress={onCheckIn}
        />
        <ShortcutButton
          label={t('staffAttEndWork')}
          icon="stop-circle"
          colors={['#0f766e', '#14b8a6']}
          active={canEnd}
          busy={busy && canEnd}
          onPress={onCheckOut}
        />
      </View>
      {isOnShift ? (
        <View style={styles.timerRow}>
          <Ionicons name="time-outline" size={12} color="#0369a1" />
          <Text style={styles.timerText}>{formatElapsedSeconds(elapsedSeconds)}</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  block: {
    marginBottom: 8,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  btnWrap: {
    flex: 1,
    minHeight: 56,
    borderRadius: 16,
    overflow: 'hidden',
  },
  btnWrapActive: {
    opacity: 1,
    borderWidth: 2,
    borderColor: 'rgba(99,102,241,0.35)',
    elevation: 4,
  },
  btnWrapDimmed: {
    opacity: 0.45,
  },
  btn: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnLabel: {
    flexShrink: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  btnLabelActive: {
    fontWeight: '900',
  },
  timerRow: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(3,105,161,0.1)',
  },
  timerText: {
    color: '#0369a1',
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
