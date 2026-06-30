import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BreakfastPartnerAdminGate } from '@/components/breakfastPartner/BreakfastPartnerAdminGate';
import { useBreakfastPartnerProviderOrgId } from '@/hooks/useBreakfastPartnerProviderOrgId';
import { listPartnerHotels, fmtPartnerMoney, fetchPartnerOpenBalance, PARTNER_STATUS_LABELS, fetchPartnerBreakfastBoard, formatPartnerDateTurkish, resolvePartnerKitchenBoardDate, fetchPartnerSettings, resolvePartnerEffectiveUnitPriceSync } from '@/lib/breakfastPartner';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';

type Row = Awaited<ReturnType<typeof listPartnerHotels>>[number] & { openBalance?: number };

export default function AdminBreakfastPartnersIndex() {
  return (
    <BreakfastPartnerAdminGate>
      <AdminBreakfastPartnersList />
    </BreakfastPartnerAdminGate>
  );
}

function AdminBreakfastPartnersList() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orgId, loading: orgLoading } = useBreakfastPartnerProviderOrgId();
  const [rows, setRows] = useState<Row[]>([]);
  const [boardSummary, setBoardSummary] = useState<import('@/lib/breakfastPartner').PartnerBreakfastBoard['summary'] | null>(null);
  const [boardDate, setBoardDate] = useState<string | null>(null);
  const [defaultUnitPrice, setDefaultUnitPrice] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) {
      setRows([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const hotels = await listPartnerHotels(orgId);
    const activeBoardDate = resolvePartnerKitchenBoardDate();
    const [withBalance, board, settings] = await Promise.all([
      Promise.all(
        hotels.map(async (h) => ({
          ...h,
          openBalance: h.status === 'active' ? await fetchPartnerOpenBalance(h.counterparty_id).catch(() => 0) : 0,
        }))
      ),
      fetchPartnerBreakfastBoard(activeBoardDate).catch(() => null),
      fetchPartnerSettings(orgId).catch(() => null),
    ]);
    setDefaultUnitPrice(settings?.default_unit_price ?? 0);
    withBalance.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      return a.name.localeCompare(b.name, 'tr');
    });
    setRows(withBalance);
    setBoardSummary(board?.summary ?? null);
    setBoardDate(board?.recordDate ?? activeBoardDate);
    setLoading(false);
    setRefreshing(false);
  }, [orgId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={partnerTheme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Kahvaltı partner otelleri</Text>
          <Text style={styles.subtitle}>Ayrı B2B modül · cari entegrasyonlu</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/admin/breakfast-partners/prices')}>
          <Ionicons name="pricetag-outline" size={22} color={partnerTheme.accent} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/admin/breakfast-partners/settings')}>
          <Ionicons name="settings-outline" size={22} color={partnerTheme.accent} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/admin/breakfast-partners/new')}>
          <Ionicons name="add" size={22} color="#0f172a" />
        </TouchableOpacity>
      </View>

      {loading || orgLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={partnerTheme.accent} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={partnerTheme.accent} />
          }
          ListHeaderComponent={
            boardSummary ? (
              <TouchableOpacity
                style={styles.todayCard}
                onPress={() => router.push('/staff/breakfast-partners')}
                activeOpacity={0.88}
              >
                <Text style={styles.todayTitle}>
                  Pano · {boardDate ? formatPartnerDateTurkish(boardDate, { weekday: true }) : '—'}
                </Text>
                <View style={styles.todayRow}>
                  <Text style={styles.todayStat}>{boardSummary.totalGuests} kişi</Text>
                  <Text style={styles.todayStat}>{fmtPartnerMoney(boardSummary.totalAmount)}</Text>
                  {boardSummary.missingCount > 0 ? (
                    <Text style={styles.todayMissing}>{boardSummary.missingCount} eksik</Text>
                  ) : (
                    <Text style={styles.todayOk}>Tamam</Text>
                  )}
                </View>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={<Text style={styles.empty}>Henüz partner otel yok. Sağ üstten ekleyin.</Text>}
          renderItem={({ item }) => {
            const effective = resolvePartnerEffectiveUnitPriceSync(item, defaultUnitPrice);
            const isCustom = item.unit_price != null && item.unit_price > 0;
            return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/admin/breakfast-partners/${item.id}`)}
              activeOpacity={0.88}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardName}>{item.name}</Text>
                <View
                  style={[
                    styles.badge,
                    item.status === 'active'
                      ? styles.badgeActive
                      : item.status === 'pending'
                        ? styles.badgePending
                        : styles.badgeSuspended,
                  ]}
                >
                  <Text style={styles.badgeText}>{PARTNER_STATUS_LABELS[item.status]}</Text>
                </View>
              </View>
              <Text style={styles.cardMeta}>
                {item.email ?? '—'}
                {item.self_registered ? ' · Kendi kaydı' : ''}
              </Text>
              <View style={styles.cardBottom}>
                <Text style={styles.cardBalance}>Açık cari: {fmtPartnerMoney(item.openBalance ?? 0)}</Text>
                <View style={styles.priceCol}>
                  <Text style={styles.cardPrice}>{fmtPartnerMoney(effective)}/kişi</Text>
                  <Text style={styles.priceTag}>{isCustom ? 'Özel fiyat' : 'Varsayılan'}</Text>
                </View>
              </View>
            </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, marginBottom: 4 },
  back: { padding: 8 },
  title: { color: partnerTheme.text, fontSize: 20, fontWeight: '800' },
  subtitle: { color: partnerTheme.muted, fontSize: 12 },
  iconBtn: { padding: 8 },
  addBtn: { backgroundColor: partnerTheme.accent, borderRadius: 12, padding: 8 },
  todayCard: {
    backgroundColor: partnerTheme.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  todayTitle: { color: partnerTheme.muted, fontSize: 12, marginBottom: 8 },
  todayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  todayStat: { color: partnerTheme.text, fontWeight: '700', fontSize: 15 },
  todayMissing: { color: partnerTheme.danger, fontWeight: '700' },
  todayOk: { color: partnerTheme.success, fontWeight: '700' },
  empty: { color: partnerTheme.muted, textAlign: 'center', marginTop: 48 },
  card: {
    backgroundColor: partnerTheme.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { color: partnerTheme.text, fontSize: 17, fontWeight: '800', flex: 1 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeActive: { backgroundColor: 'rgba(34,197,94,0.15)' },
  badgePending: { backgroundColor: 'rgba(245,158,11,0.18)' },
  badgeSuspended: { backgroundColor: 'rgba(239,68,68,0.15)' },
  badgeText: { color: partnerTheme.text, fontSize: 11, fontWeight: '700' },
  cardMeta: { color: partnerTheme.muted, marginTop: 6, fontSize: 13 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, alignItems: 'flex-end' },
  cardBalance: { color: partnerTheme.accent, fontWeight: '700' },
  priceCol: { alignItems: 'flex-end' },
  cardPrice: { color: partnerTheme.text, fontSize: 13, fontWeight: '700' },
  priceTag: { color: partnerTheme.muted, fontSize: 11, marginTop: 2 },
});
