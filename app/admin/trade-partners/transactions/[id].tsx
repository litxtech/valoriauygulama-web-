import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { TradePartnerAdminGate } from '@/components/tradePartner/TradePartnerAdminGate';
import { formatTradeMoney, type TradeTransactionRow } from '@/lib/tradePartner';
import { tradePartnerTheme as theme, TRADE_TX_STATUS_LABELS } from '@/lib/tradePartnerTheme';

export default function AdminTradeTransactionDetailScreen() {
  return (
    <TradePartnerAdminGate>
      <AdminTradeTransactionDetail />
    </TradePartnerAdminGate>
  );
}

function AdminTradeTransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tx, setTx] = useState<TradeTransactionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('partner_trade_transactions')
      .select('*, partner_trade_partners(company_name), partner_trade_transaction_items(*)')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) setTx(null);
    else setTx(data as TradeTransactionRow);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!tx) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <Text style={{ color: theme.muted }}>İşlem bulunamadı</Text>
      </View>
    );
  }

  const items = [...(tx.partner_trade_transaction_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>İşlem detayı</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }} tintColor={theme.accent} />}
      >
        <Text style={styles.partner}>{tx.partner_trade_partners?.company_name ?? 'Partner'}</Text>
        <Text style={styles.status}>{TRADE_TX_STATUS_LABELS[tx.status] ?? tx.status}</Text>
        {tx.reference_code ? <Text style={styles.meta}>Ref: {tx.reference_code}</Text> : null}
        {tx.notes ? <Text style={styles.meta}>{tx.notes}</Text> : null}
        {tx.partner_dispute_note ? (
          <View style={styles.disputeBox}>
            <Text style={styles.disputeTitle}>İtiraz notu</Text>
            <Text style={styles.disputeText}>{tx.partner_dispute_note}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Kalemler</Text>
        {items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{item.description}</Text>
              <Text style={styles.itemMeta}>
                {item.quantity} {item.unit_label} × {formatTradeMoney(Number(item.unit_price))}
              </Text>
            </View>
            <Text style={styles.itemAmount}>{formatTradeMoney(Number(item.line_total))}</Text>
          </View>
        ))}

        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Toplam</Text>
          <Text style={styles.totalValue}>{formatTradeMoney(Number(tx.total_amount))}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.cardElevated },
  title: { color: theme.text, fontSize: 20, fontWeight: '800' },
  partner: { color: theme.text, fontSize: 22, fontWeight: '800' },
  status: { color: theme.accent, fontWeight: '700', marginTop: 4 },
  meta: { color: theme.muted, marginTop: 6, lineHeight: 20 },
  disputeBox: { marginTop: 12, backgroundColor: theme.dangerSoft, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(248,113,113,0.35)' },
  disputeTitle: { color: theme.danger, fontWeight: '800' },
  disputeText: { color: theme.text, marginTop: 4, lineHeight: 20 },
  sectionTitle: { color: theme.text, fontSize: 16, fontWeight: '800', marginTop: 16, marginBottom: 8 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  itemTitle: { color: theme.text, fontWeight: '700' },
  itemMeta: { color: theme.muted, fontSize: 12, marginTop: 2 },
  itemAmount: { color: theme.accent, fontWeight: '800' },
  totalCard: { marginTop: 8, backgroundColor: theme.cardElevated, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.cardBorderFocus },
  totalLabel: { color: theme.muted, fontSize: 12 },
  totalValue: { color: theme.text, fontSize: 24, fontWeight: '800', marginTop: 4 },
});
