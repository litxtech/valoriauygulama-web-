import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '@/components/premium/PressableScale';
import { adminTheme as T } from '@/constants/adminTheme';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  daysUntilDeparture,
  formatDepartureDate,
} from '@/lib/staffDeparture/labels';
import type { StaffDepartureListItem } from '@/lib/staffDeparture/types';

type Props = {
  item: StaffDepartureListItem;
  onPress?: () => void;
};

export function StaffDepartureCard({ item, onPress }: Props) {
  const statusStyle = STATUS_COLORS[item.status];
  const days = item.status === 'planned' ? daysUntilDeparture(item.departure_date) : null;

  let countdown: string | null = null;
  if (days != null) {
    if (days === 0) countdown = 'Bugün';
    else if (days === 1) countdown = 'Yarın';
    else if (days > 1) countdown = `${days} gün kaldı`;
    else countdown = `${Math.abs(days)} gün geçti`;
  }

  return (
    <PressableScale style={styles.card} onPress={onPress} disabled={!onPress}>
      <View style={styles.topRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(item.staff_name ?? '?').slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={styles.main}>
          <Text style={styles.name} numberOfLines={1}>
            {item.staff_name ?? 'Personel'}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {[item.staff_department, item.staff_role].filter(Boolean).join(' · ') || '—'}
          </Text>
        </View>
        <View style={[styles.statusChip, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.text }]}>
            {STATUS_LABELS[item.status]}
          </Text>
        </View>
      </View>

      <View style={styles.dateRow}>
        <Ionicons name="calendar-outline" size={16} color={T.colors.primary} />
        <Text style={styles.dateText}>{formatDepartureDate(item.departure_date)}</Text>
        {countdown ? (
          <View style={styles.countdownChip}>
            <Text style={styles.countdownText}>{countdown}</Text>
          </View>
        ) : null}
      </View>

      {item.note ? (
        <Text style={styles.note} numberOfLines={2}>
          {item.note}
        </Text>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4338ca',
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: T.colors.text,
  },
  meta: {
    fontSize: 12,
    color: T.colors.textMuted,
    marginTop: 2,
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  dateText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: T.colors.text,
  },
  countdownChip: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  countdownText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b45309',
  },
  note: {
    marginTop: 8,
    fontSize: 13,
    color: T.colors.textMuted,
    lineHeight: 18,
  },
});
