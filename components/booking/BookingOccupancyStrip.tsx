import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

export type StayOccupancy = {
  total_rooms: number;
  reserved_rooms: number;
  available_rooms: number;
  is_full: boolean;
  fill_ratio: number;
};

type Props = {
  occupancy: StayOccupancy | null;
  loading?: boolean;
  checkIn?: string;
  checkOut?: string;
};

/** Seçilen tarihte otel doluluk özeti — anlık */
export function BookingOccupancyStrip({ occupancy, loading, checkIn, checkOut }: Props) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <View style={styles.shell}>
        <Text style={styles.loading}>{t('bookingOccupancyLoading')}</Text>
      </View>
    );
  }
  if (!occupancy || occupancy.total_rooms < 1) return null;

  const pct = Math.round(Math.min(1, Math.max(0, occupancy.fill_ratio)) * 100);

  return (
    <View style={[styles.shell, occupancy.is_full && styles.shellFull]}>
      <View style={styles.row}>
        <Ionicons
          name={occupancy.is_full ? 'alert-circle' : 'home-outline'}
          size={18}
          color={occupancy.is_full ? '#b45309' : '#0f766e'}
        />
        <View style={styles.textCol}>
          <Text style={styles.title}>
            {occupancy.is_full
              ? t('bookingOccupancyFull')
              : t('bookingOccupancySummary', {
                  total: occupancy.total_rooms,
                  reserved: occupancy.reserved_rooms,
                  available: occupancy.available_rooms,
                })}
          </Text>
          <Text style={styles.hint}>
            {checkIn && checkOut ? `${checkIn} → ${checkOut} · ` : ''}
            {occupancy.is_full
              ? t('bookingOccupancyFullHint')
              : t('bookingOccupancyHint', { pct })}
          </Text>
        </View>
      </View>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { width: `${Math.min(100, Math.max(4, pct))}%` },
            occupancy.is_full && styles.barFull,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.12)',
    marginBottom: 14,
    gap: 10,
  },
  shellFull: {
    backgroundColor: '#fffbeb',
    borderColor: 'rgba(180,83,9,0.2)',
  },
  loading: { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  textCol: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  hint: { fontSize: 12, fontWeight: '500', color: '#64748b', lineHeight: 17 },
  barTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.08)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#14b8a6',
  },
  barFull: { backgroundColor: '#f59e0b' },
});
