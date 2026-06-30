import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '@/stores/authStore';
import {
  canViewPartnerBreakfastBoard,
  fetchPartnerBreakfastBoard,
  fmtPartnerMoney,
  formatPartnerDateTurkish,
  resolvePartnerKitchenBoardDate,
  todayIstanbulDate,
  tomorrowIstanbulDate,
  type PartnerBreakfastBoardHotel,
} from '@/lib/breakfastPartner';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';
import { PartnerDateSelector } from '@/components/breakfastPartner/PartnerUi';

function statusMeta(row: PartnerBreakfastBoardHotel) {
  if (row.entryStatus === 'entered') {
    return { label: `${row.guestCount} kişi`, color: partnerTheme.success, icon: 'checkmark-circle' as const };
  }
  if (row.entryStatus === 'zero') {
    return { label: 'Kahvaltı yok (0)', color: partnerTheme.muted, icon: 'remove-circle-outline' as const };
  }
  return { label: 'Henüz girilmedi', color: partnerTheme.danger, icon: 'alert-circle' as const };
}

export function PartnerBreakfastBoardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const staff = useAuthStore((s) => s.staff);
  const canView = canViewPartnerBreakfastBoard(staff);

  const [boardDate, setBoardDate] = useState(() => resolvePartnerKitchenBoardDate());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [board, setBoard] = useState<Awaited<ReturnType<typeof fetchPartnerBreakfastBoard>>>(null);

  const todayIso = todayIstanbulDate();
  const tomorrowIso = tomorrowIstanbulDate();

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const data = await fetchPartnerBreakfastBoard(boardDate);
      setBoard(data);
    } catch {
      setBoard(null);
    }
    setLoading(false);
    setRefreshing(false);
  }, [canView, boardDate]);

  useFocusEffect(
    useCallback(() => {
      setBoardDate(resolvePartnerKitchenBoardDate());
      setLoading(true);
    }, [])
  );

  useEffect(() => {
    if (!canView) return;
    void load();
  }, [canView, load]);

  if (!canView) {
    return (
      <View style={[styles.boot, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.denied}>Bu ekranı görüntüleme yetkiniz yok.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Geri</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const recordDate = board?.recordDate ?? todayIstanbulDate();
  const summary = board?.summary;
  const hotels = board?.hotels ?? [];

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...partnerTheme.heroGradient]} style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={22} color={partnerTheme.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Partner kahvaltı panosu</Text>
            <Text style={styles.subtitle}>{formatPartnerDateTurkish(recordDate, { weekday: true })}</Text>
          </View>
          <TouchableOpacity onPress={() => { setRefreshing(true); void load(); }} style={styles.iconBtn}>
            <Ionicons name="refresh" size={20} color={partnerTheme.accent} />
          </TouchableOpacity>
        </View>

        <PartnerDateSelector
          value={boardDate}
          onChange={setBoardDate}
          showClock
          options={[
            { key: todayIso, tag: 'Bugün', iso: todayIso },
            { key: tomorrowIso, tag: 'Yarın', iso: tomorrowIso },
          ]}
        />

        {summary ? (
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{summary.totalGuests}</Text>
              <Text style={styles.summaryLabel}>Toplam kişi</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{fmtPartnerMoney(summary.totalAmount)}</Text>
              <Text style={styles.summaryLabel}>Toplam tutar</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={[styles.summaryValue, summary.missingCount > 0 && { color: partnerTheme.danger }]}>
                {summary.missingCount}
              </Text>
              <Text style={styles.summaryLabel}>Eksik giriş</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>
                {summary.enteredCount}/{summary.totalHotels}
              </Text>
              <Text style={styles.summaryLabel}>Girdi</Text>
            </View>
          </View>
        ) : null}
      </LinearGradient>

      {loading ? (
        <View style={styles.boot}>
          <ActivityIndicator color={partnerTheme.accent} />
        </View>
      ) : (
        <FlatList
          data={hotels}
          keyExtractor={(item) => item.hotelId}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={partnerTheme.accent} />
          }
          ListEmptyComponent={<Text style={styles.empty}>Aktif partner otel yok.</Text>}
          renderItem={({ item }) => {
            const meta = statusMeta(item);
            return (
              <View style={[styles.card, item.entryStatus === 'missing' && styles.cardMissing]}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.hotelName}>{item.hotelName}</Text>
                    {item.city ? <Text style={styles.city}>{item.city}</Text> : null}
                  </View>
                  <View style={styles.statusPill}>
                    <Ionicons name={meta.icon} size={16} color={meta.color} />
                    <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </View>
                {item.entryStatus === 'entered' ? (
                  <Text style={styles.amount}>{fmtPartnerMoney(item.lineTotal)}</Text>
                ) : null}
                {item.note?.trim() ? <Text style={styles.note}>{item.note.trim()}</Text> : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  header: { paddingHorizontal: 16, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  iconBtn: { padding: 6 },
  title: { fontSize: 20, fontWeight: '700', color: partnerTheme.text },
  subtitle: { fontSize: 13, color: partnerTheme.muted, marginTop: 2 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryCard: {
    width: '47%',
    backgroundColor: partnerTheme.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  summaryValue: { fontSize: 18, fontWeight: '700', color: partnerTheme.accent },
  summaryLabel: { fontSize: 12, color: partnerTheme.muted, marginTop: 4 },
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  denied: { color: partnerTheme.muted, textAlign: 'center', paddingHorizontal: 24 },
  backBtn: { marginTop: 16, padding: 12 },
  backBtnText: { color: partnerTheme.accent, fontWeight: '600' },
  empty: { color: partnerTheme.muted, textAlign: 'center', marginTop: 32 },
  card: {
    backgroundColor: partnerTheme.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  cardMissing: { borderColor: 'rgba(239, 68, 68, 0.35)' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  hotelName: { fontSize: 16, fontWeight: '600', color: partnerTheme.text },
  city: { fontSize: 12, color: partnerTheme.muted, marginTop: 2 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '46%' },
  statusText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  amount: { fontSize: 15, fontWeight: '600', color: partnerTheme.accent, marginTop: 8 },
  note: { fontSize: 12, color: partnerTheme.muted, marginTop: 6 },
});
