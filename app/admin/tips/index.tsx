import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import {
  confirmStaffTip,
  fetchAdminStaffTips,
  refundStaffTip,
  type StaffTipRow,
} from '@/lib/staffTips';
import {
  formatTipAmount,
  tipPaymentMethodLabel,
  tipStatusLabel,
  type StaffTipStatus,
} from '@/lib/staffTipsI18n';
import { AdminGuestAccountSummary } from '@/components/admin/AdminGuestAccountSummary';
import { formatAdminDateTime, guestRoomNumber, guestSearchHaystack } from '@/lib/adminGuestAccountSummary';

const STATUS_COLOR = {
  pending: '#f59e0b',
  confirmed: '#22c55e',
  cancelled: '#94a3b8',
  refunded: '#6366f1',
} as const;

type FilterKey = StaffTipStatus | 'all';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'pending', label: 'Bekleyen' },
  { key: 'confirmed', label: 'Onaylı' },
  { key: 'refunded', label: 'İade' },
  { key: 'cancelled', label: 'İptal' },
];

function canManualConfirm(row: StaffTipRow): boolean {
  return row.status === 'pending' && row.payment_method !== 'stripe_card';
}

function canStripeRefund(row: StaffTipRow): boolean {
  return row.status === 'confirmed' && row.payment_method === 'stripe_card';
}

