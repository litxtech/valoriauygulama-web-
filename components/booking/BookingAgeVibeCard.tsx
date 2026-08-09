import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type StayAgeVibe = {
  sample_count: number;
  avg_age: number | null;
  vibe_key: string;
  vibe_label: string;
  vibe_hint: string;
};

type Props = {
  vibe: StayAgeVibe | null;
  loading?: boolean;
};

/** Sade doluluk + yaş grubu satırı (abartısız) */
export function BookingAgeVibeCard({ vibe, loading }: Props) {
  if (loading) {
    return (
      <View style={styles.shell}>
        <Text style={styles.loading}>Konaklama bilgisi…</Text>
      </View>
    );
  }
  if (!vibe) return null;

  return (
    <View style={styles.shell}>
      <View style={styles.row}>
        <Ionicons name="people-outline" size={18} color="#64748b" />
        <View style={styles.textCol}>
          <Text style={styles.title}>{vibe.vibe_label}</Text>
          <Text style={styles.hint}>{vibe.vibe_hint}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    marginBottom: 14,
  },
  loading: { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  textCol: { flex: 1, gap: 2 },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  hint: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
    lineHeight: 18,
  },
});
