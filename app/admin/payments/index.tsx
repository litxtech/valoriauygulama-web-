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
  Alert,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/theme';
import {
  archivePaymentRequest,
  cancelPaymentRequest,
  fetchAdminPaymentRequests,
  formatPaymentAmount,
  isPaymentActiveForList,
  isPaymentHistoryForList,
  subscribeAdminPaymentRequests,
  type AdminPaymentRequestRow,
} from '@/lib/payments';
import { paymentText } from '@/lib/paymentsI18n';
import { acceptStaffTipPayment, refundStaffTip } from '@/lib/staffTips';
import { fetchPaymentQrStands, type PaymentQrStandRow } from '@/lib/paymentQrStands';
import {
  ADMIN_PAYMENT_LANES,
  ADMIN_PAYMENT_LANE_META,
  adminPaymentLaneForRow,
  summarizeAdminPaymentsByLane,
  type AdminPaymentLane,
} from '@/lib/adminPaymentLanes';
import { AdminPaymentCard } from '@/components/admin/AdminPaymentCard';
import { guestSearchHaystack } from '@/lib/adminGuestAccountSummary';
import { fetchLinkedPaymentRequestIds } from '@/lib/financeIncomeStripe';

type StatusFilter = 'all' | 'paid' | 'pending';

function metaStaffName(row: AdminPaymentRequestRow): string {
  const meta = row.metadata;
  if (meta && typeof meta.staff_name === 'string') return meta.staff_name.trim();
  return row.tip_detail?.staff?.full_name?.trim() ?? '';
}

function metaGuestName(row: AdminPaymentRequestRow): string {
  return row.guest_detail?.full_name?.trim() || (typeof row.metadata?.guest_name === 'string' ? row.metadata.guest_name : '') || '';
}

