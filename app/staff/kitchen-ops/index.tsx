import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { KitchenOpsHub } from '@/components/kitchenOps/KitchenOpsHub';
import { KitchenMoneyStat } from '@/components/kitchenOps/KitchenUi';
import { fetchCariNetBalance, fetchDaySummary, fetchUnresolvedAlertCount } from '@/lib/kitchenOps/api';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';
import { useAuthStore } from '@/stores/authStore';
import { canAccessKitchenOps } from '@/lib/staffPermissions';

const FINANCE_LINKS = [
  { label: 'Hasılat', route: '/staff/kitchen-ops/revenue', icon: 'cash-outline' as const, color: '#059669' },
  { label: 'Gider', route: '/staff/kitchen-ops/expenses', icon: 'receipt-outline' as const, color: '#ea580c' },
  { label: 'Personel', route: '/staff/kitchen-ops/personnel', icon: 'people-outline' as const, color: '#2563eb' },
  { label: 'Tedarikçi', route: '/staff/kitchen-ops/suppliers', icon: 'storefront-outline' as const, color: '#7c3aed' },
  { label: 'Cari', route: '/staff/kitchen-ops/cari', icon: 'swap-horizontal-outline' as const, color: '#0d9488' },
  { label: 'POS', route: '/staff/kitchen-ops/pos', icon: 'card-outline' as const, color: '#dc2626' },
  { label: 'Mahsup', route: '/staff/kitchen-ops/settlements', icon: 'hand-left-outline' as const, color: '#b45309' },
  { label: 'Teslim', route: '/staff/kitchen-ops/handovers', icon: 'swap-horizontal-outline' as const, color: '#0d9488' },
  { label: 'Finans', route: '/staff/kitchen-ops/finance', icon: 'pie-chart-outline' as const, color: '#4f46e5' },
];

export default function KitchenOpsHome() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const allowed = canAccessKitchenOps(staff);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [netRemaining, setNetRemaining] = useState(0);
  const [cariNet, setCariNet] = useState(0);

  const load = useCallback(async () => {
    const [alerts, summary, cari] = await Promise.all([
      fetchUnresolvedAlertCount().catch(() => 0),
      fetchDaySummary().catch(() => ({ net_remaining: 0 })),
      fetchCariNetBalance().catch(() => 0),
    ]);
    setAlertCount(alerts);
    setNetRemaining(Number(summary.net_remaining ?? 0));
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
        <Text style={styles.denied}>Mutfak operasyon modülüne erişim yetkiniz yok.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.summaryRow}>
        <KitchenMoneyStat label="Bugün net kalan" amount={netRemaining} highlight />
        <KitchenMoneyStat label="Cari net" amount={cariNet} />
      </View>

      <KitchenOpsHub alertCount={alertCount} onNavigate={(route) => router.push(route as never)} />

      <Text style={styles.sectionTitle}>Finans & Operasyon</Text>
      <View style={styles.financeGrid}>
        {FINANCE_LINKS.map((link) => (
          <TouchableOpacity key={link.route} style={styles.financeTile} onPress={() => router.push(link.route as never)} activeOpacity={0.85}>
            <View style={[styles.financeIcon, { backgroundColor: `${link.color}18` }]}>
              <Ionicons name={link.icon} size={22} color={link.color} />
            </View>
            <Text style={styles.financeLabel}>{link.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.dayCloseBanner} onPress={() => router.push('/staff/kitchen-ops/day-close' as never)} activeOpacity={0.9}>
        <Ionicons name="moon-outline" size={24} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={styles.dayCloseTitle}>Gün Sonu Kapanış</Text>
          <Text style={styles.dayCloseSub}>Günü kapatmadan çıkmayın</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#fff" />
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  denied: { marginTop: 12, fontSize: 15, color: theme.colors.textSecondary, textAlign: 'center' },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary, marginTop: 20, marginBottom: 8, marginLeft: 2 },
  financeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  financeTile: {
    width: '23%',
    minWidth: '22%',
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  financeIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  financeLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.text, textAlign: 'center' },
  dayCloseBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#4f46e5',
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
  },
  dayCloseTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  dayCloseSub: { color: '#c7d2fe', fontSize: 12, marginTop: 2 },
});
