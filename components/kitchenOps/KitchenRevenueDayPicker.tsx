import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { addDaysToDate, formatDate } from '@/lib/date';
import { todayKitchenDateIso } from '@/lib/kitchenOps/revenueTables';
import { theme } from '@/constants/theme';

type Props = {
  date: string;
  onChange: (date: string) => void;
};

export function KitchenRevenueDayPicker({ date, onChange }: Props) {
  const isToday = date === todayKitchenDateIso();

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.navBtn}
        onPress={() => onChange(addDaysToDate(date, -1))}
        accessibilityLabel="Önceki gün"
      >
        <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
      </TouchableOpacity>

      <View style={styles.center}>
        <Text style={styles.dateLabel}>{formatDate(date)}</Text>
        <Text style={styles.dateHint}>{isToday ? 'Bugün' : 'Geçmiş gün'}</Text>
      </View>

      <TouchableOpacity
        style={[styles.navBtn, isToday && styles.navBtnDisabled]}
        onPress={() => !isToday && onChange(addDaysToDate(date, 1))}
        disabled={isToday}
        accessibilityLabel="Sonraki gün"
      >
        <Ionicons name="chevron-forward" size={22} color={isToday ? theme.colors.textMuted : theme.colors.text} />
      </TouchableOpacity>

      {!isToday ? (
        <TouchableOpacity style={styles.todayBtn} onPress={() => onChange(todayKitchenDateIso())}>
          <Text style={styles.todayBtnText}>Bugün</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnDisabled: { opacity: 0.45 },
  center: { flex: 1, alignItems: 'center' },
  dateLabel: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  dateHint: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  todayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  todayBtnText: { fontSize: 12, fontWeight: '700', color: '#047857' },
});
