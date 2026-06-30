import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
  BackHandler,
} from 'react-native';
import { useRouter, useNavigation, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { navigateAdminKitchenOpsHubBack } from '@/lib/adminStackBack';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import { fetchDaySummary, fetchUnresolvedAlertCount } from '@/lib/kitchenOps/api';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';

const LINKS = [
  { href: '/admin/kitchen-ops/finance-access', icon: 'shield-checkmark-outline' as const, label: 'Finans erişimi', color: '#4f46e5' },
  { href: '/admin/kitchen-ops/revenue-notify', icon: 'notifications-outline' as const, label: 'Hasılat bildirimleri', color: '#0d9488' },
  { href: '/admin/kitchen-ops/menu-order-notify', icon: 'bag-handle-outline' as const, label: 'Menü sipariş bildirimleri', color: '#d97706' },
  { href: '/admin/kitchen-ops/reports', icon: 'bar-chart-outline' as const, label: 'Raporlar', color: '#2563eb' },
  { href: '/admin/kitchen-ops/reception', icon: 'checkmark-done-outline' as const, label: 'Reception Kontrol', color: '#059669' },
  { href: '/admin/kitchen-ops/categories', icon: 'grid-outline' as const, label: 'Kategoriler', color: '#7c3aed' },
  { href: '/admin/kitchen-ops/settings', icon: 'settings-outline' as const, label: 'Limitler & Ayarlar', color: '#b45309' },
  { href: '/staff/kitchen-ops/finance-bridge', icon: 'git-compare-outline' as const, label: 'Mutfak ↔ Resepsiyon Finans', color: '#4f46e5' },
  { href: '/staff/kitchen-ops', icon: 'restaurant-outline' as const, label: 'Mutfak Paneli', color: '#ea580c' },
  { href: '/staff/kitchen-ops/shortages', icon: 'clipboard-outline' as const, label: 'Mutfak Eksikleri', color: '#E67E22' },
];

export default function AdminKitchenOpsHome() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const orgScoped = useAdminOrganizationQueryScope();
  const headerPadTop = Platform.OS === 'ios' ? insets.top : insets.top + 8;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState({ net_remaining: 0, total_revenue: 0, total_expenses: 0 });
  const [alerts, setAlerts] = useState(0);
  const [wasteCount, setWasteCount] = useState(0);

  const goBack = useCallback(() => {
    navigateAdminKitchenOpsHubBack(router, navigation);
  }, [navigation, router]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        goBack();
        return true;
      });
      return () => sub.remove();
    }, [goBack])
  );

  const load = useCallback(async () => {
    const [s, a] = await Promise.all([
      fetchDaySummary().catch(() => ({ net_remaining: 0, total_revenue: 0, total_expenses: 0 })),
      fetchUnresolvedAlertCount().catch(() => 0),
    ]);
    setSummary(s);
    setAlerts(a);

    let q = supabase.from('kitchen_stock_movements').select('id', { count: 'exact', head: true }).eq('movement_type', 'waste');
    if (orgScoped) q = q.eq('organization_id', orgScoped);
    const { count } = await q;
    setWasteCount(count ?? 0);
  }, [orgScoped]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const pageHeader = (
    <View style={[styles.pageHeader, { paddingTop: headerPadTop }]}>
      <TouchableOpacity style={styles.backRow} onPress={goBack} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Geri">
        <Ionicons name="arrow-back" size={22} color="#0f172a" />
        <Text style={styles.backLabel}>Geri</Text>
      </TouchableOpacity>
      <Text style={styles.pageTitle}>Mutfak Operasyon Yönetimi</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        {pageHeader}
        <View style={styles.center}>
          <ActivityIndicator size="large" color={adminTheme.colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {pageHeader}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Bugün hasılat</Text>
            <Text style={styles.statValue}>{fmtKitchenMoney(Number(summary.total_revenue))}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Net kalan</Text>
            <Text style={[styles.statValue, { color: adminTheme.colors.primary }]}>
              {fmtKitchenMoney(Number(summary.net_remaining))}
            </Text>
          </View>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Açık alarm</Text>
            <Text style={[styles.statValue, alerts > 0 && { color: '#dc2626' }]}>{alerts}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Zayi kayıtları</Text>
            <Text style={styles.statValue}>{wasteCount}</Text>
          </View>
        </View>

        {LINKS.map((link) => (
          <TouchableOpacity
            key={link.href}
            style={styles.linkRow}
            onPress={() => router.push(link.href as never)}
            activeOpacity={0.85}
          >
            <View style={[styles.linkIcon, { backgroundColor: `${link.color}18` }]}>
              <Ionicons name={link.icon} size={22} color={link.color} />
            </View>
            <Text style={styles.linkLabel}>{link.label}</Text>
            <Ionicons name="chevron-forward" size={20} color={adminTheme.colors.textMuted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  scroll: { flex: 1 },
  pageHeader: {
    backgroundColor: adminTheme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: adminTheme.colors.borderLight,
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
    marginBottom: 8,
  },
  backLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: adminTheme.colors.text,
    lineHeight: 26,
  },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCard: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
  },
  statLabel: { fontSize: 12, color: adminTheme.colors.textMuted, fontWeight: '600' },
  statValue: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.text, marginTop: 4 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
  },
  linkIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  linkLabel: { flex: 1, fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
});
