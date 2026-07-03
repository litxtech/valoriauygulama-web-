import { useCallback } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, Text, Pressable } from 'react-native';
import { theme } from '@/constants/theme';
import { fetchDaySummary, fetchCariNetBalance } from '@/lib/kitchenOps/api';
import type { KitchenDaySummary } from '@/lib/kitchenOps/types';
import { EMPTY_KITCHEN_DAY_SUMMARY } from '@/lib/kitchenOps/types';
import { KitchenMoneyStat } from '@/components/kitchenOps/KitchenUi';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';
import { KitchenFinancePrintBar } from '@/components/kitchenOps/KitchenPrintBar';
import { KitchenFinanceAccessGate } from '@/components/kitchenOps/KitchenFinanceAccessGate';
import { useCachedFocusLoad } from '@/hooks/useCachedFocusLoad';

type FinanceCache = {
  summary: KitchenDaySummary;
  cariNet: number;
  loadError: string | null;
};

export default function KitchenFinanceScreen() {
  const fetchData = useCallback(async (): Promise<FinanceCache | null> => {
    try {
      const [s, c] = await Promise.all([
        fetchDaySummary(),
        fetchCariNetBalance().catch(() => 0),
      ]);
      return { summary: s, cariNet: c, loadError: null };
    } catch (e) {
      return {
        summary: EMPTY_KITCHEN_DAY_SUMMARY,
        cariNet: 0,
        loadError: e instanceof Error ? e.message : 'Finans özeti alınamadı',
      };
    }
  }, []);

  const { data, loading, refreshing, refresh, showContent } = useCachedFocusLoad<FinanceCache>({
    cacheKey: 'kitchen-finance-summary',
    fetchData,
  });

  const summary = data?.summary ?? EMPTY_KITCHEN_DAY_SUMMARY;
  const cariNet = data?.cariNet ?? 0;
  const loadError = data?.loadError ?? null;

  if (loading && !showContent) {
    return (
      <KitchenFinanceAccessGate>
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      </KitchenFinanceAccessGate>
    );
  }

  return (
    <KitchenFinanceAccessGate>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      {loadError ? (
        <Pressable style={styles.errorBox} onPress={refresh}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Text style={styles.errorRetry}>Yeniden dene</Text>
        </Pressable>
      ) : null}
      <KitchenFinancePrintBar defaultOpen />
      <Text style={styles.title}>Bugünkü Finans Özeti</Text>
      <View style={styles.grid}>
        <KitchenMoneyStat label="Toplam hasılat" amount={summary.total_revenue} />
        <KitchenMoneyStat label="POS toplamı" amount={summary.total_pos} />
        <KitchenMoneyStat label="Nakit" amount={summary.total_cash} />
        <KitchenMoneyStat label="Toplam gider" amount={summary.total_expenses} />
        <KitchenMoneyStat label="Personel gideri" amount={summary.personnel_expenses} />
        <KitchenMoneyStat label="Tedarikçi borcu" amount={summary.supplier_debt} />
        <KitchenMoneyStat label="Cari net" amount={cariNet} />
        <KitchenMoneyStat label="Net kalan" amount={summary.net_remaining} highlight />
      </View>
      <View style={styles.formula}>
        <Text style={styles.formulaTitle}>Temiz kalan para</Text>
        <Text style={styles.formulaText}>
          Hasılat ({fmtKitchenMoney(summary.total_revenue)}) − Gider ({fmtKitchenMoney(summary.total_expenses)}) − Personel ({fmtKitchenMoney(summary.personnel_expenses)}) = {fmtKitchenMoney(summary.net_remaining)}
        </Text>
      </View>
    </ScrollView>
    </KitchenFinanceAccessGate>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  formula: { marginTop: 20, backgroundColor: theme.colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: theme.colors.borderLight },
  formulaTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginBottom: 8 },
  formulaText: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 20 },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: { color: '#dc2626', fontSize: 13, fontWeight: '600' },
  errorRetry: { color: '#b91c1c', fontSize: 12, fontWeight: '700', marginTop: 6 },
});
