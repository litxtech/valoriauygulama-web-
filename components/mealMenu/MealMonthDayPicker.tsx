import { useCallback, useEffect, useRef } from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet, View, Dimensions, Animated } from 'react-native';
import { parseYmd } from '@/lib/mealMenuUi';
import { formatTrShortDayLabelFromYmd } from '@/lib/mealMenuDate';

type DayChip = {
  ymd: string;
  hasContent: boolean;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
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

function AnimatedDayChip({
  d,
  selected,
  compact,
  primaryColor,
  mutedColor,
  borderColor,
  onPress,
}: {
  d: DayChip;
  selected: boolean;
  compact: boolean;
  primaryColor: string;
  mutedColor: string;
  borderColor: string;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(selected ? 1.06 : 1)).current;
  const { day, weekdayShort } = parseYmd(d.ymd);
  const chipStyle = compact ? styles.chipCompact : styles.chip;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: selected ? 1.06 : 1,
      useNativeDriver: true,
      speed: 24,
      bounciness: selected ? 7 : 4,
    }).start();
  }, [selected, scale]);

  const chipBg = selected
    ? primaryColor
    : d.hasContent
      ? '#fff7ed'
      : d.isToday
        ? '#fffbeb'
        : '#fff';
  const chipBorder = selected
    ? primaryColor
    : d.hasContent
      ? '#fdba74'
      : d.isToday
        ? '#b8860b'
        : borderColor;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <Animated.View
        style={[
          chipStyle,
          { borderColor: chipBorder, backgroundColor: chipBg },
          d.isToday && !selected && styles.chipToday,
          { transform: [{ scale }] },
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
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

export function MealMonthDayPicker({
  days,
  selectedYmd,
  onSelect,
  primaryColor,
  mutedColor,
  borderColor,
  compact = false,
}: Props) {
  const rowStyle = compact ? styles.rowCompact : styles.row;
  const scrollRef = useRef<ScrollView>(null);
  const chipStride = (compact ? 40 : 52) + (compact ? 5 : 8);

  const scrollToSelected = useCallback(
    (animated: boolean) => {
      const idx = days.findIndex((d) => d.ymd === selectedYmd);
      if (idx < 0) return;
      const chipW = compact ? 40 : 52;
      const viewport = Dimensions.get('window').width - 32;
      const centerX = idx * chipStride + chipW / 2 - viewport / 2;
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x: Math.max(0, centerX), animated });
      });
    },
    [days, selectedYmd, compact, chipStride]
  );

  useEffect(() => {
    if (!days.length) return;
    scrollToSelected(false);
  }, [days, selectedYmd, scrollToSelected]);

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={rowStyle}
      >
        {days.map((d) => (
          <AnimatedDayChip
            key={d.ymd}
            d={d}
            selected={d.ymd === selectedYmd}
            compact={compact}
            primaryColor={primaryColor}
            mutedColor={mutedColor}
            borderColor={borderColor}
            onPress={() => {
              onSelect(d.ymd);
              scrollToSelected(true);
            }}
          />
        ))}
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
