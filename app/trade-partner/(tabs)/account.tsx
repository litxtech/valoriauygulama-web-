import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTradePartnerAuthStore } from '@/stores/tradePartnerAuthStore';
import { useAuthStore } from '@/stores/authStore';
import { fetchPartnerPortalLedger, formatTradeMoney } from '@/lib/tradePartner';
import { tradePartnerTheme as theme, TRADE_MOVEMENT_LABELS } from '@/lib/tradePartnerTheme';

export default function TradePartnerAccountScreen() {
  const insets = useSafeAreaInsets();
  const partner = useTradePartnerAuthStore((s) => s.partner);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchPartnerPortalLedger>>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchPartnerPortalLedger());
      await useTradePartnerAuthStore.getState().resolvePartner(useAuthStore.getState().user);
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Cari hesap</Text>
        <Text style={styles.company}>{partner?.companyName ?? '—'}</Text>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Bakiye (borç)</Text>
        <Text style={styles.balanceValue}>{formatTradeMoney(partner?.balance ?? 0)}</Text>
        <Text style={styles.balanceHint}>Onaylanan işlemler borç; yapılan ödemeler alacak olarak düşer.</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }} tintColor={theme.accent} />}
        >
          <Text style={styles.sectionTitle}>Hareketler</Text>
          {rows.length === 0 ? (
            <Text style={styles.empty}>Henüz cari hareket yok.</Text>
          ) : (
            rows.map((m) => (
              <View key={m.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{TRADE_MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}</Text>
                  <Text style={styles.rowMeta}>{m.note ?? new Date(m.created_at).toLocaleDateString('tr-TR')}</Text>
                </View>
                <Text style={[styles.rowAmount, m.movement_type === 'alacak' && { color: theme.success }]}>
                  {m.movement_type === 'alacak' ? '−' : '+'}{formatTradeMoney(Number(m.amount))}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: 16, marginBottom: 8 },
  title: { color: theme.text, fontSize: 24, fontWeight: '800' },
  company: { color: theme.muted, marginTop: 4 },
  balanceCard: {
    marginHorizontal: 16,
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.cardBorderFocus,
  },
  balanceLabel: { color: theme.muted, fontSize: 12, fontWeight: '600' },
  balanceValue: { color: theme.accent, fontSize: 28, fontWeight: '800', marginTop: 4 },
  balanceHint: { color: theme.mutedSoft, fontSize: 12, marginTop: 6, lineHeight: 17 },
  sectionTitle: { color: theme.text, fontSize: 16, fontWeight: '800', marginBottom: 8 },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 24 },
  row: {
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
