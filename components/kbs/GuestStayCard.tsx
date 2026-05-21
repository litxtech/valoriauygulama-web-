import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import type { GuestStayRow } from '@/lib/kbsStays/types';
import { formatIsoDateTr } from '@/lib/scanner/mrzDates';

function statusColor(stay: GuestStayRow): string {
  if (stay.stay_status === 'checked_out') return '#9ca3af';
  if (stay.kbs_checkin_status === 'failed' || stay.stay_status === 'checkout_failed') return '#ef4444';
  if (stay.stay_status === 'correction_required' || stay.kbs_checkin_status === 'pending') return '#f59e0b';
  if (stay.stay_status === 're_submitted') return '#3b82f6';
  return '#22c55e';
}

export function GuestStayCard(props: {
  stay: GuestStayRow;
  selected?: boolean;
  selectionMode?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { stay } = props;
  const name = [stay.first_name, stay.last_name].filter(Boolean).join(' ') || '—';
  const border = statusColor(stay);

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: border }, props.selected && styles.selected]}
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      activeOpacity={0.88}
    >
      {props.selectionMode ? (
        <Ionicons
          name={props.selected ? 'checkbox' : 'square-outline'}
          size={22}
          color={props.selected ? theme.colors.primary : theme.colors.textMuted}
          style={{ marginRight: 8 }}
        />
      ) : null}
      <View style={{ flex: 1 }}>
        <View style={styles.row}>
          <Text style={styles.room}>{stay.room_no}</Text>
          {stay.group_id || stay.scan_session_id ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Grup</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.meta}>
          {stay.nationality ?? '—'} · {formatIsoDateTr(stay.checkin_at.slice(0, 10))}
        </Text>
        <Text style={styles.kbs}>
          KBS giriş: {stay.kbs_checkin_status === 'sent' ? 'Gönderildi' : stay.kbs_checkin_status}
          {stay.kbs_checkout_status ? ` · çıkış: ${stay.kbs_checkout_status}` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    marginBottom: 8,
  },
  selected: { backgroundColor: '#eff6ff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  room: { fontSize: 13, fontWeight: '800', color: theme.colors.primary },
  badge: { backgroundColor: '#dbeafe', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#1d4ed8' },
  name: { fontSize: 16, fontWeight: '800', color: theme.colors.text, marginTop: 2 },
  meta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  kbs: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4 },
});
