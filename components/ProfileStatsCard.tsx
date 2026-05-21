import { View, Text, StyleSheet } from 'react-native';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';

export type ProfileStatItem = { value: string | number; label: string };

type Props = { items: ProfileStatItem[] };

export function ProfileStatsCard({ items }: Props) {
  return (
    <View style={[styles.card, P.cardShell, P.statShadow]}>
      {items.map((it, i) => (
        <View key={`${it.label}-${i}`} style={styles.cellWrap}>
          {i > 0 ? <View style={styles.divider} /> : null}
          <View style={styles.cell}>
            <Text style={styles.value} numberOfLines={1}>
              {it.value}
            </Text>
            <Text style={styles.label} numberOfLines={1}>
              {it.label}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  cellWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  divider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: 4,
    backgroundColor: P.border,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
    paddingHorizontal: 4,
  },
  value: {
    fontSize: 17,
    fontWeight: '700',
    color: P.text,
    letterSpacing: -0.2,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    color: P.subtext,
    marginTop: 5,
    textAlign: 'center',
  },
});
