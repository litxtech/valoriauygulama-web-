import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { pds } from '@/constants/personelDesignSystem';

type Props = {
  percent: number;
  accentColor?: string;
  assigneeLabel?: string | null;
};

export function PremiumTaskProgress({ percent, accentColor = '#3b82f6', assigneeLabel }: Props) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <LinearGradient
          colors={[accentColor, accentColor + '99']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { width: `${clamped}%` }]}
        />
      </View>
      <View style={styles.meta}>
        <Text style={styles.pct}>%{clamped} tamamlandı</Text>
        {assigneeLabel ? <Text style={styles.who} numberOfLines={1}>{assigneeLabel}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10 },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: pds.borderLight,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 3 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  pct: { fontSize: 11, fontWeight: '700', color: pds.indigo },
  who: { fontSize: 11, color: pds.subtext, flex: 1, textAlign: 'right', marginLeft: 8 },
});
