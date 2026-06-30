import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  fmtPartnerMoney,
  formatPartnerDateTurkish,
  partnerEntryIsPayable,
  partnerEntryPayLabel,
  partnerRelativeDayLabel,
  resolvePartnerTodayEntryStatus,
  type PartnerDailyEntryLedgerRow,
} from '@/lib/breakfastPartner';
import { partnerRadii, partnerTheme } from '@/lib/breakfastPartnerTheme';

type Props = {
  entry: PartnerDailyEntryLedgerRow;
  paying?: boolean;
  onPay?: (entry: PartnerDailyEntryLedgerRow) => void;
  onEdit?: (entry: PartnerDailyEntryLedgerRow) => void;
  showEdit?: boolean;
};

function EntryBadge({ entry }: { entry: PartnerDailyEntryLedgerRow }) {
  const status = resolvePartnerTodayEntryStatus(entry);
  const label = status === 'zero' ? 'Yok' : `${entry.guest_count} kişi`;
  const style =
    status === 'zero' ? styles.badgeZero : status === 'entered' ? styles.badgeEntered : styles.badgeMissing;
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

export function PartnerEntryLedgerRow({ entry, paying = false, onPay, onEdit, showEdit = false }: Props) {
  const payable = partnerEntryIsPayable(entry);
  const payStatus = partnerEntryPayLabel(entry);

  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <View style={styles.rowLeft}>
          <Text style={styles.rowDate}>{formatPartnerDateTurkish(entry.record_date, { weekday: true })}</Text>
          {partnerRelativeDayLabel(entry.record_date) ? (
            <Text style={styles.todayBadge}>{partnerRelativeDayLabel(entry.record_date)}</Text>
          ) : null}
        </View>
        <EntryBadge entry={entry} />
      </View>

      <View style={styles.rowBottom}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowAmount}>{fmtPartnerMoney(entry.line_total)}</Text>
          <Text style={[styles.payStatus, payable ? styles.payStatusDue : styles.payStatusDone]}>{payStatus}</Text>
        </View>

        <View style={styles.actions}>
          {showEdit && onEdit ? (
            <TouchableOpacity onPress={() => onEdit(entry)} style={styles.editBtn} activeOpacity={0.85}>
              <Text style={styles.editText}>Düzenle</Text>
            </TouchableOpacity>
          ) : null}
          {payable && onPay ? (
            <TouchableOpacity
              onPress={() => onPay(entry)}
              disabled={paying}
              style={[styles.payBtn, paying && { opacity: 0.6 }]}
              activeOpacity={0.88}
            >
              {paying ? (
                <ActivityIndicator color="#0f172a" size="small" />
              ) : (
                <>
                  <Ionicons name="card-outline" size={15} color="#0f172a" />
                  <Text style={styles.payBtnText}>Öde</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {entry.note?.trim() ? <Text style={styles.rowNote}>{entry.note.trim()}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: partnerTheme.card,
    borderRadius: partnerRadii.lg,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  rowMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  rowDate: { color: partnerTheme.text, fontWeight: '800', fontSize: 16, flexShrink: 1 },
  todayBadge: {
    color: partnerTheme.accent,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: partnerTheme.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: partnerRadii.pill,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: partnerRadii.pill },
  badgeEntered: { backgroundColor: partnerTheme.successSoft },
  badgeZero: { backgroundColor: partnerTheme.infoSoft },
  badgeMissing: { backgroundColor: partnerTheme.dangerSoft },
  badgeText: { color: partnerTheme.text, fontWeight: '700', fontSize: 12 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 12 },
  rowAmount: { color: partnerTheme.accent, fontWeight: '800', fontSize: 18 },
  payStatus: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  payStatusDue: { color: partnerTheme.danger },
  payStatusDone: { color: partnerTheme.success },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  editText: { color: partnerTheme.accent, fontWeight: '700', fontSize: 14 },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: partnerTheme.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: partnerRadii.pill,
    minWidth: 84,
    justifyContent: 'center',
  },
  payBtnText: { color: '#0f172a', fontWeight: '800', fontSize: 14 },
  rowNote: { color: partnerTheme.muted, fontSize: 13, marginTop: 10 },
});
