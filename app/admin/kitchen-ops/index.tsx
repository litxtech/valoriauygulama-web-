import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import { fetchDaySummary, fetchUnresolvedAlertCount } from '@/lib/kitchenOps/api';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';

const LINKS = [
  { href: '/admin/kitchen-ops/reports', icon: 'bar-chart-outline' as const, label: 'Raporlar', color: '#2563eb' },
  { href: '/admin/kitchen-ops/reception', icon: 'checkmark-done-outline' as const, label: 'Reception Kontrol', color: '#059669' },
  { href: '/admin/kitchen-ops/categories', icon: 'grid-outline' as const, label: 'Kategoriler', color: '#7c3aed' },
  { href: '/admin/kitchen-ops/settings', icon: 'settings-outline' as const, label: 'Limitler & Ayarlar', color: '#b45309' },
  { href: '/staff/kitchen-ops', icon: 'restaurant-outline' as const, label: 'Mutfak Paneli', color: '#ea580c' },
  { href: '/staff/kitchen-ops/shortages', icon: 'clipboard-outline' as const, label: 'Mutfak Eksikleri', color: '#E67E22' },
];

export default function AdminKitchenOpsHome() {
  const router = useRouter();
  const orgScoped = useAdminOrganizationQueryScope();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState({ net_remaining: 0, total_revenue: 0, total_expenses: 0 });
  const [alerts, setAlerts] = useState(0);
  const [wasteCount, setWasteCount] = useState(0);

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

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={adminTheme.colors.primary} /></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Bugün hasılat</Text>
          <Text style={styles.statValue}>{fmtKitchenMoney(Number(summary.total_revenue))}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Net kalan</Text>
          <Text style={[styles.statValue, { color: adminTheme.colors.primary }]}>{fmtKitchenMoney(Number(summary.net_remaining))}</Text>
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
        <TouchableOpacity key={link.href} style={styles.linkRow} onPress={() => router.push(link.href as never)} activeOpacity={0.85}>
          <View style={[styles.linkIcon, { backgroundColor: `${link.color}18` }]}>
            <Ionicons name={link.icon} size={22} color={link.color} />
          </View>
          <Text style={styles.linkLabel}>{link.label}</Text>
          <Ionicons name="chevron-forward" size={20} color={adminTheme.colors.textMuted} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCard: { flex: 1, backgroundColor: adminTheme.colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: adminTheme.colors.borderLight },
  statLabel: { fontSize: 12, color: adminTheme.colors.textMuted, fontWeight: '600' },
  statValue: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.text, marginTop: 4 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: adminTheme.colors.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: adminTheme.colors.borderLight },
  linkIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  linkLabel: { flex: 1, fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
});
