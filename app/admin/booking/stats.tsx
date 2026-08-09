import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import { getBookingMonthlyPriceStats, type BookingMonthlyStat } from '@/lib/onlineBooking';

function money(n: number): string {
  return `${Math.round(n).toLocaleString('tr-TR')} ₺`;
}

export default function AdminBookingStats() {
  const router = useRouter();
  const [rows, setRows] = useState<BookingMonthlyStat[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setRows(await getBookingMonthlyPriceStats(18));
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'İstatistik yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const totals = rows.reduce(
    (acc, r) => ({
      list: acc.list + r.list_total_sum,
      disc: acc.disc + r.discount_given_sum,
      paid: acc.paid + r.paid_sum,
      bookings: acc.bookings + r.bookings_count,
    }),
    { list: 0, disc: 0, paid: 0, bookings: 0 }
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={adminTheme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Aylık fiyat & indirim</Text>
        <Text style={styles.sub}>
          Liste tutarı, verilen indirim ve tahsil edilen ödeme. Kampanya / öğrenci etkisi burada görülür.
        </Text>
      </View>

      <View style={styles.summaryRow}>
        <Summary label="Liste" value={money(totals.list)} />
        <Summary label="İndirim" value={money(totals.disc)} tone="warn" />
        <Summary label="Ödenen" value={money(totals.paid)} tone="ok" />
      </View>

      {loading ? (
        <ActivityIndicator color="#0f766e" style={{ marginTop: 28 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.year_month}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => {
                setLoading(true);
                void load();
              }}
            />
          }
          ListEmptyComponent={<Text style={styles.empty}>Henüz aylık veri yok.</Text>}
          renderItem={({ item }) => (
            <AdminCard style={styles.card}>
              <Text style={styles.month}>{item.year_month}</Text>
              <Text style={styles.meta}>
                {item.bookings_count} rezervasyon · {item.confirmed_count} onay · {item.nights_sum} gece
              </Text>
              <Text style={styles.meta}>
                Grup: {item.group_bookings} · Öğrenci: {item.student_bookings}
              </Text>
              <View style={styles.moneyGrid}>
                <MoneyCell label="Liste (verilecek)" value={money(item.list_total_sum)} />
                <MoneyCell label="Verilen indirim" value={money(item.discount_given_sum)} warn />
                <MoneyCell label="Ödenen" value={money(item.paid_sum)} ok />
                <MoneyCell label="Teklif toplam" value={money(item.quoted_sum)} />
              </View>
            </AdminCard>
          )}
        />
      )}
    </View>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn';
}) {
  return (
    <View style={styles.summary}>
      <Text style={styles.summaryLbl}>{label}</Text>
      <Text
        style={[
          styles.summaryVal,
          tone === 'ok' && { color: '#0f766e' },
          tone === 'warn' && { color: '#b45309' },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function MoneyCell({
  label,
  value,
  warn,
  ok,
}: {
  label: string;
  value: string;
  warn?: boolean;
  ok?: boolean;
}) {
  return (
    <View style={styles.moneyCell}>
      <Text style={styles.moneyLbl}>{label}</Text>
      <Text style={[styles.moneyVal, warn && { color: '#b45309' }, ok && { color: '#0f766e' }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.background },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 6 },
  back: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', marginBottom: 4,
  },
  title: { fontSize: 22, fontWeight: '800', color: adminTheme.colors.text },
  sub: { fontSize: 13, fontWeight: '500', color: adminTheme.colors.textMuted, lineHeight: 19 },
  summaryRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  summary: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)',
  },
  summaryLbl: { fontSize: 11, fontWeight: '700', color: '#94a3b8' },
  summaryVal: { marginTop: 4, fontSize: 14, fontWeight: '900', color: '#0f172a' },
  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  empty: { textAlign: 'center', color: '#94a3b8', fontWeight: '600', marginTop: 40 },
  card: { padding: 14, gap: 6 },
  month: { fontSize: 17, fontWeight: '900', color: '#0f172a' },
  meta: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  moneyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  moneyCell: {
    width: '48%', backgroundColor: '#f8fafc', borderRadius: 12, padding: 10,
  },
  moneyLbl: { fontSize: 11, fontWeight: '700', color: '#94a3b8' },
  moneyVal: { marginTop: 2, fontSize: 14, fontWeight: '800', color: '#0f172a' },
});