export default function AdminPaymentsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ lane?: string }>();
  const initialLane =
    params.lane === 'tips' || params.lane === 'kitchen' || params.lane === 'hotel' ? params.lane : 'all';

  const [rows, setRows] = useState<AdminPaymentRequestRow[]>([]);
  const [stands, setStands] = useState<PaymentQrStandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [laneFilter, setLaneFilter] = useState<AdminPaymentLane | 'all'>(initialLane);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [actingId, setActingId] = useState<string | null>(null);
  const [linkedPaymentIds, setLinkedPaymentIds] = useState<Set<string>>(() => new Set());
  const historyCount = useMemo(() => rows.filter(isPaymentHistoryForList).length, [rows]);

  const load = useCallback(async () => {
    try {
      const [payments, qrStands, linked] = await Promise.all([
        fetchAdminPaymentRequests(500),
        fetchPaymentQrStands(null, 30),
        fetchLinkedPaymentRequestIds(),
      ]);
      setRows(payments);
      setStands(qrStands);
      setLinkedPaymentIds(linked);
    } catch {
      setRows([]);
      setStands([]);
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

  useEffect(() => {
    if (params.lane === 'tips' || params.lane === 'kitchen' || params.lane === 'hotel') {
      setLaneFilter(params.lane);
    }
  }, [params.lane]);

  const visibleRows = useMemo(() => rows.filter(isPaymentActiveForList), [rows]);

  const laneSummaries = useMemo(() => summarizeAdminPaymentsByLane(visibleRows), [visibleRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleRows.filter((row) => {
      const lane = adminPaymentLaneForRow(row);
      if (laneFilter !== 'all' && lane !== laneFilter) return false;
      if (statusFilter === 'paid' && row.status !== 'paid') return false;
      if (statusFilter === 'pending' && row.status !== 'pending') return false;
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
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [visibleRows, search, laneFilter, statusFilter]);

  const handleCancel = useCallback(
    (item: AdminPaymentRequestRow) => {
      Alert.alert(paymentText('paymentsCancelLink'), paymentText('paymentsCancelLinkConfirm'), [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İptal et',
          style: 'destructive',
          onPress: () => {
            setActingId(item.id);
            void cancelPaymentRequest(item.id)
              .then(() => load())
              .catch((e) => Alert.alert('Hata', (e as Error).message))
              .finally(() => setActingId(null));
          },
        },
      ]);
    },
    [load]
  );

  const handleArchive = useCallback(
    (item: AdminPaymentRequestRow) => {
      Alert.alert(paymentText('paymentsClosePaidLink'), paymentText('paymentsClosePaidLinkConfirm'), [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Kapat',
          onPress: () => {
            setActingId(item.id);
            void archivePaymentRequest(item.id)
              .then(() => load())
              .catch((e) => Alert.alert('Hata', (e as Error).message))
              .finally(() => setActingId(null));
          },
        },
      ]);
    },
    [load]
  );

  const sections = useMemo(() => {
    const lanesToShow = laneFilter === 'all' ? ADMIN_PAYMENT_LANES : [laneFilter];
    return lanesToShow
      .map((lane) => {
        const data = filtered.filter((r) => adminPaymentLaneForRow(r) === lane);
        if (data.length === 0) return null;
        const meta = ADMIN_PAYMENT_LANE_META[lane];
        const sum = laneSummaries[lane];
        return {
          key: lane,
          title: meta.title,
          subtitle: meta.subtitle,
          data,
          paidTotal: sum.totalPaid,
          paidCount: sum.paidCount,
          pendingCount: sum.pendingCount,
          currency: sum.currency,
        };
      })
      .filter(Boolean) as {
      key: AdminPaymentLane;
      title: string;
      subtitle: string;
      data: AdminPaymentRequestRow[];
      paidTotal: number;
      paidCount: number;
      pendingCount: number;
      currency: string;
    }[];
  }, [filtered, laneFilter, laneSummaries]);

  const totalPaidToday = useMemo(() => {
    const today = new Date().toDateString();
    return visibleRows
      .filter((r) => r.status === 'paid' && r.paid_at && new Date(r.paid_at).toDateString() === today)
      .reduce((s, r) => s + Number(r.amount), 0);
  }, [visibleRows]);

  const handleAccept = (item: AdminPaymentRequestRow) => {
    Alert.alert('Ödeme kabul et', 'Stripe ödemesi doğrulanacak. Devam?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Kabul et',
        onPress: () => {
          setActingId(item.id);
          void acceptStaffTipPayment({ tipId: item.reference_id ?? undefined, paymentRequestId: item.id })
            .then(() => load())
            .catch((e) => Alert.alert('Hata', (e as Error).message))
            .finally(() => setActingId(null));
        },
      },
    ]);
  };

  const handleRefund = (item: AdminPaymentRequestRow) => {
    const tipId = item.reference_id;
    if (!tipId) return;
    Alert.alert('İade', `${formatPaymentAmount(Number(item.amount), item.currency)} iade edilecek.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'İade et',
        style: 'destructive',
        onPress: () => {
          setActingId(item.id);
          void refundStaffTip(tipId)
            .then(() => load())
            .catch((e) => Alert.alert('Hata', (e as Error).message))
            .finally(() => setActingId(null));
        },
      },
    ]);
  };

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
        stickySectionHeadersEnabled={false}
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
            <LinearGradient colors={['#1e1b4b', '#4338ca', '#635bff']} style={styles.hero}>
              <Text style={styles.heroKicker}>MUHASEBE & TAHSİLAT</Text>
              <Text style={styles.heroTitle}>Yapılan ödemeler</Text>
              <Text style={styles.heroSub}>{paymentText('paymentsActiveSub')}</Text>
              <View style={styles.heroStatRow}>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatVal}>{formatPaymentAmount(totalPaidToday, 'try')}</Text>
                  <Text style={styles.heroStatLbl}>Bugün tahsil</Text>
                </View>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatVal}>{visibleRows.filter((r) => r.status === 'paid').length}</Text>
                  <Text style={styles.heroStatLbl}>Toplam ödenen</Text>
                </View>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatVal}>{visibleRows.filter((r) => r.status === 'pending').length}</Text>
                  <Text style={styles.heroStatLbl}>Bekleyen</Text>
                </View>
              </View>
            </LinearGradient>

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.push('/admin/payments/new')}
              style={styles.newWrap}
            >
              <LinearGradient colors={['#635bff', '#4f46e5']} style={styles.newBtn}>
                <Ionicons name="qr-code-outline" size={22} color="#fff" />
                <Text style={styles.newBtnText}>{paymentText('paymentsNew')}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.historyLink}
              onPress={() => router.push('/admin/payments/history' as never)}
              activeOpacity={0.88}
            >
              <Ionicons name="time-outline" size={20} color="#475569" />
              <View style={{ flex: 1 }}>
                <Text style={styles.historyLinkTitle}>{paymentText('paymentsViewHistory')}</Text>
                <Text style={styles.historyLinkSub}>
                  Kapatılan, iptal ve süresi dolan kayıtlar
                  {historyCount > 0 ? ` · ${historyCount}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#475569" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.accountingLink}
              onPress={() => router.push('/admin/accounting/movements')}
            >
              <Ionicons name="calculator-outline" size={20} color="#0f766e" />
              <View style={{ flex: 1 }}>
                <Text style={styles.accountingLinkTitle}>Muhasebe defteri</Text>
                <Text style={styles.accountingLinkSub}>Stripe ödemeleri otomatik gelir satırı olarak işlenir</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#0f766e" />
            </TouchableOpacity>

            <View style={styles.laneSummaryRow}>
              {ADMIN_PAYMENT_LANES.map((lane) => {
                const m = ADMIN_PAYMENT_LANE_META[lane];
                const s = laneSummaries[lane];
                const active = laneFilter === lane;
                return (
                  <TouchableOpacity
                    key={lane}
                    style={[styles.laneCard, active && styles.laneCardActive, { borderColor: m.accent + '44' }]}
                    onPress={() => setLaneFilter(active ? 'all' : lane)}
                  >
                    <Ionicons name={m.icon} size={18} color={m.accent} />
                    <Text style={styles.laneCardTitle}>{m.title}</Text>
                    <Text style={styles.laneCardAmount}>{formatPaymentAmount(s.totalPaid, s.currency)}</Text>
                    <Text style={styles.laneCardMeta}>
                      {s.paidCount} ödendi{s.pendingCount > 0 ? ` · ${s.pendingCount} bekliyor` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {stands.length > 0 ? (
              <View style={styles.standsBlock}>
                <Text style={styles.standsTitle}>Sabit QR noktaları</Text>
                {stands.slice(0, 6).map((stand) => (
                  <TouchableOpacity
                    key={stand.id}
                    style={styles.standRow}
                    onPress={() => router.push(`/admin/payments/stand/${stand.id}` as never)}
                  >
                    <Ionicons
                      name="infinite-outline"
                      size={16}
                      color={stand.status === 'active' ? '#16a34a' : '#94a3b8'}
                    />
                    <Text style={styles.standTitle} numberOfLines={1}>
                      {stand.title}
                    </Text>
                    <Text style={styles.standAmount}>{formatPaymentAmount(Number(stand.amount), stand.currency)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Misafir, personel, tutar, başlık…"
                placeholderTextColor={theme.colors.textMuted}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.statusFilters}>
              {(['all', 'paid', 'pending'] as const).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, statusFilter === s && styles.chipActive]}
                  onPress={() => setStatusFilter(s)}
                >
                  <Text style={[styles.chipText, statusFilter === s && styles.chipTextActive]}>
                    {s === 'all' ? 'Tüm durumlar' : s === 'paid' ? 'Ödenen' : 'Bekleyen'}
                  </Text>
                </TouchableOpacity>
              ))}
              {laneFilter !== 'all' ? (
                <TouchableOpacity style={styles.chipClear} onPress={() => setLaneFilter('all')}>
                  <Text style={styles.chipClearText}>Filtreyi kaldır</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {search || laneFilter !== 'all' || statusFilter !== 'all'
              ? 'Sonuç bulunamadı'
              : 'Henüz ödeme kaydı yok'}
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionSub}>{section.subtitle}</Text>
            <Text style={styles.sectionMeta}>
              {formatPaymentAmount(section.paidTotal, section.currency)} · {section.paidCount} ödeme
              {section.pendingCount > 0 ? ` · ${section.pendingCount} bekliyor` : ''}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <AdminPaymentCard
            item={item}
            lane={adminPaymentLaneForRow(item)}
            onPress={() => openItem(item)}
            onOpenGuest={(gid) => router.push(`/admin/guests/${gid}` as never)}
            onAccept={() => handleAccept(item)}
            onRefund={() => handleRefund(item)}
            onCancel={() => handleCancel(item)}
            onArchive={() => handleArchive(item)}
            onRecordIncome={
              item.status === 'paid' && !linkedPaymentIds.has(item.id)
                ? () =>
                    router.push({
                      pathname: '/admin/accounting/movements/new',
                      params: { kind: 'income', paymentRequestId: item.id },
                    } as never)
                : undefined
            }
            acting={actingId === item.id}
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
  hero: { marginHorizontal: -12, paddingHorizontal: 16, paddingVertical: 18, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  heroKicker: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.7)', letterSpacing: 1 },
  heroTitle: { fontSize: 22, fontWeight: '900', color: '#fff', marginTop: 4 },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 8, lineHeight: 18 },
  heroStatRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  heroStat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  heroStatVal: { fontSize: 13, fontWeight: '900', color: '#fff' },
  heroStatLbl: { fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 4, textAlign: 'center' },
  newWrap: { marginTop: 14, borderRadius: 14, overflow: 'hidden' },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14 },
  newBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  accountingLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  accountingLinkTitle: { fontSize: 14, fontWeight: '800', color: '#0f766e' },
  accountingLinkSub: { fontSize: 11, color: '#047857', marginTop: 2 },
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  historyLinkTitle: { fontSize: 14, fontWeight: '800', color: '#334155' },
  historyLinkSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  laneSummaryRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  laneCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    gap: 4,
  },
  laneCardActive: { backgroundColor: '#f8fafc' },
  laneCardTitle: { fontSize: 11, fontWeight: '800', color: theme.colors.text },
  laneCardAmount: { fontSize: 12, fontWeight: '900', color: '#635bff' },
  laneCardMeta: { fontSize: 9, color: theme.colors.textMuted },
  standsBlock: { marginTop: 12, backgroundColor: theme.colors.surface, borderRadius: 12, padding: 12 },
  standsTitle: { fontSize: 12, fontWeight: '800', color: theme.colors.textSecondary, marginBottom: 8 },
  standRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  standTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: theme.colors.text },
  standAmount: { fontSize: 12, fontWeight: '800', color: '#635bff' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text, padding: 0 },
  statusFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  chipActive: { backgroundColor: '#635bff', borderColor: '#635bff' },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  chipTextActive: { color: '#fff' },
  chipClear: { paddingHorizontal: 10, paddingVertical: 7 },
  chipClearText: { fontSize: 12, fontWeight: '700', color: '#635bff' },
  sectionHead: { paddingTop: 14, paddingBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
  sectionSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  sectionMeta: { fontSize: 11, fontWeight: '700', color: '#635bff', marginTop: 6 },
  empty: { textAlign: 'center', color: theme.colors.textMuted, paddingVertical: 40 },
});
