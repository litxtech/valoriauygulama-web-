import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import {
  fetchAdminPaymentRequests,
  formatPaymentAmount,
  isPaymentHistoryForList,
  subscribeAdminPaymentRequests,
  type AdminPaymentRequestRow,
} from '@/lib/payments';
import { paymentText } from '@/lib/paymentsI18n';
import {
  ADMIN_PAYMENT_LANES,
  ADMIN_PAYMENT_LANE_META,
  adminPaymentLaneForRow,
  type AdminPaymentLane,
} from '@/lib/adminPaymentLanes';
import { AdminPaymentCard } from '@/components/admin/AdminPaymentCard';
import { guestSearchHaystack } from '@/lib/adminGuestAccountSummary';

function metaStaffName(row: AdminPaymentRequestRow): string {
  const meta = row.metadata;
  if (meta && typeof meta.staff_name === 'string') return meta.staff_name.trim();
  return row.tip_detail?.staff?.full_name?.trim() ?? '';
}

function metaGuestName(row: AdminPaymentRequestRow): string {
  return row.guest_detail?.full_name?.trim() || (typeof row.metadata?.guest_name === 'string' ? row.metadata.guest_name : '') || '';
}

export default function AdminPaymentsHistoryScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<AdminPaymentRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [laneFilter, setLaneFilter] = useState<AdminPaymentLane | 'all'>('all');

  const load = useCallback(async () => {
    try {
      const payments = await fetchAdminPaymentRequests(500);
      setRows(payments.filter(isPaymentHistoryForList));
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

  useEffect(() => subscribeAdminPaymentRequests(() => void load()), [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const lane = adminPaymentLaneForRow(row);
      if (laneFilter !== 'all' && lane !== laneFilter) return false;
      if (!q) return true;
      const haystack = [
        guestSearchHaystack(row.guest_detail, [
          metaStaffName(row),
          metaGuestName(row),
          row.title,
          row.description ?? '',
          row.creator_staff?.full_name ?? '',
        ]),
        row.service_kind,
        row.status,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search, laneFilter]);

  const sections = useMemo(() => {
    const lanesToShow = laneFilter === 'all' ? ADMIN_PAYMENT_LANES : [laneFilter];
    return lanesToShow
      .map((lane) => {
        const data = filtered.filter((r) => adminPaymentLaneForRow(r) === lane);
        if (data.length === 0) return null;
        const meta = ADMIN_PAYMENT_LANE_META[lane];
        return { key: lane, title: meta.title, subtitle: meta.subtitle, data };
      })
      .filter(Boolean) as {
      key: AdminPaymentLane;
      title: string;
      subtitle: string;
      data: AdminPaymentRequestRow[];
    }[];
  }, [filtered, laneFilter]);

  const openItem = (item: AdminPaymentRequestRow) => {
    if (item.reference_type === 'qr_stand' && item.reference_id) {
      router.push(`/admin/payments/stand/${item.reference_id}` as never);
      return;
    }
    router.push(`/admin/payments/${item.id}` as never);
  };

  if (loading && rows.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#635bff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor="#635bff"
          />
        }
        ListHeaderComponent={
          <View>
            <TouchableOpacity style={styles.backLink} onPress={() => router.back()} activeOpacity={0.8}>
              <Ionicons name="arrow-back" size={20} color="#635bff" />
              <Text style={styles.backLinkText}>Güncel ödemeler</Text>
            </TouchableOpacity>
            <Text style={styles.heroTitle}>{paymentText('paymentsHistoryTitle')}</Text>
            <Text style={styles.heroSub}>{paymentText('paymentsHistorySub')}</Text>
            <Text style={styles.countLine}>{filtered.length} kayıt</Text>

            <View style={styles.laneRow}>
              {ADMIN_PAYMENT_LANES.map((lane) => {
                const m = ADMIN_PAYMENT_LANE_META[lane];
                const active = laneFilter === lane;
                return (
                  <TouchableOpacity
                    key={lane}
                    style={[styles.laneChip, active && { borderColor: m.accent, backgroundColor: m.bg }]}
                    onPress={() => setLaneFilter(active ? 'all' : lane)}
                  >
                    <Text style={[styles.laneChipText, active && { color: m.accent }]}>{m.title}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Misafir, personel, tutar…"
                placeholderTextColor={theme.colors.textMuted}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {search || laneFilter !== 'all' ? 'Sonuç bulunamadı' : 'Geçmiş kayıt yok'}
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionSub}>{section.subtitle}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <AdminPaymentCard
            item={item}
            lane={adminPaymentLaneForRow(item)}
            onPress={() => openItem(item)}
            onOpenGuest={(gid) => router.push(`/admin/guests/${gid}` as never)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 12, paddingBottom: 32 },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 12 },
  backLinkText: { fontSize: 14, fontWeight: '700', color: '#635bff' },
  heroTitle: { fontSize: 20, fontWeight: '900', color: theme.colors.text },
  heroSub: { fontSize: 13, color: theme.colors.textMuted, marginTop: 6, lineHeight: 18 },
  countLine: { fontSize: 12, fontWeight: '700', color: '#635bff', marginTop: 10 },
  laneRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  laneChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  laneChipText: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text, padding: 0 },
  sectionHead: { paddingTop: 14, paddingBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
  sectionSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  empty: { textAlign: 'center', color: theme.colors.textMuted, paddingVertical: 40 },
});
