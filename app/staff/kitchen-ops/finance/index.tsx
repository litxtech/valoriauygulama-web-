import { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, Text } from 'react-native';
import { theme } from '@/constants/theme';
import { fetchDaySummary, fetchCariNetBalance } from '@/lib/kitchenOps/api';
import type { KitchenDaySummary } from '@/lib/kitchenOps/types';
import { KitchenMoneyStat } from '@/components/kitchenOps/KitchenUi';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';
import { KitchenPrintBar } from '@/components/kitchenOps/KitchenPrintBar';

export default function KitchenFinanceScreen() {
  const [summary, setSummary] = useState<KitchenDaySummary | null>(null);
  const [cariNet, setCariNet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [s, c] = await Promise.all([fetchDaySummary(), fetchCariNetBalance()]);
    setSummary(s);
    setCariNet(c);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  if (loading || !summary) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <KitchenPrintBar kind="finance_daily" />
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
});