export default function AdminTipsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<StaffTipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchAdminStaffTips(filter);
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const handleConfirm = (row: StaffTipRow, status: 'confirmed' | 'cancelled') => {
    const title = status === 'confirmed' ? 'Bahşişi onayla' : 'Bahşişi iptal et';
    const message =
      status === 'confirmed'
        ? 'Ödemenin alındığını teyit ediyorsunuz. Personel bilgilendirilecek.'
        : 'Bu bahşiş kaydı iptal edilecek.';

    Alert.alert(title, message, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: status === 'confirmed' ? 'Onayla' : 'İptal et',
        style: status === 'confirmed' ? 'default' : 'destructive',
        onPress: () => {
          setActingId(row.id);
          void confirmStaffTip(row.id, status)
            .then(() => load())
            .catch((e) => Alert.alert('Hata', (e as Error).message ?? 'İşlem başarısız'))
            .finally(() => setActingId(null));
        },
      },
    ]);
  };

  const handleRefund = (row: StaffTipRow) => {
    const currency = (row.currency ?? 'TRY').toLowerCase();
    Alert.alert(
      'Bahşiş iadesi',
      `${formatTipAmount(Number(row.amount), currency)} tutarı misafirin kartına iade edilecek. Devam edilsin mi?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İade et',
          style: 'destructive',
          onPress: () => {
            setActingId(row.id);
            void refundStaffTip(row.id)
              .then(() => load())
              .catch((e) => Alert.alert('Hata', (e as Error).message ?? 'İade başarısız'))
              .finally(() => setActingId(null));
          },
        },
      ]
    );
  };

  const pendingCount = rows.filter((r) => r.status === 'pending' && r.payment_method !== 'stripe_card').length;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const staffName = row.staff?.full_name?.trim() ?? '';
      const haystack = guestSearchHaystack(row.guest, [
        staffName,
        row.room_number ?? '',
        row.amount?.toString() ?? '',
        row.note ?? '',
      ]);
      return haystack.includes(q);
    });
  }, [rows, search]);

  const openGuest = useCallback(
    (guestId: string) => {
      router.push(`/admin/guests/${guestId}`);
    },
    [router]
  );

  if (loading && rows.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={18} color="#b8860b" />
        <Text style={styles.infoText}>
          Kart ile (Stripe) bahşişler ödeme sonrası otomatik onaylanır. Onaylı Stripe bahşişlerini buradan iade
          edebilirsiniz — para misafirin kartına döner. Oda faturası, resepsiyon kartı veya nakit bahşişleri
          manuel onaylayın.
        </Text>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Misafir adı, telefon, oda, personel…"
          placeholderTextColor={theme.colors.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => {
              setFilter(f.key);
              setLoading(true);
            }}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {filter === 'pending' && pendingCount > 0 ? (
        <Text style={styles.pendingHint}>{pendingCount} kayıt manuel onay bekliyor</Text>
      ) : null}

      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={filteredRows}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        ListEmptyComponent={<Text style={styles.empty}>{search ? 'Sonuç bulunamadı' : 'Bahşiş kaydı yok'}</Text>}
        renderItem={({ item }) => {
          const staffName = item.staff?.full_name?.trim() || 'Personel';
          const guestName = item.guest?.full_name?.trim() || 'Misafir';
          const currency = (item.currency ?? 'TRY').toLowerCase();
          const manual = canManualConfirm(item);
          const stripeRefund = canStripeRefund(item);
          const stripePending = item.status === 'pending' && item.payment_method === 'stripe_card';
          const room = guestRoomNumber(item.guest) || item.room_number;

          return (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title} numberOfLines={2}>
                  {guestName} → {staffName}
                </Text>
                <View style={[styles.badge, { backgroundColor: STATUS_COLOR[item.status] + '18' }]}>
                  <Text style={[styles.badgeText, { color: STATUS_COLOR[item.status] }]}>
                    {tipStatusLabel(item.status)}
                  </Text>
                </View>
              </View>

              <Text style={styles.amount}>{formatTipAmount(Number(item.amount), currency)}</Text>
              <Text style={styles.meta}>{tipPaymentMethodLabel(item.payment_method)}</Text>
              {room ? <Text style={styles.meta}>Oda: {room}</Text> : null}
              {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
              {item.thank_you_message ? (
                <Text style={styles.thankYou}>Teşekkür: {item.thank_you_message}</Text>
              ) : null}
              {stripePending ? (
                <Text style={styles.stripeHint}>Stripe ödemesi tamamlanınca otomatik onaylanır</Text>
              ) : null}

              <Text style={styles.date}>Kayıt: {formatAdminDateTime(item.created_at)}</Text>
              {item.confirmed_at ? (
                <Text style={styles.date}>Onay: {formatAdminDateTime(item.confirmed_at)}</Text>
              ) : null}
              {item.refunded_at ? (
                <Text style={styles.refundedAt}>İade: {formatAdminDateTime(item.refunded_at)}</Text>
              ) : null}

              <AdminGuestAccountSummary guest={item.guest} onOpenProfile={openGuest} />

              {manual ? (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnConfirm]}
                    disabled={actingId === item.id}
                    onPress={() => handleConfirm(item, 'confirmed')}
                  >
                    {actingId === item.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                        <Text style={styles.btnText}>Onayla</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnCancel]}
                    disabled={actingId === item.id}
                    onPress={() => handleConfirm(item, 'cancelled')}
                  >
                    <Ionicons name="close-circle-outline" size={18} color="#64748b" />
                    <Text style={styles.btnCancelText}>İptal</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {stripeRefund ? (
                <TouchableOpacity
                  style={[styles.btn, styles.btnRefund, actingId === item.id && styles.btnDisabled]}
                  disabled={actingId === item.id}
                  onPress={() => handleRefund(item)}
                >
                  {actingId === item.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="return-down-back-outline" size={18} color="#fff" />
                      <Text style={styles.btnText}>Stripe iadesi</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    margin: 12,
    marginBottom: 0,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fef9e7',
    borderWidth: 1,
    borderColor: '#f0e6c8',
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18, color: '#6b5a2e' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text, padding: 0 },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterText: { fontSize: 13, color: theme.colors.textSecondary },
  filterTextActive: { color: '#fff', fontWeight: '600' },
  pendingHint: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    fontSize: 13,
    color: '#b45309',
    fontWeight: '500',
  },
  list: { flex: 1 },
  listContent: { padding: 12, paddingTop: 4, gap: 10 },
  empty: { textAlign: 'center', color: theme.colors.textSecondary, marginTop: 40 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: '600', color: theme.colors.text },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  amount: { fontSize: 22, fontWeight: '700', color: '#b8860b', marginTop: 8 },
  meta: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 },
  note: { fontSize: 13, color: theme.colors.text, marginTop: 6, fontStyle: 'italic' },
  thankYou: { fontSize: 13, color: '#16a34a', marginTop: 6 },
  stripeHint: { fontSize: 12, color: '#2563eb', marginTop: 6 },
  date: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 8 },
  refundedAt: { fontSize: 12, color: '#6366f1', marginTop: 6, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  btnConfirm: { backgroundColor: '#16a34a' },
  btnCancel: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: theme.colors.border },
  btnRefund: { backgroundColor: '#6366f1', marginTop: 12 },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  btnCancelText: { color: '#64748b', fontWeight: '600', fontSize: 14 },
});
