import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';

export type ProfileStatItem = { value: string | number; label: string };

type Props = { items: ProfileStatItem[] };

export function ProfileStatsCard({ items }: Props) {
  const wrap = items.length > 4;
  return (
    <View style={[styles.card, P.cardShell, P.statShadow, wrap && styles.cardWrap]}>
      <LinearGradient
        colors={[P.gradient.start, P.gradient.end]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topAccent}
      />
      {items.map((it, i) => (
        <View
          key={`${it.label}-${i}`}
          style={[styles.cellWrap, wrap && styles.cellWrapFlex]}
        >
          {!wrap && i > 0 ? <View style={styles.divider} /> : null}
          <View style={[styles.cell, styles.cellInner]}>
            <Text style={[styles.value, wrap && styles.valueCompact]} numberOfLines={1}>
              {it.value}
            </Text>
            <Text style={[styles.label, wrap && styles.labelCompact]} numberOfLines={1}>
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
    paddingVertical: 18,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  topAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    opacity: 0.85,
  },
  cardWrap: {
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  cellWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  cellWrapFlex: {
    flexBasis: '30%',
    flexGrow: 0,
    maxWidth: '33%',
  },
  valueCompact: { fontSize: 15 },
  labelCompact: { fontSize: 10 },
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
  cellInner: {
    backgroundColor: P.cardMuted,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    width: '100%',
  },
  value: {
    fontSize: 18,
    fontWeight: '800',
    color: P.text,
    letterSpacing: -0.4,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    color: P.subtext,
    marginTop: 5,
    textAlign: 'center',
  },
});
