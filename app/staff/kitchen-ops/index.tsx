import { useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { KitchenOpsHub } from '@/components/kitchenOps/KitchenOpsHub';
import { fetchCariNetBalance, fetchDaySummary, fetchUnresolvedAlertCount } from '@/lib/kitchenOps/api';
import { canAccessKitchenOps, canAccessKitchenReceptionAccounting } from '@/lib/staffPermissions';
import { useKitchenFinanceAccess } from '@/hooks/useKitchenFinanceAccess';
import { useCachedFocusLoad } from '@/hooks/useCachedFocusLoad';

type KitchenOpsHomeCache = {
  alertCount: number;
  netRemaining: number;
  cariNet: number;
  todayRevenue: number;
  todayExpenses: number;
};

const EMPTY: KitchenOpsHomeCache = {
  alertCount: 0,
  netRemaining: 0,
  cariNet: 0,
  todayRevenue: 0,
  todayExpenses: 0,
};

export default function KitchenOpsHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { staff, loading: financeAccessLoading, allowed: financeAllowed, hasKitchenOps } = useKitchenFinanceAccess();
  const canKitchen = canAccessKitchenOps(staff);
  const canReception = canAccessKitchenReceptionAccounting(staff);
  const allowed = canKitchen || canReception || financeAllowed;

  const cacheKey = `kitchen-ops-home:${staff?.id ?? 'none'}:${financeAllowed ? 'fin' : 'basic'}`;

  const fetchData = useCallback(async (): Promise<KitchenOpsHomeCache | null> => {
    const alerts = await fetchUnresolvedAlertCount().catch(() => 0);
    if (!financeAllowed) {
      return { ...EMPTY, alertCount: alerts };
    }
    const [summary, cari] = await Promise.all([
      fetchDaySummary().catch(() => ({ net_remaining: 0, total_revenue: 0, total_expenses: 0 })),
      fetchCariNetBalance().catch(() => 0),
    ]);
    return {
      alertCount: alerts,
      netRemaining: Number(summary.net_remaining ?? 0),
      todayRevenue: Number(summary.total_revenue ?? 0),
      todayExpenses: Number(summary.total_expenses ?? 0),
      cariNet: Number(cari),
    };
  }, [financeAllowed]);

  const { data, loading, refreshing, refresh, showContent } = useCachedFocusLoad<KitchenOpsHomeCache>({
    cacheKey,
    enabled: canKitchen && !financeAccessLoading,
    fetchData,
  });

  const metrics = data ?? EMPTY;

  useEffect(() => {
    if (financeAccessLoading) return;
    if (!canKitchen && financeAllowed) {
      router.replace('/staff/kitchen-ops/finance-bridge');
      return;
    }
    if (!canKitchen && canReception) {
      router.replace('/staff/kitchen-ops/reception');
      return;
    }
  }, [canKitchen, canReception, financeAllowed, financeAccessLoading, router]);

  if (financeAccessLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={48} color={theme.colors.textMuted} />
        <Text style={styles.deniedTitle}>Erişim yok</Text>
        <Text style={styles.denied}>Mutfak, finans veya reception muhasebe yetkisi gerekir.</Text>
      </View>
    );
  }

  if (!canKitchen) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (loading && !showContent) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Mutfak özeti yükleniyor…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      <KitchenOpsHub
        alertCount={metrics.alertCount}
        netRemaining={metrics.netRemaining}
        cariNet={metrics.cariNet}
        todayRevenue={metrics.todayRevenue}
        todayExpenses={metrics.todayExpenses}
        staffName={staff?.full_name}
        showFinance={financeAllowed}
        showFinanceBridge={financeAllowed || canReception}
        onNavigate={(route) => router.push(route as never)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: theme.colors.backgroundSecondary },
  deniedTitle: { marginTop: 12, fontSize: 17, fontWeight: '800', color: theme.colors.text },
  denied: { marginTop: 6, fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  loadingText: { marginTop: 12, fontSize: 14, color: theme.colors.textMuted },
});
