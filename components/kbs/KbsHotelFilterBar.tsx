import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '@/constants/theme';
import type { KbsOpsHotel } from '@/lib/kbsMultiHotelCaptures';

type Props = {
  hotels: KbsOpsHotel[];
  canViewAll: boolean;
  value: string;
  onChange: (hotelId: string) => void;
  label?: string;
};

export function KbsHotelFilterBar({ hotels, canViewAll, value, onChange, label = 'İşletme' }: Props) {
  if (!canViewAll && hotels.length <= 1) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {canViewAll ? (
          <TouchableOpacity
            style={[styles.chip, value === 'all' && styles.chipOn]}
            onPress={() => onChange('all')}
          >
            <Text style={[styles.chipText, value === 'all' && styles.chipTextOn]}>Tümü</Text>
          </TouchableOpacity>
        ) : null}
        {hotels.map((h) => (
          <TouchableOpacity
            key={h.id}
            style={[styles.chip, value === h.id && styles.chipOn]}
            onPress={() => onChange(h.id)}
          >
            <Text style={[styles.chipText, value === h.id && styles.chipTextOn]}>{h.short_label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: theme.colors.textMuted,
    marginBottom: 6,
  },
  row: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  chipOn: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipText: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  chipTextOn: { color: '#fff' },
});
