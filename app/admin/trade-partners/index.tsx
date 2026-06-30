import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TradePartnerAdminGate } from '@/components/tradePartner/TradePartnerAdminGate';
import { useTradePartnerProviderOrgId } from '@/hooks/useTradePartnerProviderOrgId';
import {
  fetchTradePartners,
  fetchTradeTransactions,
  formatTradeMoney,
  type TradePartnerRow,
  type TradeTransactionRow,
} from '@/lib/tradePartner';
import { tradePartnerTheme as theme } from '@/lib/tradePartnerTheme';
import { TRADE_TX_STATUS_LABELS } from '@/lib/tradePartnerTheme';

export default function AdminTradePartnersHubScreen() {
  return (
    <TradePartnerAdminGate>
      <AdminTradePartnersHub />
    </TradePartnerAdminGate>
  );
}

function AdminTradePartnersHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orgId, loading: orgLoading } = useTradePartnerProviderOrgId();
  const [partners, setPartners] = useState<TradePartnerRow[]>([]);
  const [transactions, setTransactions] = useState<TradeTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [p, t] = await Promise.all([fetchTradePartners(orgId), fetchTradeTransactions(orgId)]);
      setPartners(p);
      setTransactions(t);
    } catch {
      setPartners([]);
      setTransactions([]);
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    if (orgId) void load();
  }, [orgId, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const pendingCount = useMemo(
    () => transactions.filter((t) => t.status === 'pending_approval').length,
    [transactions]
  );

  const disputedCount = useMemo(
    () => transactions.filter((t) => t.status === 'disputed').length,
    [transactions]
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Yeni modül</Text>
          <Text style={styles.title}>Partner Ticaret</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/admin/trade-partners/new')}>
          <Ionicons name="add" size={22} color="#0f172a" />
        </TouchableOpacity>
      </View>

      {orgLoading || loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        >
          <View style={styles.statsRow}>
            <StatTile label="Partner" value={String(partners.length)} />
            <StatTile label="Onay bekleyen" value={String(pendingCount)} accent={pendingCount > 0} />
            <StatTile label="İtiraz" value={String(disputedCount)} accent={disputedCount > 0} danger />
          </View>

          <View style={styles.actionsRow}>
            <ActionChip
              icon="business-outline"
              label="Partner listesi"
              onPress={() => router.push('/admin/trade-partners/partners')}
            />
            <ActionChip
              icon="document-text-outline"
              label="İşlem oluştur"
              onPress={() => router.push('/admin/trade-partners/transactions/new')}
            />
          </View>

          <Text style={styles.sectionTitle}>Son işlemler</Text>
          {transactions.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={32} color={theme.muted} />
              <Text style={styles.emptyText}>Henüz işlem yok</Text>
            </View>
          ) : (
            transactions.slice(0, 12).map((tx) => (
              <TouchableOpacity
                key={tx.id}
                style={styles.txCard}
                onPress={() => router.push(`/admin/trade-partners/transactions/${tx.id}`)}
                activeOpacity={0.85}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.txPartner}>{tx.partner_trade_partners?.company_name ?? 'Partner'}</Text>
                  <Text style={styles.txMeta}>{TRADE_TX_STATUS_LABELS[tx.status] ?? tx.status}</Text>
                </View>
                <Text style={styles.txAmount}>{formatTradeMoney(Number(tx.total_amount))}</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function StatTile({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && { color: theme.accent }, danger && accent && { color: theme.danger }]}>
        {value}
      </Text>
    </View>
  );
}

function ActionChip({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.actionChip} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name={icon} size={18} color={theme.accent} />
      <Text style={styles.actionChipText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10, marginBottom: 4 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.cardElevated,
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.accent,
  },
  eyebrow: { color: theme.accent, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { color: theme.text, fontSize: 24, fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statTile: {
    flex: 1,
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  statLabel: { color: theme.mutedSoft, fontSize: 11, fontWeight: '600' },
  statValue: { color: theme.text, fontSize: 20, fontWeight: '800', marginTop: 4 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: theme.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.35)',
  },
  actionChipText: { color: theme.text, fontWeight: '700', fontSize: 14 },
  sectionTitle: { color: theme.text, fontSize: 17, fontWeight: '800', marginBottom: 10 },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { color: theme.muted, fontSize: 14 },
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  txPartner: { color: theme.text, fontWeight: '700', fontSize: 15 },
  txMeta: { color: theme.muted, fontSize: 12, marginTop: 2 },
  txAmount: { color: theme.accent, fontWeight: '800', fontSize: 15 },
});
