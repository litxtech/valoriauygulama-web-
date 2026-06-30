import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TradePartnerAdminGate } from '@/components/tradePartner/TradePartnerAdminGate';
import {
  fetchTradeMovements,
  fetchTradePartnerBalance,
  fetchTradePartnerById,
  fetchTradeTransactions,
  formatTradeMoney,
  recordTradePayment,
  type TradeMovementRow,
  type TradePartnerRow,
  type TradeTransactionRow,
} from '@/lib/tradePartner';
import { tradePartnerTheme as theme, TRADE_MOVEMENT_LABELS, TRADE_TX_STATUS_LABELS } from '@/lib/tradePartnerTheme';

export default function AdminTradePartnerDetailScreen() {
  return (
    <TradePartnerAdminGate>
      <AdminTradePartnerDetail />
    </TradePartnerAdminGate>
  );
}

function AdminTradePartnerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [partner, setPartner] = useState<TradePartnerRow | null>(null);
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<TradeTransactionRow[]>([]);
  const [movements, setMovements] = useState<TradeMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const p = await fetchTradePartnerById(id);
      setPartner(p);
      if (p) {
        const [b, t, m] = await Promise.all([
          fetchTradePartnerBalance(p.id),
          fetchTradeTransactions(p.organization_id, p.id),
          fetchTradeMovements(p.id),
        ]);
        setBalance(b);
        setTransactions(t);
        setMovements(m);
      }
    } catch {
      setPartner(null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const recordPayment = async () => {
    if (!partner) return;
    const amt = parseFloat(paymentAmount.replace(',', '.'));
    if (!amt || amt <= 0) {
      Alert.alert('Hata', 'Geçerli bir tutar girin.');
      return;
    }
    setPaying(true);
    try {
      await recordTradePayment(partner.id, amt, paymentNote.trim() || undefined);
      setPaymentAmount('');
      setPaymentNote('');
      await load();
      Alert.alert('Kaydedildi', 'Ödeme cariye alacak olarak işlendi.');
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Kaydedilemedi');
    }
    setPaying(false);
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!partner) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <Text style={{ color: theme.muted, textAlign: 'center', paddingHorizontal: 24 }}>
          Partner bulunamadı. Kayıt oluşturulmuş olabilir; listeye dönüp yenileyin.
        </Text>
        <TouchableOpacity onPress={() => router.replace('/admin/trade-partners/partners')} style={{ marginTop: 16 }}>
          <Text style={{ color: theme.accent, fontWeight: '700' }}>Partner listesi</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{partner.company_name}</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }} tintColor={theme.accent} />}
      >
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Cari bakiye (borç)</Text>
          <Text style={styles.balanceValue}>{formatTradeMoney(balance)}</Text>
          <Text style={styles.balanceHint}>Onaylanan işlemler borç; ödemeler alacak olarak düşer.</Text>
        </View>

        <InfoRow label="Kategori" value={partner.partner_trade_categories?.name ?? '—'} />
        <InfoRow label="Yetkili" value={partner.contact_name ?? '—'} />
        <InfoRow label="Telefon" value={partner.phone ?? '—'} />
        <InfoRow label="E-posta" value={partner.email} />
        <InfoRow label="Adres" value={partner.address ?? '—'} />

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push({ pathname: '/admin/trade-partners/transactions/new', params: { partnerId: partner.id } })}
        >
          <Ionicons name="add-circle-outline" size={18} color="#0f172a" />
          <Text style={styles.primaryBtnText}>İşlem oluştur</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Ödeme kaydet (alacak)</Text>
        <TextInput
          value={paymentAmount}
          onChangeText={setPaymentAmount}
          placeholder="Tutar"
          placeholderTextColor={theme.mutedSoft}
          keyboardType="decimal-pad"
          style={styles.input}
        />
        <TextInput
          value={paymentNote}
          onChangeText={setPaymentNote}
          placeholder="Not (opsiyonel)"
          placeholderTextColor={theme.mutedSoft}
          style={[styles.input, { marginTop: 8 }]}
        />
        <TouchableOpacity style={[styles.payBtn, paying && { opacity: 0.6 }]} onPress={recordPayment} disabled={paying}>
          <Text style={styles.payBtnText}>{paying ? 'Kaydediliyor…' : 'Ödeme kaydet'}</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>İşlemler</Text>
        {transactions.map((tx) => (
          <TouchableOpacity
            key={tx.id}
            style={styles.rowCard}
            onPress={() => router.push(`/admin/trade-partners/transactions/${tx.id}`)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{TRADE_TX_STATUS_LABELS[tx.status] ?? tx.status}</Text>
              <Text style={styles.rowMeta}>{new Date(tx.created_at).toLocaleDateString('tr-TR')}</Text>
            </View>
            <Text style={styles.rowAmount}>{formatTradeMoney(Number(tx.total_amount))}</Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionTitle}>Cari hareketler</Text>
        {movements.map((m) => (
          <View key={m.id} style={styles.rowCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{TRADE_MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}</Text>
              <Text style={styles.rowMeta}>{m.note ?? new Date(m.created_at).toLocaleDateString('tr-TR')}</Text>
            </View>
            <Text style={[styles.rowAmount, m.movement_type === 'alacak' && { color: theme.success }]}>
              {m.movement_type === 'alacak' ? '−' : '+'}{formatTradeMoney(Number(m.amount))}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.cardElevated },
  title: { flex: 1, color: theme.text, fontSize: 20, fontWeight: '800' },
  balanceCard: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.cardBorderFocus,
  },
  balanceLabel: { color: theme.muted, fontSize: 12, fontWeight: '600' },
  balanceValue: { color: theme.accent, fontSize: 28, fontWeight: '800', marginTop: 4 },
  balanceHint: { color: theme.mutedSoft, fontSize: 12, marginTop: 6, lineHeight: 17 },
  infoRow: { marginBottom: 8 },
  infoLabel: { color: theme.mutedSoft, fontSize: 11, fontWeight: '600' },
  infoValue: { color: theme.text, fontSize: 15, marginTop: 2 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 14,
    marginVertical: 14,
  },
  primaryBtnText: { color: '#0f172a', fontWeight: '800', fontSize: 15 },
  sectionTitle: { color: theme.text, fontSize: 16, fontWeight: '800', marginTop: 10, marginBottom: 8 },
  input: {
    backgroundColor: theme.surfaceInput,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.text,
  },
  payBtn: { marginTop: 10, marginBottom: 8, backgroundColor: theme.successSoft, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(52,211,153,0.35)' },
  payBtnText: { color: theme.success, fontWeight: '800' },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  rowTitle: { color: theme.text, fontWeight: '700' },
  rowMeta: { color: theme.muted, fontSize: 12, marginTop: 2 },
  rowAmount: { color: theme.accent, fontWeight: '800' },
});
