import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  formatLaundryQty,
  fmtPartnerMoney,
  partnerLaundryIsPayable,
  partnerLaundryPayLabel,
  type PartnerLaundryLedgerRow,
} from '@/lib/breakfastPartnerLaundry';
import { formatPartnerDateTurkish } from '@/lib/breakfastPartner';
import { partnerRadii, partnerTheme } from '@/lib/breakfastPartnerTheme';

type Props = {
  entry: PartnerLaundryLedgerRow;
  paying?: boolean;
  showHotel?: boolean;
  onPay?: (entry: PartnerLaundryLedgerRow) => void;
};

export function PartnerLaundryLedgerRow({ entry, paying = false, showHotel = false, onPay }: Props) {
  const payable = partnerLaundryIsPayable(entry);
  const payStatus = partnerLaundryPayLabel(entry);
  const guestLine = [entry.room_number ? `Oda ${entry.room_number}` : null, entry.guest_name || null]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <View style={styles.rowLeft}>
          <Text style={styles.rowDate}>{formatPartnerDateTurkish(entry.wash_date, { weekday: true })}</Text>
          {showHotel && entry.hotel_name ? <Text style={styles.hotel}>{entry.hotel_name}</Text> : null}
          {guestLine ? <Text style={styles.guest}>{guestLine}</Text> : null}
          {entry.note ? (
            <Text style={styles.note} numberOfLines={1}>
              {entry.note}
            </Text>
          ) : null}
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{formatLaundryQty(entry.quantity, entry.unit_label)}</Text>
        </View>
      </View>

      {entry.photo_urls.length > 0 ? (
        <View style={styles.photos}>
          {entry.photo_urls.slice(0, 4).map((url, idx) => (
            <Image key={`${entry.id}-${idx}`} source={{ uri: url }} style={styles.thumb} />
          ))}
        </View>
      ) : null}

      <View style={styles.rowBottom}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowAmount}>{fmtPartnerMoney(entry.line_total)}</Text>
          <Text style={[styles.payStatus, payable ? styles.payStatusDue : styles.payStatusDone]}>{payStatus}</Text>
        </View>

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
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: partnerTheme.card,
    borderRadius: partnerRadii.md,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
    padding: 14,
    marginBottom: 10,
  },
  rowMain: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  rowLeft: { flex: 1 },
  rowDate: { color: partnerTheme.text, fontWeight: '700', fontSize: 15 },
  hotel: { color: partnerTheme.muted, fontSize: 12, marginTop: 2 },
  guest: { color: partnerTheme.text, fontSize: 13, marginTop: 4, fontWeight: '600' },
  note: { color: partnerTheme.muted, fontSize: 12, marginTop: 4 },
  badge: {
    backgroundColor: '#dbeafe',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { color: '#1d4ed8', fontWeight: '700', fontSize: 12 },
  photos: { flexDirection: 'row', gap: 6, marginTop: 10 },
  thumb: { width: 52, height: 52, borderRadius: 8, backgroundColor: '#e2e8f0' },
  rowBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 },
  rowAmount: { color: partnerTheme.text, fontWeight: '800', fontSize: 16 },
  payStatus: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  payStatusDue: { color: partnerTheme.danger },
  payStatusDone: { color: partnerTheme.success },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: partnerTheme.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: partnerRadii.sm,
  },
  payBtnText: { color: '#0f172a', fontWeight: '800', fontSize: 13 },
});
