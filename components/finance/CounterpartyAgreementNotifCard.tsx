import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fmtMoneyTry } from '@/lib/financeLedger';
import { agreementKindLabels } from '@/lib/financeCounterpartyAgreements';
import type { CounterpartyAgreementNotifSnapshot } from '@/lib/financeCounterpartyAgreementNotify';
import { formatDateShort } from '@/lib/date';

type Props = {
  snapshot: CounterpartyAgreementNotifSnapshot;
  compact?: boolean;
};

export function CounterpartyAgreementNotifCard({ snapshot, compact }: Props) {
  const isReceivable = snapshot.movementKind === 'income';
  const kindLabels = agreementKindLabels(snapshot.movementKind);
  const tone = isReceivable
    ? { bg: '#ecfdf5', border: '#86efac', accent: '#15803d', icon: 'arrow-down-circle' as const }
    : { bg: '#fef2f2', border: '#fecaca', accent: '#dc2626', icon: 'arrow-up-circle' as const };

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={[styles.card, compact && styles.cardCompact, { backgroundColor: tone.bg, borderColor: tone.border }]}>
        <View style={styles.topRow}>
          <View style={[styles.iconWrap, { backgroundColor: isReceivable ? '#dcfce7' : '#fee2e2' }]}>
            <Ionicons name={tone.icon} size={compact ? 18 : 22} color={tone.accent} />
          </View>
          <View style={styles.topBody}>
            <Text style={[styles.kindLbl, { color: tone.accent }]}>
              {isReceivable ? 'ALACAK — size borçlu' : 'BORÇ — size borcumuz'}
            </Text>
            <Text style={[styles.amount, compact && styles.amountCompact, { color: tone.accent }]}>
              {fmtMoneyTry(snapshot.amount)}
            </Text>
          </View>
        </View>

        <View style={styles.detailBox}>
          <Text style={styles.detailLbl}>Ne için?</Text>
          <Text style={[styles.detailVal, compact && styles.detailValCompact]} numberOfLines={3}>
            {snapshot.title}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaChip}>
            <Ionicons name="pricetag-outline" size={12} color="#64748b" />
            <Text style={styles.metaChipText}>{kindLabels.debtNoun}</Text>
          </View>
          {snapshot.startedOn ? (
            <View style={styles.metaChip}>
              <Ionicons name="calendar-outline" size={12} color="#64748b" />
              <Text style={styles.metaChipText}>{formatDateShort(snapshot.startedOn)}</Text>
            </View>
          ) : null}
        </View>

        {snapshot.notes ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteLbl}>Detay</Text>
            <Text style={[styles.noteText, compact && styles.noteTextCompact]}>{snapshot.notes}</Text>
          </View>
        ) : null}

        {snapshot.recordedByName ? (
          <Text style={styles.footer}>Kaydeden: {snapshot.recordedByName}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  wrapCompact: { marginTop: 6 },
  card: {
    borderWidth: 2,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  cardCompact: { padding: 10, borderRadius: 12, gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBody: { flex: 1, minWidth: 0 },
  kindLbl: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  amount: { fontSize: 32, fontWeight: '900', marginTop: 2, lineHeight: 36 },
  amountCompact: { fontSize: 26, lineHeight: 30 },
  detailBox: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 10,
    padding: 10,
  },
  detailLbl: { fontSize: 10, fontWeight: '700', color: '#64748b', marginBottom: 4 },
  detailVal: { fontSize: 15, fontWeight: '800', color: '#0f172a', lineHeight: 20 },
  detailValCompact: { fontSize: 14 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  metaChipText: { fontSize: 11, fontWeight: '600', color: '#475569' },
  noteBox: {
    borderRadius: 10,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
  },
  noteLbl: { fontSize: 10, fontWeight: '700', color: '#64748b', marginBottom: 4 },
  noteText: { fontSize: 13, color: '#334155', lineHeight: 18 },
  noteTextCompact: { fontSize: 12 },
  footer: { fontSize: 11, color: '#64748b', fontWeight: '600' },
});
