import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { KitchenOpsHub } from '@/components/kitchenOps/KitchenOpsHub';
import { fetchCariNetBalance, fetchDaySummary, fetchUnresolvedAlertCount } from '@/lib/kitchenOps/api';
import { useAuthStore } from '@/stores/authStore';
import { canAccessKitchenOps } from '@/lib/staffPermissions';

export default function KitchenOpsHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const staff = useAuthStore((s) => s.staff);
  const allowed = canAccessKitchenOps(staff);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [netRemaining, setNetRemaining] = useState(0);
  const [cariNet, setCariNet] = useState(0);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [todayExpenses, setTodayExpenses] = useState(0);

  const load = useCallback(async () => {
    const [alerts, summary, cari] = await Promise.all([
      fetchUnresolvedAlertCount().catch(() => 0),
      fetchDaySummary().catch(() => ({ net_remaining: 0, total_revenue: 0, total_expenses: 0 })),
      fetchCariNetBalance().catch(() => 0),
    ]);
    setAlertCount(alerts);
    setNetRemaining(Number(summary.net_remaining ?? 0));
    setTodayRevenue(Number(summary.total_revenue ?? 0));
    setTodayExpenses(Number(summary.total_expenses ?? 0));
    setCariNet(Number(cari));
  }, []);

  useEffect(() => {
    if (!allowed) return;
    load().finally(() => setLoading(false));
  }, [allowed, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!allowed) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={48} color={theme.colors.textMuted} />
        <Text style={styles.deniedTitle}>Erişim yok</Text>
        <Text style={styles.denied}>Mutfak operasyon modülüne yetkiniz bulunmuyor.</Text>
      </View>
    );
  }

  if (loading) {
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      <KitchenOpsHub
        alertCount={alertCount}
        netRemaining={netRemaining}
        cariNet={cariNet}
        todayRevenue={todayRevenue}
        todayExpenses={todayExpenses}
        staffName={staff?.full_name}
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
