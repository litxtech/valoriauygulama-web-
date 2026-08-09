import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { listMyOnlineBookings, bookingStatusLabel, formatBookingDateRange, type OnlineBookingRow } from '@/lib/onlineBooking';

export default function CustomerBookingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();
  const [rows, setRows] = useState<OnlineBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await listMyOnlineBookings());
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={22} color="#0b1220" />
        </TouchableOpacity>
        <Text style={styles.title}>{t('bookingMyBookings')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#0f766e" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
          ListEmptyComponent={<Text style={styles.empty}>{t('bookingMyBookingsEmpty')}</Text>}
          renderItem={({ item }) => {
            const active = highlight && item.id === highlight;
            return (
              <View style={[styles.card, active && styles.cardActive]}>
                <Text style={styles.cap}>{item.capacity_label || item.room_label || 'Standart'}</Text>
                <Text style={styles.meta}>
                  {formatBookingDateRange(item.check_in_date, item.check_out_date)} · {item.nights_count}{' '}
                  {t('bookingNights', { count: item.nights_count }).replace(/^\d+\s*/, '')}
                </Text>
                <Text style={[styles.meta, !item.paid_at && styles.metaWarn]}>{bookingStatusLabel(item)}</Text>
                {item.pdf_url ? (
                  <TouchableOpacity style={styles.pdfBtn} onPress={() => void Linking.openURL(item.pdf_url!)} activeOpacity={0.85}>
                    <Ionicons name="document-text-outline" size={16} color="#fff" />
                    <Text style={styles.pdfBtnText}>{t('bookingOpenPdf')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f2ee' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '900', color: '#0b1220' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: '#667085', marginTop: 40, fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(11,18,32,0.08)',
  },
  cardActive: { borderColor: '#0f766e', borderWidth: 2 },
  cap: { fontSize: 17, fontWeight: '900', color: '#0b1220', marginBottom: 6 },
  meta: { fontSize: 13, fontWeight: '600', color: '#667085', marginTop: 2 },
  metaWarn: { color: '#c2410c', fontWeight: '800' },
  pdfBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pdfBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
