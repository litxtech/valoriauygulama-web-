import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BreakfastBriefingNotifSnapshot } from '@/lib/breakfastMorningBriefing';

type Props = {
  snapshot: BreakfastBriefingNotifSnapshot;
  compact?: boolean;
};

/** Personel bildirimlerinde kahvaltı sayılarını karıştırmayacak şekilde gösterir. */
export function BreakfastBriefingNotifCard({ snapshot, compact }: Props) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={[styles.mainCard, compact && styles.mainCardCompact]}>
        <View style={styles.mainIcon}>
          <Ionicons name="restaurant" size={compact ? 20 : 24} color="#b45309" />
        </View>
        <View style={styles.mainBody}>
          <Text style={styles.mainLbl}>MUTFAK — kahvaltı servisi</Text>
          <Text style={[styles.mainVal, compact && styles.mainValCompact]}>{snapshot.breakfastGuestCount}</Text>
          <Text style={styles.mainUnit}>kişi hazırlanacak</Text>
        </View>
      </View>

      <View style={[styles.refCard, compact && styles.refCardCompact]}>
        <Ionicons name="bed-outline" size={16} color="#2563eb" />
        <View style={styles.refBody}>
          <Text style={styles.refLbl}>Konaklayan toplam (referans)</Text>
          <Text style={styles.refVal}>{snapshot.hotelGuestCount} kişi</Text>
        </View>
      </View>

      {snapshot.note ? (
        <View style={styles.noteBox}>
          <Ionicons name="document-text-outline" size={14} color="#64748b" />
          <Text style={styles.noteText}>{snapshot.note}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 8 },
  wrapCompact: { marginTop: 6 },
  mainCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fffbeb',
    borderWidth: 2,
    borderColor: '#fbbf24',
    borderRadius: 14,
    padding: 14,
  },
  mainCardCompact: { padding: 10, borderRadius: 12 },
  mainIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainBody: { flex: 1 },
  mainLbl: {
    fontSize: 11,
    fontWeight: '800',
    color: '#b45309',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  mainVal: { fontSize: 44, fontWeight: '900', color: '#92400e', lineHeight: 48 },
  mainValCompact: { fontSize: 36, lineHeight: 40 },
  mainUnit: { fontSize: 13, fontWeight: '700', color: '#b45309', marginTop: -2 },
  refCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 12,
    padding: 10,
  },
  refCardCompact: { padding: 8 },
  refBody: { flex: 1 },
  refLbl: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  refVal: { fontSize: 16, fontWeight: '800', color: '#1d4ed8', marginTop: 2 },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  noteText: { flex: 1, fontSize: 12, color: '#475569', lineHeight: 17 },
});
