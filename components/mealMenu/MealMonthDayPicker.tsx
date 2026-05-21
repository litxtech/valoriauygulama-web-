import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { parseYmd } from '@/lib/mealMenuUi';
import { formatTrShortDayLabelFromYmd } from '@/lib/mealMenuDate';

type DayChip = {
  ymd: string;
  hasContent: boolean;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  kitchenConfirmed?: boolean;
};

type Props = {
  days: DayChip[];
  selectedYmd: string;
  onSelect: (ymd: string) => void;
  primaryColor: string;
  mutedColor: string;
  borderColor: string;
  /** Personel görünümü: daha küçük gün çipleri */
  compact?: boolean;
};

export function MealMonthDayPicker({
  days,
  selectedYmd,
  onSelect,
  primaryColor,
  mutedColor,
  borderColor,
  compact = false,
}: Props) {
  const chipStyle = compact ? styles.chipCompact : styles.chip;
  const rowStyle = compact ? styles.rowCompact : styles.row;

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={rowStyle}>
        {days.map((d) => {
          const selected = d.ymd === selectedYmd;
          const { day, weekdayShort } = parseYmd(d.ymd);
          return (
            <TouchableOpacity
              key={d.ymd}
              onPress={() => onSelect(d.ymd)}
              activeOpacity={0.85}
              style={[
                chipStyle,
                { borderColor: selected ? primaryColor : borderColor },
                selected && { backgroundColor: primaryColor },
                d.isToday && !selected && styles.chipToday,
              ]}
            >
              <Text style={[compact ? styles.dowCompact : styles.dow, { color: selected ? '#fff' : mutedColor }]}>
                {weekdayShort}
              </Text>
              <Text style={[compact ? styles.numCompact : styles.num, { color: selected ? '#fff' : '#0f172a' }]}>
                {day}
              </Text>
              <View style={compact ? styles.dotsCompact : styles.dots}>
                {d.hasContent ? (
                  <View style={[styles.dot, { backgroundColor: selected ? '#fff' : '#ea580c' }]} />
                ) : null}
                {d.kitchenConfirmed ? (
                  <View style={[styles.dot, { backgroundColor: selected ? '#bbf7d0' : '#16a34a' }]} />
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <Text
        style={[compact ? styles.hintCompact : styles.hint, { color: mutedColor }]}
        numberOfLines={1}
      >
        {formatTrShortDayLabelFromYmd(selectedYmd)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 2 },
  row: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  rowCompact: { gap: 5, paddingVertical: 0, paddingRight: 6 },
  chip: {
    width: 52,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: '#fff',
  },
  chipCompact: {
    width: 40,
    alignItems: 'center',
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: '#fff',
  },
  chipToday: { borderColor: '#b8860b' },
  dow: { fontSize: 10, fontWeight: '600' },
  dowCompact: { fontSize: 9, fontWeight: '600' },
  num: { fontSize: 17, fontWeight: '800', marginTop: 2 },
  numCompact: { fontSize: 14, fontWeight: '800', marginTop: 1 },
  dots: { flexDirection: 'row', gap: 3, marginTop: 6, minHeight: 6 },
  dotsCompact: { flexDirection: 'row', gap: 2, marginTop: 3, minHeight: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  hint: { fontSize: 12, marginTop: 8, fontWeight: '500' },
  hintCompact: { fontSize: 11, marginTop: 4, fontWeight: '600' },
});
